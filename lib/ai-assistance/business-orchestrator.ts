import "server-only";
import { randomUUID } from "node:crypto";
import { AiRequestOutcome, DocumentRequestStatus, Prisma } from "@prisma/client";
import { classifyAiBusinessIntent, type AiBusinessIntent } from "@/lib/ai-assistance/business-intent";
import { answerTenantKnowledgeQuestion } from "@/lib/ai-assistance/knowledge-assistant";
import { assertKnowledgeQuestionIsMinimized, normalizeAiQuestion, redactAiContentForAudit } from "@/lib/ai-assistance/privacy";
import { recordAiDeniedRequest, requireAiRuntimeAccess, type AiExperience } from "@/lib/ai-assistance/runtime-policy";
import { roleSnapshotForRoles } from "@/lib/authorization/effective-access";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { money, shortDate } from "@/lib/utils";

type BusinessSource = {
  documentId: string;
  title: string;
  category: string;
  reference: string | null;
  effectiveAt: Date | null;
};

type BusinessAnswer = {
  answer: string;
  sources: BusinessSource[];
  outcome?: AiRequestOutcome;
  denialReason?: string | null;
  action: string;
};

const TENANT_SOURCE: BusinessSource = { documentId: "hoa-tenant-profile", title: "HOAHub Tenant Profile", category: "Tenant configuration", reference: "/admin/settings", effectiveAt: null };
const ORGANIZATION_SOURCE: BusinessSource = { documentId: "hoa-organization", title: "HOAHub Association Organization", category: "Association profile", reference: "/admin/organization", effectiveAt: null };
const HOMEOWNERS_SOURCE: BusinessSource = { documentId: "hoa-admin-homeowners", title: "HOAHub Homeowner Directory", category: "Tenant residents", reference: "/admin/homeowners", effectiveAt: null };
const PAYMENTS_SOURCE: BusinessSource = { documentId: "hoa-admin-payments", title: "HOAHub Payment History", category: "Tenant finance", reference: "/admin/payments", effectiveAt: null };
const RECEIVABLES_SOURCE: BusinessSource = { documentId: "hoa-admin-receivables", title: "HOAHub Homeowner Balances", category: "Tenant finance", reference: "/admin/reports/homeowner-balances", effectiveAt: null };
const DOCUMENT_REQUESTS_SOURCE: BusinessSource = { documentId: "hoa-admin-document-requests", title: "HOAHub Document Requests", category: "Resident services", reference: "/admin/documents/requests", effectiveAt: null };
const COMPLAINTS_SOURCE: BusinessSource = { documentId: "hoa-admin-complaints", title: "HOAHub Complaints", category: "Resident services", reference: "/admin/complaints", effectiveAt: null };
const PAYROLL_SOURCE: BusinessSource = { documentId: "hoa-admin-payroll", title: "HOAHub Payroll", category: "Payroll", reference: "/admin/payroll", effectiveAt: null };
const ATTENDANCE_SOURCE: BusinessSource = { documentId: "hoa-admin-attendance", title: "HOAHub Attendance", category: "Attendance", reference: "/admin/attendance", effectiveAt: null };
const EMPLOYEES_SOURCE: BusinessSource = { documentId: "hoa-admin-employees", title: "HOAHub Employee Directory", category: "Employees", reference: "/admin/employees", effectiveAt: null };
const COMMUNITY_SOURCE: BusinessSource = { documentId: "hoa-community", title: "HOAHub Community Updates", category: "Community", reference: "/admin/announcements", effectiveAt: null };

const MONTH_LOOKUP: Record<string, { month: number; label: string }> = {
  jan: { month: 1, label: "January" }, january: { month: 1, label: "January" },
  feb: { month: 2, label: "February" }, february: { month: 2, label: "February" },
  mar: { month: 3, label: "March" }, march: { month: 3, label: "March" },
  apr: { month: 4, label: "April" }, april: { month: 4, label: "April" },
  may: { month: 5, label: "May" },
  jun: { month: 6, label: "June" }, june: { month: 6, label: "June" },
  jul: { month: 7, label: "July" }, july: { month: 7, label: "July" },
  aug: { month: 8, label: "August" }, august: { month: 8, label: "August" },
  sep: { month: 9, label: "September" }, sept: { month: 9, label: "September" }, september: { month: 9, label: "September" },
  oct: { month: 10, label: "October" }, october: { month: 10, label: "October" },
  nov: { month: 11, label: "November" }, november: { month: 11, label: "November" },
  dec: { month: 12, label: "December" }, december: { month: 12, label: "December" },
};

function permissionSet(permissions: readonly string[]) {
  return new Set(permissions);
}

function hasAnyPermission(permissions: readonly string[], required: readonly string[]) {
  const set = permissionSet(permissions);
  return required.some((permission) => set.has(permission));
}

