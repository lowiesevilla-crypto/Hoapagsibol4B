import "server-only";
import { randomUUID } from "node:crypto";
import { AiRequestOutcome, Prisma } from "@prisma/client";
import { assertKnowledgeQuestionIsMinimized, normalizeAiQuestion, redactAiContentForAudit } from "@/lib/ai-assistance/privacy";
import { classifyStaffFinanceQuery, parseStaffFinanceDateRange, type StaffFinanceDateRange, type StaffFinanceQueryKind } from "@/lib/ai-assistance/staff-finance-query";
import { recordAiDeniedRequest, requireAiRuntimeAccess } from "@/lib/ai-assistance/runtime-policy";
import { roleSnapshotForRoles } from "@/lib/authorization/effective-access";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { money, shortDate } from "@/lib/utils";

const PAYMENTS_SOURCE = { documentId: "hoa-admin-payments", title: "HOAHub Payment History", category: "Tenant finance", reference: "/admin/payments", effectiveAt: null };
const COLLECTIONS_SOURCE = { documentId: "hoa-admin-collections", title: "HOAHub Collections", category: "Tenant finance", reference: "/admin/collections", effectiveAt: null };

type FinanceAnswer = {
  answer: string;
  sources: Array<typeof PAYMENTS_SOURCE>;
  action: string;
  outcome?: AiRequestOutcome;
  denialReason?: string | null;
};

function permissionSet(permissions: readonly string[]) {
  return new Set(permissions);
}

function hasFinanceReadPermission(permissions: readonly string[]) {
  const set = permissionSet(permissions);
  return [Permission.PAYMENTS_READ, Permission.PAYMENTS_MANAGE, Permission.REPORTS_FINANCIAL, Permission.COLLECTIONS_MANAGE].some((permission) => set.has(permission));
}

function rangeFilter(range: StaffFinanceDateRange | null, field: "paymentDate" | "collectionDate") {
  return range ? { [field]: { gte: range.start, lt: range.end } } : {};
}

function describeRange(range: StaffFinanceDateRange | null) {
  return range?.label || "all recorded dates";
}

async function conversationForFinance(input: { tenantId: string; actorId: string; actorRoleSnapshot: string; retentionDays: number; conversationId?: string | null }) {
  if (input.conversationId) {
    const existing = await prisma.aiConversation.findFirst({
      where: {
        tenantId: input.tenantId,
        id: input.conversationId,
        actorId: input.actorId,
        actorRole: input.actorRoleSnapshot,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
    });
    if (!existing) throw new Error("AI conversation is unavailable in the active tenant, user, or role session.");
    return existing;
  }
  return prisma.aiConversation.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorRole: input.actorRoleSnapshot,
      expiresAt: new Date(Date.now() + input.retentionDays * 86_400_000),
    },
  });
}

function deniedAnswer(): FinanceAnswer {
  return {
    answer: "I cannot show tenant collection totals because your role does not include payment, collection, or financial-report permission.",
    sources: [],
    action: "AI_STAFF_FINANCE_DENIED",
    outcome: AiRequestOutcome.REFUSED,
    denialReason: "STAFF_FINANCE_PERMISSION_DENIED",
  };
}