function tenantLocalDateString(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function tenantDateRange() {
  const dateString = tenantLocalDateString();
  const start = new Date(`${dateString}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 86_400_000);
  return { dateString, start, end };
}

function tenantMonthStart() {
  const dateString = tenantLocalDateString();
  return new Date(`${dateString.slice(0, 7)}-01T00:00:00+08:00`);
}

function requestedMonthRange(question: string) {
  const match = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/i.exec(question);
  if (!match) return null;
  const monthInfo = MONTH_LOOKUP[match[1].toLowerCase()];
  if (!monthInfo) return null;
  const year = Number(match[2]);
  const monthText = String(monthInfo.month).padStart(2, "0");
  const nextMonth = monthInfo.month === 12 ? 1 : monthInfo.month + 1;
  const nextYear = monthInfo.month === 12 ? year + 1 : year;
  const nextMonthText = String(nextMonth).padStart(2, "0");
  return {
    start: new Date(`${year}-${monthText}-01T00:00:00+08:00`),
    end: new Date(`${nextYear}-${nextMonthText}-01T00:00:00+08:00`),
    label: `${monthInfo.label} ${year}`,
  };
}

function blockFilter(question: string) {
  return /\bblock\s+([a-z0-9-]+)\b/i.exec(question)?.[1]?.trim() || null;
}

function lotFilter(question: string) {
  return /\blot\s+([a-z0-9-]+)\b/i.exec(question)?.[1]?.trim() || null;
}

function requestedPaymentMethod(question: string) {
  if (/\bgcash\b/i.test(question)) return "GCASH" as const;
  if (/\bbank\s*transfer\b/i.test(question)) return "BANK_TRANSFER" as const;
  if (/\bcheck\b/i.test(question)) return "CHECK" as const;
  if (/\bcash\b/i.test(question)) return "CASH" as const;
  return null;
}

function dateFilterForQuestion(question: string, field: "paymentDate" | "dueDate" | "requestedAt" | "submittedAt" | "date") {
  const requestedMonth = requestedMonthRange(question);
  if (requestedMonth) return { [field]: { gte: requestedMonth.start, lt: requestedMonth.end } };
  if (/\b(today|this day)\b/i.test(question)) {
    const { start, end } = tenantDateRange();
    return { [field]: { gte: start, lt: end } };
  }
  if (/\b(this month|month to date|mtd|current month)\b/i.test(question)) {
    return { [field]: { gte: tenantMonthStart() } };
  }
  return {};
}

function paymentPeriodLabel(question: string) {
  const requestedMonth = requestedMonthRange(question);
  if (requestedMonth) return requestedMonth.label;
  if (/\b(today|this day)\b/i.test(question)) return tenantLocalDateString();
  if (/\b(this month|month to date|mtd|current month)\b/i.test(question)) {
    return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "long", year: "numeric" }).format(new Date());
  }
  return null;
}

async function conversationForBusiness(input: { tenantId: string; actorId: string; actorRoleSnapshot: string; retentionDays: number; conversationId?: string | null }) {
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

async function recordBusinessAnswer(input: {
  tenantId: string;
  actorId: string;
  conversationId: string;
  requestId: string;
  started: number;
  answer: BusinessAnswer;
  intent: AiBusinessIntent;
}) {
  await prisma.$transaction([
    prisma.aiMessage.create({
      data: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        role: "ASSISTANT",
        contentRedacted: redactAiContentForAudit(input.answer.answer),
        privacyClassification: "INTERNAL",
        sourceDocumentIds: [],
      },
    }),
    prisma.aiUsageLedger.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        requestId: input.requestId,
        provider: "HOAHUB",
        model: "business-service-orchestrator",
        latencyMs: Date.now() - input.started,
        outcome: input.answer.outcome ?? AiRequestOutcome.SUCCEEDED,
        denialReason: input.answer.denialReason ?? null,
      },
    }),
    prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        module: "AI_ASSISTANCE",
        action: input.answer.action,
        entityType: "AiConversation",
        entityId: input.conversationId,
        metadata: {
          requestId: input.requestId,
          intent: input.intent,
          businessServiceOrchestration: true,
          sourceRefs: input.answer.sources.map((source) => source.documentId),
        },
      },
    }),
  ]);
}

function permissionDenied(message: string, action: string): BusinessAnswer {
  return { answer: message, sources: [], outcome: AiRequestOutcome.REFUSED, denialReason: "BUSINESS_SERVICE_PERMISSION_DENIED", action };
}

async function answerTenantProfile(tenantId: string): Promise<BusinessAnswer> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, shortName: true, address: true, contactNumber: true, email: true, status: true, subscriptionPlan: true, subscriptionStatus: true, timezone: true, currency: true },
  });
  if (!tenant) return { answer: "I could not find the active tenant profile.", sources: [TENANT_SOURCE], action: "AI_BUSINESS_TENANT_PROFILE" };
  const details = [
    `Association: ${tenant.name}${tenant.shortName ? ` (${tenant.shortName})` : ""}`,
    tenant.address ? `Address: ${tenant.address}` : null,
    tenant.contactNumber ? `Contact: ${tenant.contactNumber}` : null,
    tenant.email ? `Email: ${tenant.email}` : null,
    `Tenant status: ${tenant.status}`,
    `Subscription: ${tenant.subscriptionPlan} / ${tenant.subscriptionStatus}`,
    `Timezone: ${tenant.timezone}`,
    `Currency: ${tenant.currency}`,
  ].filter(Boolean);
  return { answer: `Current HOAHub tenant information:\n\n${details.join("\n")}`, sources: [TENANT_SOURCE], action: "AI_BUSINESS_TENANT_PROFILE" };
}

async function answerOrganization(tenantId: string, question: string): Promise<BusinessAnswer> {
  const role = /\b(president|vice president|secretary|treasurer|auditor|director|officer|board|committee)\b/i.exec(question)?.[1]?.toLowerCase();
  const now = new Date();
  const officers = await prisma.organizationOfficer.findMany({
    where: {
      tenantId,
      active: true,
      archivedAt: null,
      effectiveDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gt: now } }],
      ...(role && !["officer", "board", "committee"].includes(role) ? { position: { contains: role } } : {}),
    },
    orderBy: [{ displayOrder: "asc" }, { position: "asc" }, { fullName: "asc" }],
    take: role && !["officer", "board", "committee"].includes(role) ? 8 : 20,
    select: { fullName: true, position: true, committee: true, effectiveDate: true, endDate: true },
  });
  if (!officers.length) {
    return { answer: role ? `I could not find a currently active ${role} in this tenant's organization setup.` : "I could not find active organization officers in this tenant.", sources: [ORGANIZATION_SOURCE], action: "AI_BUSINESS_ORGANIZATION" };
  }
  const lines = officers.map((officer, index) => `${index + 1}. ${officer.fullName} — ${officer.position}${officer.committee ? ` (${officer.committee})` : ""}`);
  return { answer: `${role ? `Current ${role} record` : "Current active association officers"}:\n\n${lines.join("\n")}`, sources: [ORGANIZATION_SOURCE], action: "AI_BUSINESS_ORGANIZATION" };
}

async function answerHomeowners(tenantId: string, permissions: readonly string[], question: string): Promise<BusinessAnswer> {
  if (!hasAnyPermission(permissions, [Permission.HOMEOWNERS_READ, Permission.HOMEOWNERS_MANAGE])) {
    return permissionDenied("I cannot show tenant homeowner records because your role does not include homeowner read/manage permission.", "AI_BUSINESS_HOMEOWNERS_DENIED");
  }
  const block = blockFilter(question);
  const lot = lotFilter(question);
  const status = /\binactive\b/i.test(question) ? "INACTIVE" as const : /\bactive\b/i.test(question) ? "ACTIVE" as const : undefined;
  const where: Prisma.HomeownerProfileWhereInput = { tenantId, ...(block ? { block: { equals: block } } : {}), ...(lot ? { lot: { equals: lot } } : {}), ...(status ? { status } : {}) };
  const [records, total] = await Promise.all([
    prisma.homeownerProfile.findMany({
      where,
      orderBy: [{ block: "asc" }, { lot: "asc" }, { user: { name: "asc" } }],
      take: 25,
      select: { accountNumber: true, block: true, lot: true, status: true, monthlyDuesAmount: true, address: true, phone: true, user: { select: { name: true, email: true } } },
    }),
    prisma.homeownerProfile.count({ where }),
  ]);
  if (!records.length) return { answer: "I did not find homeowner records matching that tenant-scoped filter.", sources: [HOMEOWNERS_SOURCE], action: "AI_BUSINESS_HOMEOWNERS" };
  const includeContact = /\b(contact|phone|email|address)\b/i.test(question) && permissionSet(permissions).has(Permission.HOMEOWNERS_MANAGE);
  const lines = records.map((profile, index) => {
    const base = `${index + 1}. ${profile.user.name} — ${homeownerAccountNumber(profile)}, Block ${profile.block}, Lot ${profile.lot}, ${profile.status}, standard dues ${money(profile.monthlyDuesAmount)}`;
    if (!includeContact) return base;
    return `${base}, ${profile.address}, ${profile.phone || profile.user.email || "no contact on file"}`;
  });
  return {
    answer: [`I found ${total} matching homeowner record${total === 1 ? "" : "s"}. Showing ${records.length}:`, lines.join("\n"), total > records.length ? `${total - records.length} more records match. Open Homeowners for the complete result.` : "Personal contact fields are minimized unless explicitly requested by a role with homeowner-management permission."].join("\n\n"),
    sources: [HOMEOWNERS_SOURCE],
    action: "AI_BUSINESS_HOMEOWNERS",
  };
}

async function answerPayments(tenantId: string, permissions: readonly string[], question: string): Promise<BusinessAnswer> {
  if (!hasAnyPermission(permissions, [Permission.PAYMENTS_READ, Permission.PAYMENTS_MANAGE, Permission.REPORTS_FINANCIAL])) {
    return permissionDenied("I cannot show tenant payment transactions because your role does not include payment/report permission.", "AI_BUSINESS_PAYMENTS_DENIED");
  }
  const block = blockFilter(question);
  const lot = lotFilter(question);
  const method = requestedPaymentMethod(question);
  const paymentWhere: Prisma.PaymentWhereInput = {
    tenantId,
    status: "ACTIVE",
    ...dateFilterForQuestion(question, "paymentDate"),
    ...(method ? { method } : {}),
    ...((block || lot) ? { homeowner: { ...(block ? { block: { equals: block } } : {}), ...(lot ? { lot: { equals: lot } } : {}) } } : {}),
  };

  if (/\bmonthly\s+dues?\b/i.test(question)) {
    const allocationWhere: Prisma.PaymentAllocationWhereInput = {
      tenantId,
      payment: paymentWhere,
      bill: { tenantId, recurringChargeType: "MONTHLY_DUES", archivedAt: null },
    };
    const [allocated, legacyDirect] = await Promise.all([
      prisma.paymentAllocation.aggregate({ where: allocationWhere, _sum: { amount: true }, _count: { _all: true } }),
      prisma.payment.aggregate({
        where: {
          ...paymentWhere,
          allocations: { none: {} },
          bill: { is: { tenantId, recurringChargeType: "MONTHLY_DUES", archivedAt: null } },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);
    const allocatedTotal = Number(allocated._sum.amount || 0);
    const legacyTotal = Number(legacyDirect._sum.amount || 0);
    const total = allocatedTotal + legacyTotal;
    const entryCount = allocated._count._all + legacyDirect._count._all;
    const period = paymentPeriodLabel(question);
    if (!entryCount) {
      return { answer: `I did not find active monthly dues collections${period ? ` for ${period}` : ""} matching that tenant filter.`, sources: [PAYMENTS_SOURCE], action: "AI_BUSINESS_MONTHLY_DUES_COLLECTION" };
    }
    return {
      answer: [`Monthly dues collections${period ? ` for ${period}` : ""} total ${money(total)}.`, `Calculated from ${allocated._count._all} monthly-dues payment allocation${allocated._count._all === 1 ? "" : "s"}${legacyDirect._count._all ? ` plus ${legacyDirect._count._all} legacy direct monthly-dues payment${legacyDirect._count._all === 1 ? "" : "s"}` : ""}.`, "Only active payments in the signed-in tenant are included; voided payments and non-monthly-dues charges are excluded."].join("\n\n"),
      sources: [PAYMENTS_SOURCE],
      action: "AI_BUSINESS_MONTHLY_DUES_COLLECTION",
    };
  }

  const where = paymentWhere;
  const [records, aggregate] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      take: 20,
      select: { id: true, amount: true, paymentDate: true, method: true, receiptNumber: true, referenceNumber: true, paymentCoverageDisplay: true, remarks: true, homeowner: { select: { block: true, lot: true, user: { select: { name: true } } } } },
    }),
    prisma.payment.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  if (!records.length) return { answer: "I did not find active tenant payment transactions matching that filter.", sources: [PAYMENTS_SOURCE], action: "AI_BUSINESS_PAYMENTS" };
  const lines = records.map((payment, index) => `${index + 1}. ${shortDate(payment.paymentDate)} — ${payment.homeowner.user.name} (Block ${payment.homeowner.block}, Lot ${payment.homeowner.lot}) — ${money(payment.amount)} via ${payment.method.replaceAll("_", " ")}${payment.receiptNumber ? `, receipt ${payment.receiptNumber}` : payment.referenceNumber ? `, ref ${payment.referenceNumber}` : ""}${payment.paymentCoverageDisplay ? `, coverage ${payment.paymentCoverageDisplay}` : ""}`);
  return { answer: [`Matched ${aggregate._count._all} active payment transaction${aggregate._count._all === 1 ? "" : "s"} totaling ${money(Number(aggregate._sum.amount || 0))}.`, `Showing latest ${records.length}:\n${lines.join("\n")}`, "Open Payment History / Receipt Register for full transaction evidence and official receipt actions."].join("\n\n"), sources: [PAYMENTS_SOURCE], action: "AI_BUSINESS_PAYMENTS" };
}

async function answerReceivables(tenantId: string, permissions: readonly string[], question: string): Promise<BusinessAnswer> {
  if (!hasAnyPermission(permissions, [Permission.BILLING_READ, Permission.BILLING_MANAGE, Permission.REPORTS_FINANCIAL])) {
    return permissionDenied("I cannot show tenant billing/receivable records because your role does not include billing/report permission.", "AI_BUSINESS_RECEIVABLES_DENIED");
  }
  const block = blockFilter(question);
  const lot = lotFilter(question);
  const overdue = /\b(overdue|arrears?|past due)\b/i.test(question);
  const { start: todayStart } = tenantDateRange();
  const where: Prisma.BillWhereInput = {
    tenantId,
    archivedAt: null,
    balance: { gt: 0 },
    ...(overdue ? { dueDate: { lt: todayStart } } : {}),
    ...((block || lot) ? { homeowner: { ...(block ? { block: { equals: block } } : {}), ...(lot ? { lot: { equals: lot } } : {}) } } : {}),
  };
  const [records, aggregate] = await Promise.all([
    prisma.bill.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { balance: "desc" }],
      take: 20,
      select: { billingMonth: true, dueDate: true, totalAmount: true, amountPaid: true, balance: true, status: true, notes: true, homeowner: { select: { block: true, lot: true, user: { select: { name: true } } } } },
    }),
    prisma.bill.aggregate({ where, _sum: { balance: true, totalAmount: true, amountPaid: true }, _count: { _all: true } }),
  ]);
  if (!records.length) return { answer: `I did not find ${overdue ? "overdue " : "open "}receivable records matching that tenant filter.`, sources: [RECEIVABLES_SOURCE], action: "AI_BUSINESS_RECEIVABLES" };
  const lines = records.map((bill, index) => `${index + 1}. ${bill.homeowner.user.name} (Block ${bill.homeowner.block}, Lot ${bill.homeowner.lot}) — balance ${money(bill.balance)}, due ${shortDate(bill.dueDate)}, status ${bill.status.replaceAll("_", " ")}`);
  return { answer: [`${overdue ? "Overdue" : "Open"} receivables: ${money(Number(aggregate._sum.balance || 0))} across ${aggregate._count._all} bill${aggregate._count._all === 1 ? "" : "s"}.`, `Showing first ${records.length}:\n${lines.join("\n")}`, "Use Homeowner Balances / Billing Management for complete ledger review before collection action."].join("\n\n"), sources: [RECEIVABLES_SOURCE], action: "AI_BUSINESS_RECEIVABLES" };
}

async function answerDocumentRequests(tenantId: string, permissions: readonly string[], question: string): Promise<BusinessAnswer> {
  if (!hasAnyPermission(permissions, [Permission.DOCUMENTS_READ, Permission.DOCUMENTS_MANAGE, Permission.DOCUMENTS_APPROVE])) {
    return permissionDenied("I cannot show tenant document requests because your role does not include document permission.", "AI_BUSINESS_DOCUMENT_REQUESTS_DENIED");
  }
  const pendingStatuses = [DocumentRequestStatus.SUBMITTED, DocumentRequestStatus.PAYMENT_PENDING, DocumentRequestStatus.PENDING_PAYMENT, DocumentRequestStatus.PAYMENT_CONFIRMED, DocumentRequestStatus.PENDING_APPROVAL, DocumentRequestStatus.UNDER_REVIEW, DocumentRequestStatus.RETURNED_FOR_CORRECTION, DocumentRequestStatus.GENERATING];
  const pendingOnly = /\b(pending|waiting|open|for approval|under review)\b/i.test(question);
  const where: Prisma.DocumentRequestWhereInput = { tenantId, archivedAt: null, ...(pendingOnly ? { status: { in: pendingStatuses } } : {}), ...dateFilterForQuestion(question, "requestedAt") };
  const [records, total, statusCounts] = await Promise.all([
    prisma.documentRequest.findMany({
      where,
      orderBy: [{ requestedAt: "desc" }, { updatedAt: "desc" }],
      take: 15,
      select: { documentNumber: true, status: true, requestedAt: true, type: true, purpose: true, homeowner: { select: { block: true, lot: true, user: { select: { name: true } } } }, definition: { select: { displayName: true } }, configuration: { select: { displayName: true } } },
    }),
    prisma.documentRequest.count({ where }),
    prisma.documentRequest.groupBy({ by: ["status"], where: { tenantId, archivedAt: null }, _count: { _all: true } }),
  ]);
  const summary = statusCounts.sort((a, b) => b._count._all - a._count._all).map((item) => `${item.status.replaceAll("_", " ")}: ${item._count._all}`).join(", ");
  if (!records.length) return { answer: `I did not find ${pendingOnly ? "pending " : ""}document requests matching that filter. Current tenant request status counts: ${summary || "none"}.`, sources: [DOCUMENT_REQUESTS_SOURCE], action: "AI_BUSINESS_DOCUMENT_REQUESTS" };
  const lines = records.map((request, index) => `${index + 1}. ${request.definition?.displayName || request.configuration?.displayName || request.type || "Document request"} — ${request.homeowner.user.name} (Block ${request.homeowner.block}, Lot ${request.homeowner.lot}) — ${request.status.replaceAll("_", " ")}${request.documentNumber ? `, ${request.documentNumber}` : ""}, requested ${shortDate(request.requestedAt)}`);
  return { answer: [`${total} matching document request${total === 1 ? "" : "s"}. Tenant status summary: ${summary || "none"}.`, `Latest ${records.length}:\n${lines.join("\n")}`, "Open Document Requests for approval, payment, generation, release, and audit actions."].join("\n\n"), sources: [DOCUMENT_REQUESTS_SOURCE], action: "AI_BUSINESS_DOCUMENT_REQUESTS" };
}