async function answerMonthlyDuesCollection(tenantId: string, question: string, range: StaffFinanceDateRange | null): Promise<FinanceAnswer> {
  const paymentDate = rangeFilter(range, "paymentDate");
  const allocationWhere: Prisma.PaymentAllocationWhereInput = {
    tenantId,
    payment: { status: "ACTIVE", ...paymentDate },
    bill: { recurringChargeType: "MONTHLY_DUES" },
  };
  const directWhere: Prisma.PaymentWhereInput = {
    tenantId,
    status: "ACTIVE",
    ...paymentDate,
    bill: { recurringChargeType: "MONTHLY_DUES" },
    allocations: { none: {} },
  };

  const [allocated, direct, allocationRows, directRows] = await Promise.all([
    prisma.paymentAllocation.aggregate({ where: allocationWhere, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.aggregate({ where: directWhere, _sum: { amount: true }, _count: { _all: true } }),
    prisma.paymentAllocation.findMany({
      where: allocationWhere,
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        amount: true,
        coverageLabel: true,
        coverageYear: true,
        coverageMonth: true,
        payment: { select: { paymentDate: true, method: true, receiptNumber: true, referenceNumber: true } },
        bill: { select: { homeowner: { select: { block: true, lot: true, user: { select: { name: true } } } } } },
      },
    }),
    prisma.payment.findMany({
      where: directWhere,
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      take: 12,
      select: { amount: true, paymentDate: true, method: true, receiptNumber: true, referenceNumber: true, paymentCoverageDisplay: true, homeowner: { select: { block: true, lot: true, user: { select: { name: true } } } } },
    }),
  ]);

  const allocatedAmount = Number(allocated._sum.amount || 0);
  const directAmount = Number(direct._sum.amount || 0);
  const total = allocatedAmount + directAmount;
  const entries = allocated._count._all + direct._count._all;
  const period = describeRange(range);

  if (!entries) {
    return {
      answer: `No active Monthly Dues collection was recorded for ${period} in this tenant. Total: ${money(0)}.`,
      sources: [PAYMENTS_SOURCE],
      action: "AI_STAFF_MONTHLY_DUES_COLLECTION",
    };
  }

  const allocatedLines = allocationRows.map((row, index) => {
    const receipt = row.payment.receiptNumber ? `, receipt ${row.payment.receiptNumber}` : row.payment.referenceNumber ? `, ref ${row.payment.referenceNumber}` : "";
    const coverage = row.coverageLabel || (row.coverageMonth && row.coverageYear ? `${row.coverageYear}-${String(row.coverageMonth).padStart(2, "0")}` : null);
    return `${index + 1}. ${shortDate(row.payment.paymentDate)} — ${row.bill.homeowner.user.name} (Block ${row.bill.homeowner.block}, Lot ${row.bill.homeowner.lot}) — ${money(row.amount)} via ${row.payment.method.replaceAll("_", " ")}${receipt}${coverage ? `, dues coverage ${coverage}` : ""}`;
  });
  const directLines = directRows.map((row, index) => {
    const receipt = row.receiptNumber ? `, receipt ${row.receiptNumber}` : row.referenceNumber ? `, ref ${row.referenceNumber}` : "";
    return `${allocatedLines.length + index + 1}. ${shortDate(row.paymentDate)} — ${row.homeowner.user.name} (Block ${row.homeowner.block}, Lot ${row.homeowner.lot}) — ${money(row.amount)} via ${row.method.replaceAll("_", " ")}${receipt}${row.paymentCoverageDisplay ? `, coverage ${row.paymentCoverageDisplay}` : ""}`;
  });
  const lines = [...allocatedLines, ...directLines].slice(0, 12);

  return {
    answer: [`Monthly Dues collection for ${period}: ${money(total)} across ${entries} recorded dues allocation${entries === 1 ? "" : "s"}.`, lines.length ? `Latest matching entries:\n${lines.join("\n")}` : "", "This total is tenant-scoped and includes only active payments allocated to MONTHLY_DUES. Voided payments and non-dues collections are excluded."].filter(Boolean).join("\n\n"),
    sources: [PAYMENTS_SOURCE],
    action: "AI_STAFF_MONTHLY_DUES_COLLECTION",
  };
}

async function answerTotalCollection(tenantId: string, range: StaffFinanceDateRange | null): Promise<FinanceAnswer> {
  const paymentWhere: Prisma.PaymentWhereInput = { tenantId, status: "ACTIVE", ...rangeFilter(range, "paymentDate") };
  const collectionWhere: Prisma.CollectionWhereInput = { tenantId, ...rangeFilter(range, "collectionDate") };
  const [payments, collections] = await Promise.all([
    prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true }, _count: { _all: true } }),
    prisma.collection.aggregate({ where: collectionWhere, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const paymentAmount = Number(payments._sum.amount || 0);
  const collectionAmount = Number(collections._sum.amount || 0);
  const total = paymentAmount + collectionAmount;
  const period = describeRange(range);
  return {
    answer: [`Total tenant collection for ${period}: ${money(total)}.`, `Breakdown: homeowner payments ${money(paymentAmount)} across ${payments._count._all} active transaction${payments._count._all === 1 ? "" : "s"}; other HOA collections ${money(collectionAmount)} across ${collections._count._all} collection record${collections._count._all === 1 ? "" : "s"}.`, "Voided homeowner payments are excluded. This result is calculated only from the signed-in tenant's finance records."].join("\n\n"),
    sources: [PAYMENTS_SOURCE, COLLECTIONS_SOURCE],
    action: "AI_STAFF_TOTAL_COLLECTION",
  };
}

async function answerFinance(kind: StaffFinanceQueryKind, tenantId: string, permissions: readonly string[], question: string): Promise<FinanceAnswer> {
  if (!hasFinanceReadPermission(permissions)) return deniedAnswer();
  const range = parseStaffFinanceDateRange(question);
  if (kind === "MONTHLY_DUES_COLLECTION") return answerMonthlyDuesCollection(tenantId, question, range);
  return answerTotalCollection(tenantId, range);
}

export async function tryAnswerStaffFinanceQuestion(input: { experience: "STAFF"; question: unknown; conversationId?: string | null }) {
  const initialKind = classifyStaffFinanceQuery(input.question);
  if (!initialKind) return null;

  const requestId = randomUUID();
  const started = Date.now();
  const access = await requireAiRuntimeAccess("STAFF", requestId);
  const tenantId = access.user.tenantId;
  const actorId = access.user.id;

  let question: string;
  try {
    question = assertKnowledgeQuestionIsMinimized(normalizeAiQuestion(input.question));
  } catch (error) {
    await recordAiDeniedRequest({ tenantId, actorId, requestId, reason: error instanceof Error ? error.message : "PRIVACY_INPUT_BLOCKED", outcome: AiRequestOutcome.REFUSED });
    throw error;
  }

  const kind = classifyStaffFinanceQuery(question);
  if (!kind) return null;
  const conversation = await conversationForFinance({
    tenantId,
    actorId,
    actorRoleSnapshot: roleSnapshotForRoles(access.user.roles),
    retentionDays: access.governance.retentionDays,
    conversationId: input.conversationId,
  });

  await prisma.aiMessage.create({ data: { tenantId, conversationId: conversation.id, role: "USER", contentRedacted: redactAiContentForAudit(question), privacyClassification: "INTERNAL" } });
  const answer = await answerFinance(kind, tenantId, access.user.permissions, question);
  const range = parseStaffFinanceDateRange(question);

  await prisma.$transaction([
    prisma.aiMessage.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        role: "ASSISTANT",
        contentRedacted: redactAiContentForAudit(answer.answer),
        privacyClassification: "INTERNAL",
        sourceDocumentIds: [],
      },
    }),
    prisma.aiUsageLedger.create({
      data: {
        tenantId,
        actorId,
        requestId,
        provider: "HOAHUB",
        model: "staff-finance-orchestrator",
        latencyMs: Date.now() - started,
        outcome: answer.outcome ?? AiRequestOutcome.SUCCEEDED,
        denialReason: answer.denialReason ?? null,
      },
    }),
    prisma.auditLog.create({
      data: {
        tenantId,
        actorId,
        module: "AI_ASSISTANCE",
        action: answer.action,
        entityType: "AiConversation",
        entityId: conversation.id,
        metadata: {
          requestId,
          financeQueryKind: kind,
          tenantScoped: true,
          dateRange: range ? { start: range.start.toISOString(), end: range.end.toISOString(), label: range.label } : null,
          sourceRefs: answer.sources.map((source) => source.documentId),
        },
      },
    }),
  ]);

  return { conversationId: conversation.id, answer: answer.answer, sources: answer.sources, requestId };
}