async function answerComplaints(tenantId: string, permissions: readonly string[], question: string): Promise<BusinessAnswer> {
  if (!permissionSet(permissions).has(Permission.COMPLAINTS_MANAGE)) {
    return permissionDenied("I cannot show tenant complaint records because your role does not include complaint-management permission.", "AI_BUSINESS_COMPLAINTS_DENIED");
  }
  const where: Prisma.ComplaintWhereInput = { tenantId, ...dateFilterForQuestion(question, "submittedAt") };
  const [records, total, statusCounts] = await Promise.all([
    prisma.complaint.findMany({ where, orderBy: [{ updatedAt: "desc" }, { submittedAt: "desc" }], take: 12, select: { title: true, complaintNumber: true, publicReference: true, status: true, priority: true, severity: true, submittedAt: true } }),
    prisma.complaint.count({ where }),
    prisma.complaint.groupBy({ by: ["status"], where: { tenantId }, _count: { _all: true } }),
  ]);
  const summary = statusCounts.sort((a, b) => b._count._all - a._count._all).map((item) => `${item.status.replaceAll("_", " ")}: ${item._count._all}`).join(", ");
  if (!records.length) return { answer: `I did not find complaint records matching that filter. Current status counts: ${summary || "none"}.`, sources: [COMPLAINTS_SOURCE], action: "AI_BUSINESS_COMPLAINTS" };
  const lines = records.map((item, index) => `${index + 1}. ${item.title} — ${item.status.replaceAll("_", " ")}, ${item.priority} priority, ${item.severity} severity (${item.complaintNumber || item.publicReference}), submitted ${shortDate(item.submittedAt)}`);
  return { answer: [`${total} matching complaint record${total === 1 ? "" : "s"}. Tenant status summary: ${summary || "none"}.`, `Latest ${records.length}:\n${lines.join("\n")}`, "Complaint identity/privacy controls still apply; use Complaint Management for confidential identity access and consequential decisions."].join("\n\n"), sources: [COMPLAINTS_SOURCE], action: "AI_BUSINESS_COMPLAINTS" };
}

async function answerPayroll(tenantId: string, permissions: readonly string[]): Promise<BusinessAnswer> {
  if (!permissionSet(permissions).has(Permission.PAYROLL_MANAGE)) {
    return permissionDenied("I cannot show payroll records because your role does not include payroll-management permission.", "AI_BUSINESS_PAYROLL_DENIED");
  }
  const periods = await prisma.payrollPeriod.findMany({ where: { tenantId }, orderBy: [{ payDate: "desc" }, { createdAt: "desc" }], take: 5, select: { id: true, startDate: true, endDate: true, payDate: true, status: true, pendingRevisionType: true, pendingRevisionReason: true, _count: { select: { payslips: true, revisions: true } } } });
  if (!periods.length) return { answer: "I did not find payroll periods for this tenant.", sources: [PAYROLL_SOURCE], action: "AI_BUSINESS_PAYROLL" };
  const latest = periods[0];
  const totals = await prisma.payslip.aggregate({ where: { tenantId, payrollId: latest.id }, _sum: { grossPay: true, deduction: true, netPay: true }, _count: { _all: true } });
  const lines = periods.map((period, index) => `${index + 1}. ${shortDate(period.startDate)}–${shortDate(period.endDate)}, pay date ${shortDate(period.payDate)} — ${period.status.replaceAll("_", " ")} — ${period._count.payslips} payslip${period._count.payslips === 1 ? "" : "s"}, ${period._count.revisions} revision${period._count.revisions === 1 ? "" : "s"}${period.pendingRevisionType ? `, pending ${period.pendingRevisionType}${period.pendingRevisionReason ? ` (${period.pendingRevisionReason})` : ""}` : ""}`);
  return { answer: [`Latest payroll totals: gross ${money(Number(totals._sum.grossPay || 0))}, deductions ${money(Number(totals._sum.deduction || 0))}, net ${money(Number(totals._sum.netPay || 0))} across ${totals._count._all} payslip${totals._count._all === 1 ? "" : "s"}.`, `Recent payroll periods:\n${lines.join("\n")}`, "Payroll values are restricted to payroll-authorized roles and remain read-only through AI; use Payroll Management for lifecycle actions."].join("\n\n"), sources: [PAYROLL_SOURCE], action: "AI_BUSINESS_PAYROLL" };
}

async function answerAttendance(tenantId: string, permissions: readonly string[]): Promise<BusinessAnswer> {
  if (!hasAnyPermission(permissions, [Permission.ATTENDANCE_MANAGE, Permission.PAYROLL_MANAGE])) {
    return permissionDenied("I cannot show attendance records because your role does not include attendance/payroll permission.", "AI_BUSINESS_ATTENDANCE_DENIED");
  }
  const { dateString, start, end } = tenantDateRange();
  const [records, statusCounts] = await Promise.all([
    prisma.attendance.findMany({ where: { tenantId, date: { gte: start, lt: end } }, orderBy: [{ status: "asc" }, { employee: { name: "asc" } }], take: 30, select: { status: true, timeIn: true, timeOut: true, totalHours: true, lateMinutes: true, undertimeMinutes: true, employee: { select: { employeeNumber: true, name: true, position: true } } } }),
    prisma.attendance.groupBy({ by: ["status"], where: { tenantId, date: { gte: start, lt: end } }, _count: { _all: true } }),
  ]);
  const summary = statusCounts.map((item) => `${item.status.replaceAll("_", " ")}: ${item._count._all}`).join(", ");
  if (!records.length) return { answer: `No attendance records are recorded for ${dateString}.`, sources: [ATTENDANCE_SOURCE], action: "AI_BUSINESS_ATTENDANCE" };
  const lines = records.map((item, index) => `${index + 1}. ${item.employee.name} (${item.employee.position}) — ${item.status.replaceAll("_", " ")}${item.timeIn ? `, in ${item.timeIn}` : ""}${item.timeOut ? `, out ${item.timeOut}` : ""}${item.lateMinutes ? `, ${item.lateMinutes} min late` : ""}${item.undertimeMinutes ? `, ${item.undertimeMinutes} min undertime` : ""}`);
  return { answer: [`Attendance for ${dateString}: ${summary || `${records.length} records`}.`, `Showing ${records.length}:\n${lines.join("\n")}`, "Use Attendance Management for corrections, approvals, and audit history."].join("\n\n"), sources: [ATTENDANCE_SOURCE], action: "AI_BUSINESS_ATTENDANCE" };
}

async function answerEmployees(tenantId: string, permissions: readonly string[], question: string): Promise<BusinessAnswer> {
  if (!hasAnyPermission(permissions, [Permission.ATTENDANCE_MANAGE, Permission.PAYROLL_MANAGE])) {
    return permissionDenied("I cannot show employee records because your role does not include attendance/payroll permission.", "AI_BUSINESS_EMPLOYEES_DENIED");
  }
  const status = /\binactive\b/i.test(question) ? "INACTIVE" as const : /\bactive\b/i.test(question) ? "ACTIVE" as const : undefined;
  const where: Prisma.EmployeeProfileWhereInput = { tenantId, ...(status ? { status } : {}) };
  const [records, total] = await Promise.all([
    prisma.employeeProfile.findMany({ where, orderBy: [{ status: "asc" }, { name: "asc" }], take: 30, select: { employeeNumber: true, name: true, position: true, status: true, hireDate: true } }),
    prisma.employeeProfile.count({ where }),
  ]);
  if (!records.length) return { answer: "I did not find employee records matching that tenant filter.", sources: [EMPLOYEES_SOURCE], action: "AI_BUSINESS_EMPLOYEES" };
  const lines = records.map((employee, index) => `${index + 1}. ${employee.name} — ${employee.employeeNumber}, ${employee.position}, ${employee.status}, hired ${shortDate(employee.hireDate)}`);
  return { answer: [`${total} matching employee record${total === 1 ? "" : "s"}. Showing ${records.length}:`, lines.join("\n"), "Salary, statutory, deduction, and payroll details are not included in the general roster unless the question is handled through the payroll-authorized service."].join("\n\n"), sources: [EMPLOYEES_SOURCE], action: "AI_BUSINESS_EMPLOYEES" };
}

async function answerCommunity(tenantId: string): Promise<BusinessAnswer> {
  const today = tenantDateRange().start;
  const [announcements, events] = await Promise.all([
    prisma.announcement.findMany({ where: { tenantId, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 5, select: { title: true, type: true, content: true, createdAt: true } }),
    prisma.event.findMany({ where: { tenantId, status: "PUBLISHED", eventDate: { gte: today } }, orderBy: [{ eventDate: "asc" }, { startTime: "asc" }], take: 5, select: { title: true, eventDate: true, eventTime: true, startTime: true, endTime: true, location: true } }),
  ]);
  const announcementLines = announcements.map((item, index) => `${index + 1}. ${item.title} — ${item.type.replaceAll("_", " ")}, posted ${shortDate(item.createdAt)}${item.content ? `: ${item.content.replace(/\s+/g, " ").slice(0, 140)}${item.content.length > 140 ? "…" : ""}` : ""}`);
  const eventLines = events.map((item, index) => `${index + 1}. ${item.title} — ${shortDate(item.eventDate)} ${item.startTime && item.endTime ? `${item.startTime}-${item.endTime}` : item.eventTime}, ${item.location}`);
  return { answer: [announcementLines.length ? `Latest published announcements:\n${announcementLines.join("\n")}` : "No published announcements were found.", eventLines.length ? `Upcoming published events:\n${eventLines.join("\n")}` : "No upcoming published events were found."].join("\n\n"), sources: [COMMUNITY_SOURCE], action: "AI_BUSINESS_COMMUNITY" };
}

async function answerIntent(intent: AiBusinessIntent, tenantId: string, permissions: readonly string[], question: string): Promise<BusinessAnswer> {
  switch (intent) {
    case "RESIDENT_PRIVACY_DENY":
      return {
        answer: "I cannot provide another homeowner's private information or a resident directory from a homeowner account. I can help with your own profile, property, dues, payments, receipts, requests, complaints, resident-visible association information, and documents the HOA has approved for resident AI use.",
        sources: [],
        outcome: AiRequestOutcome.REFUSED,
        denialReason: "RESIDENT_OTHER_RECORDS_NOT_AUTHORIZED",
        action: "AI_BUSINESS_RESIDENT_PRIVACY_REFUSAL",
      };
    case "STAFF_TENANT_PROFILE": return answerTenantProfile(tenantId);
    case "STAFF_ORGANIZATION": return answerOrganization(tenantId, question);
    case "STAFF_HOMEOWNERS": return answerHomeowners(tenantId, permissions, question);
    case "STAFF_PAYMENTS": return answerPayments(tenantId, permissions, question);
    case "STAFF_RECEIVABLES": return answerReceivables(tenantId, permissions, question);
    case "STAFF_DOCUMENT_REQUESTS": return answerDocumentRequests(tenantId, permissions, question);
    case "STAFF_COMPLAINTS": return answerComplaints(tenantId, permissions, question);
    case "STAFF_PAYROLL": return answerPayroll(tenantId, permissions);
    case "STAFF_ATTENDANCE": return answerAttendance(tenantId, permissions);
    case "STAFF_EMPLOYEES": return answerEmployees(tenantId, permissions, question);
    case "STAFF_COMMUNITY": return answerCommunity(tenantId);
    default:
      throw new Error(`Unsupported business intent: ${intent}`);
  }
}

export async function tryAnswerAiBusinessQuestion(input: { experience: AiExperience; question: unknown; conversationId?: string | null }) {
  const intent = classifyAiBusinessIntent(input.experience, input.question);
  if (!intent) return null;

  if (intent === "RESIDENT_OPERATIONAL" || intent === "STAFF_EXISTING_OPERATIONAL") {
    return answerTenantKnowledgeQuestion(input);
  }

  const requestId = randomUUID();
  const started = Date.now();
  const access = await requireAiRuntimeAccess(input.experience, requestId);
  const tenantId = access.user.tenantId;
  const actorId = access.user.id;
  let question: string;
  try {
    question = assertKnowledgeQuestionIsMinimized(normalizeAiQuestion(input.question));
  } catch (error) {
    await recordAiDeniedRequest({ tenantId, actorId, requestId, reason: error instanceof Error ? error.message : "PRIVACY_INPUT_BLOCKED", outcome: AiRequestOutcome.REFUSED });
    throw error;
  }

  const conversation = await conversationForBusiness({
    tenantId,
    actorId,
    actorRoleSnapshot: roleSnapshotForRoles(access.user.roles),
    retentionDays: access.governance.retentionDays,
    conversationId: input.conversationId,
  });
  await prisma.aiMessage.create({ data: { tenantId, conversationId: conversation.id, role: "USER", contentRedacted: redactAiContentForAudit(question), privacyClassification: "INTERNAL" } });

  const answer = await answerIntent(intent, tenantId, access.user.permissions, question);
  await recordBusinessAnswer({ tenantId, actorId, conversationId: conversation.id, requestId, started, answer, intent });
  return { conversationId: conversation.id, answer: answer.answer, sources: answer.sources, requestId };
}
