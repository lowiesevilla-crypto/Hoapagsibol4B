import { BillStatus, HomeownerStatus, NotificationType, Prisma, RecurringChargeType } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { getAppUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";

type Actor = { id: string; tenantId: string; name: string; email: string };
type HomeownerCandidate = Prisma.HomeownerProfileGetPayload<{ include: { user: true } }>;

const billingWriteBatchSize = 250;
const billingAuditBatchSize = 250;
const billingNotificationBatchSize = 50;

export const billingGenerationScopes = ["ALL", "HOMEOWNER", "SELECTED", "BLOCK", "PHASE"] as const;
export type BillingGenerationScope = (typeof billingGenerationScopes)[number];

export type BillingGenerationInput = {
  actor: Actor;
  coverageYear: number;
  coverageMonth: number;
  scope: BillingGenerationScope;
  homeownerIds?: string[];
  block?: string;
  phase?: string;
};

export type BillingPreviewAction = "CREATE" | "SKIP_EXEMPT" | "SKIP_DUPLICATE" | "SKIP_NO_RULE" | "ERROR";

export type BillingGenerationRow = {
  homeownerId: string;
  homeownerName: string;
  block: string;
  lot: string;
  phase: string | null;
  existingBalance: number;
  ruleAmount: number;
  effectivePeriod: string | null;
  resolutionReference: string | null;
  penaltyConfiguration: string;
  exemptionStatus: string;
  duplicateStatus: string;
  action: BillingPreviewAction;
  message: string;
  exemptionId?: string;
  billId?: string;
};

export type BillingGenerationSummary = {
  tenantId: string;
  coverageYear: number;
  coverageMonth: number;
  billingMonth: Date;
  dueDate: Date | null;
  scope: BillingGenerationScope;
  scopeLabel: string;
  rule: Awaited<ReturnType<typeof findEffectiveBillingRule>>;
  eligibleCount: number;
  exemptCount: number;
  duplicateCount: number;
  invalidCount: number;
  projectedNewBillCount: number;
  projectedTotalAmount: number;
  createdCount: number;
  failedCount: number;
  totalBilledAmount: number;
  rows: BillingGenerationRow[];
};

export function periodIndex(year: number, month: number) {
  return year * 12 + month;
}

export function normalizedPeriodDate(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1));
}

export function periodFromDate(value: Date) {
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 };
}

export async function findEffectiveBillingRule(tenantId: string, chargeType: RecurringChargeType, year: number, month: number) {
  const target = periodIndex(year, month);
  const rules = await prisma.billingRule.findMany({
    where: { tenantId, recurringChargeType: chargeType, active: true },
    orderBy: [{ effectiveStartYear: "desc" }, { effectiveStartMonth: "desc" }, { createdAt: "desc" }],
  });
  return rules.find((rule) => {
    const start = periodIndex(rule.effectiveStartYear, rule.effectiveStartMonth);
    const end = rule.effectiveEndYear && rule.effectiveEndMonth ? periodIndex(rule.effectiveEndYear, rule.effectiveEndMonth) : Number.POSITIVE_INFINITY;
    return start <= target && target <= end;
  }) ?? null;
}

export async function assertNoOverlappingBillingRule(input: {
  tenantId: string;
  recurringChargeType: RecurringChargeType;
  startYear: number;
  startMonth: number;
  endYear?: number | null;
  endMonth?: number | null;
  excludeId?: string;
}) {
  const start = periodIndex(input.startYear, input.startMonth);
  const end = input.endYear && input.endMonth ? periodIndex(input.endYear, input.endMonth) : Number.POSITIVE_INFINITY;
  const rules = await prisma.billingRule.findMany({
    where: { tenantId: input.tenantId, recurringChargeType: input.recurringChargeType, active: true, ...(input.excludeId ? { id: { not: input.excludeId } } : {}) },
    select: { id: true, effectiveStartYear: true, effectiveStartMonth: true, effectiveEndYear: true, effectiveEndMonth: true, resolutionReference: true },
  });
  const overlap = rules.find((rule) => {
    const ruleStart = periodIndex(rule.effectiveStartYear, rule.effectiveStartMonth);
    const ruleEnd = rule.effectiveEndYear && rule.effectiveEndMonth ? periodIndex(rule.effectiveEndYear, rule.effectiveEndMonth) : Number.POSITIVE_INFINITY;
    return start <= ruleEnd && ruleStart <= end;
  });
  if (overlap) throw new Error(`This billing rule overlaps an existing active rule: ${overlap.resolutionReference}. Deactivate or end the existing rule first.`);
}

export async function assertNoOverlappingExemption(input: {
  tenantId: string;
  homeownerId: string;
  recurringChargeType: RecurringChargeType;
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
  excludeId?: string;
}) {
  const start = periodIndex(input.startYear, input.startMonth);
  const end = periodIndex(input.endYear, input.endMonth);
  const exemptions = await prisma.duesExemption.findMany({
    where: { tenantId: input.tenantId, homeownerId: input.homeownerId, recurringChargeType: input.recurringChargeType, active: true, ...(input.excludeId ? { id: { not: input.excludeId } } : {}) },
    select: { id: true, startYear: true, startMonth: true, endYear: true, endMonth: true, billingMonth: true, reason: true },
  });
  const overlap = exemptions.find((item) => {
    const fallback = periodFromDate(item.billingMonth);
    const itemStart = periodIndex(item.startYear ?? fallback.year, item.startMonth ?? fallback.month);
    const itemEnd = periodIndex(item.endYear ?? fallback.year, item.endMonth ?? fallback.month);
    return start <= itemEnd && itemStart <= end;
  });
  if (overlap) throw new Error(`This exemption overlaps an active exemption: ${overlap.reason}.`);
}

export async function generateMonthlyDuesFromRules(input: { actor: Actor; billingMonth: Date; dueDate: Date }) {
  const { year, month } = periodFromDate(input.billingMonth);
  const result = await generateBillingFromRules({
    actor: input.actor,
    coverageYear: year,
    coverageMonth: month,
    scope: "ALL",
  }, input.dueDate);
  if (!result.rule) throw new Error("No active monthly dues billing rule covers the selected month.");

  return { rule: result.rule, generated: result.createdCount, exemptSkipped: result.exemptCount, duplicateSkipped: result.duplicateCount };
}

export async function previewBillingGeneration(input: BillingGenerationInput): Promise<BillingGenerationSummary> {
  return buildBillingGeneration(input, { persist: false });
}

export async function generateBillingFromRules(input: BillingGenerationInput, dueDateOverride?: Date): Promise<BillingGenerationSummary> {
  const result = await buildBillingGeneration(input, { persist: true, dueDateOverride });
  if (result.rule && result.createdCount > 0) {
    await sendBillingNotifications(result.rows.filter((row) => row.action === "CREATE" && row.billId).map((row) => ({
      homeownerId: row.homeownerId,
      homeownerName: row.homeownerName,
      amount: row.ruleAmount,
    })), input.actor.tenantId, result.billingMonth, result.dueDate ?? dueDateForRule(input.coverageYear, input.coverageMonth, result.rule.dueDay));
  }
  return result;
}

async function buildBillingGeneration(input: BillingGenerationInput, options: { persist: boolean; dueDateOverride?: Date }): Promise<BillingGenerationSummary> {
  validateBillingGenerationInput(input);
  const billingMonth = normalizedPeriodDate(input.coverageYear, input.coverageMonth);
  const target = periodIndex(input.coverageYear, input.coverageMonth);
  const rule = await findEffectiveBillingRule(input.actor.tenantId, RecurringChargeType.MONTHLY_DUES, input.coverageYear, input.coverageMonth);
  const candidates = await billingCandidates(input);
  const candidateIds = candidates.map((homeowner) => homeowner.id);
  const amount = rule ? Number(rule.amount) : 0;
  const dueDate = rule ? options.dueDateOverride ?? dueDateForRule(input.coverageYear, input.coverageMonth, rule.dueDay) : null;

  const [existingBills, balances, exemptions] = await Promise.all([
    candidateIds.length ? prisma.bill.findMany({
      where: { tenantId: input.actor.tenantId, homeownerId: { in: candidateIds }, recurringChargeType: RecurringChargeType.MONTHLY_DUES, coverageYear: input.coverageYear, coverageMonth: input.coverageMonth },
      select: { homeownerId: true, id: true, archivedAt: true },
    }) : Promise.resolve([]),
    candidateIds.length ? prisma.bill.groupBy({
      by: ["homeownerId"],
      where: { tenantId: input.actor.tenantId, homeownerId: { in: candidateIds }, archivedAt: null, balance: { gt: 0 } },
      _sum: { balance: true },
    }) : Promise.resolve([]),
    candidateIds.length ? prisma.duesExemption.findMany({
      where: { tenantId: input.actor.tenantId, homeownerId: { in: candidateIds }, recurringChargeType: RecurringChargeType.MONTHLY_DUES, active: true },
    }) : Promise.resolve([]),
  ]);

  const duplicateByHomeowner = new Map(existingBills.map((bill) => [bill.homeownerId, bill]));
  const balanceByHomeowner = new Map(balances.map((item) => [item.homeownerId, Number(item._sum.balance ?? 0)]));
  const exemptionByHomeowner = new Map(exemptions.filter((item) => {
    const fallback = periodFromDate(item.billingMonth);
    const start = periodIndex(item.startYear ?? fallback.year, item.startMonth ?? fallback.month);
    const end = periodIndex(item.endYear ?? fallback.year, item.endMonth ?? fallback.month);
    return start <= target && target <= end;
  }).map((item) => [item.homeownerId, item]));

  const rows = candidates.map((homeowner): BillingGenerationRow => {
    const duplicate = duplicateByHomeowner.get(homeowner.id);
    const exemption = exemptionByHomeowner.get(homeowner.id);
    const base = {
      homeownerId: homeowner.id,
      homeownerName: homeowner.user.name,
      block: homeowner.block,
      lot: homeowner.lot,
      phase: homeowner.phase,
      existingBalance: balanceByHomeowner.get(homeowner.id) ?? 0,
      ruleAmount: amount,
      effectivePeriod: rule ? effectivePeriodLabel(rule) : null,
      resolutionReference: rule?.resolutionReference ?? null,
      penaltyConfiguration: rule ? penaltyConfigurationLabel(rule) : "None",
    };
    if (!rule) return { ...base, exemptionStatus: exemption ? exemption.reason : "None", duplicateStatus: duplicate ? "Duplicate exists" : "None", action: "SKIP_NO_RULE", message: "No active billing rule covers this period.", exemptionId: exemption?.id };
    if (duplicate) return { ...base, exemptionStatus: exemption ? exemption.reason : "None", duplicateStatus: duplicate.archivedAt ? "Archived duplicate exists" : "Active duplicate exists", action: "SKIP_DUPLICATE", message: "A bill already exists for this homeowner, charge type, and coverage period.", exemptionId: exemption?.id };
    if (exemption) return { ...base, exemptionStatus: exemption.reason, duplicateStatus: "None", action: "SKIP_EXEMPT", message: exemption.resolutionReference ? `${exemption.reason} (${exemption.resolutionReference})` : exemption.reason, exemptionId: exemption.id };
    return { ...base, exemptionStatus: "None", duplicateStatus: "None", action: "CREATE", message: "Eligible for billing." };
  });

  if (options.persist && rule && dueDate) {
    const createRows = rows.filter((row) => row.action === "CREATE");
    for (let index = 0; index < createRows.length; index += billingWriteBatchSize) {
      const batch = createRows.slice(index, index + billingWriteBatchSize);
      const prepared = batch.map((row) => ({ row, id: randomUUID() }));
      try {
        await prisma.bill.createMany({
          data: prepared.map(({ row, id }) => ({
            id,
            tenantId: input.actor.tenantId,
            homeownerId: row.homeownerId,
            billingMonth,
            recurringChargeType: RecurringChargeType.MONTHLY_DUES,
            coverageYear: input.coverageYear,
            coverageMonth: input.coverageMonth,
            billingRuleId: rule.id,
            billingRuleSnapshot: ruleSnapshot(rule),
            resolutionReference: rule.resolutionReference,
            dueDate,
            amount,
            penalty: 0,
            totalAmount: amount,
            balance: amount,
            status: BillStatus.UNPAID,
            notes: `Generated from ${rule.resolutionReference}.`,
          })),
          skipDuplicates: true,
        });
        const inserted = new Set((await prisma.bill.findMany({
          where: { tenantId: input.actor.tenantId, id: { in: prepared.map((item) => item.id) } },
          select: { id: true },
        })).map((bill) => bill.id));
        for (const item of prepared) {
          if (inserted.has(item.id)) item.row.billId = item.id;
          else markDuplicate(item.row);
        }
      } catch {
        for (const item of prepared) await persistBillingRowWithIsolation(item.row, item.id, input, rule, billingMonth, dueDate, amount);
      }
    }
    await recordGenerationRowAudits(input, rule, rows);
    await prisma.auditLog.create({
      data: {
        tenantId: input.actor.tenantId,
        actorId: input.actor.id,
        module: "BILLING",
        action: "GENERATE_MONTHLY_DUES",
        entityType: "BillingRule",
        entityId: rule.id,
        metadata: {
          ...generationAuditMetadata(input, rule),
          createdCount: rows.filter((row) => row.action === "CREATE" && row.billId).length,
          exemptCount: rows.filter((row) => row.action === "SKIP_EXEMPT").length,
          duplicateCount: rows.filter((row) => row.action === "SKIP_DUPLICATE").length,
          failedCount: rows.filter((row) => row.action === "ERROR").length,
          totalAmount: rows.filter((row) => row.action === "CREATE" && row.billId).reduce((sum, row) => sum + row.ruleAmount, 0),
          timestamp: new Date().toISOString(),
        },
      },
    });
  }

  const summary = summarizeRows(rows, options.persist);
  return {
    tenantId: input.actor.tenantId,
    coverageYear: input.coverageYear,
    coverageMonth: input.coverageMonth,
    billingMonth,
    dueDate,
    scope: input.scope,
    scopeLabel: scopeLabel(input),
    rule,
    eligibleCount: candidates.length,
    exemptCount: summary.exemptCount,
    duplicateCount: summary.duplicateCount,
    invalidCount: summary.invalidCount,
    projectedNewBillCount: summary.projectedNewBillCount,
    projectedTotalAmount: summary.projectedTotalAmount,
    createdCount: summary.createdCount,
    failedCount: summary.failedCount,
    totalBilledAmount: summary.totalBilledAmount,
    rows,
  };
}

function markDuplicate(row: BillingGenerationRow) {
  row.action = "SKIP_DUPLICATE";
  row.duplicateStatus = "Duplicate exists";
  row.message = "A bill already exists for this homeowner, charge type, and coverage period.";
}

async function persistBillingRowWithIsolation(
  row: BillingGenerationRow,
  id: string,
  input: BillingGenerationInput,
  rule: NonNullable<Awaited<ReturnType<typeof findEffectiveBillingRule>>>,
  billingMonth: Date,
  dueDate: Date,
  amount: number,
) {
  try {
    await prisma.$transaction(async (tx) => {
      const duplicate = await tx.bill.findFirst({
        where: { tenantId: input.actor.tenantId, homeownerId: row.homeownerId, recurringChargeType: RecurringChargeType.MONTHLY_DUES, coverageYear: input.coverageYear, coverageMonth: input.coverageMonth },
        select: { id: true },
      });
      if (duplicate) return markDuplicate(row);
      await tx.bill.create({ data: {
        id,
        tenantId: input.actor.tenantId,
        homeownerId: row.homeownerId,
        billingMonth,
        recurringChargeType: RecurringChargeType.MONTHLY_DUES,
        coverageYear: input.coverageYear,
        coverageMonth: input.coverageMonth,
        billingRuleId: rule.id,
        billingRuleSnapshot: ruleSnapshot(rule),
        resolutionReference: rule.resolutionReference,
        dueDate,
        amount,
        penalty: 0,
        totalAmount: amount,
        balance: amount,
        status: BillStatus.UNPAID,
        notes: `Generated from ${rule.resolutionReference}.`,
      } });
      row.billId = id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    row.action = "ERROR";
    row.message = error instanceof Error ? error.message : "Billing record could not be created.";
  }
}

async function billingCandidates(input: BillingGenerationInput) {
  const where: Prisma.HomeownerProfileWhereInput = { tenantId: input.actor.tenantId, status: HomeownerStatus.ACTIVE };
  if (input.scope === "HOMEOWNER") where.id = input.homeownerIds?.[0] ?? "";
  if (input.scope === "SELECTED") where.id = { in: input.homeownerIds ?? [] };
  if (input.scope === "BLOCK") where.block = input.block ?? "";
  if (input.scope === "PHASE") where.phase = input.phase ?? "";
  return prisma.homeownerProfile.findMany({
    where,
    include: { user: true },
    orderBy: [{ block: "asc" }, { lot: "asc" }, { user: { name: "asc" } }],
  }) as Promise<HomeownerCandidate[]>;
}

function validateBillingGenerationInput(input: BillingGenerationInput) {
  if (!Number.isInteger(input.coverageYear) || input.coverageYear < 1900 || input.coverageYear > 2200) throw new Error("Enter a valid coverage year.");
  if (!Number.isInteger(input.coverageMonth) || input.coverageMonth < 1 || input.coverageMonth > 12) throw new Error("Choose a valid coverage month.");
  if (!billingGenerationScopes.includes(input.scope)) throw new Error("Choose a valid generation scope.");
  const ids = input.homeownerIds?.filter(Boolean) ?? [];
  if (input.scope === "HOMEOWNER" && ids.length !== 1) throw new Error("Select one homeowner for individual generation.");
  if (input.scope === "SELECTED" && ids.length === 0) throw new Error("Select at least one homeowner.");
  if (input.scope === "BLOCK" && !input.block?.trim()) throw new Error("Choose a block for block generation.");
  if (input.scope === "PHASE" && !input.phase?.trim()) throw new Error("Choose a phase for phase generation.");
}

function dueDateForRule(year: number, month: number, dueDay: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(dueDay, lastDay)));
}

function scopeLabel(input: BillingGenerationInput) {
  if (input.scope === "HOMEOWNER") return "Individual homeowner";
  if (input.scope === "SELECTED") return "Selected homeowners";
  if (input.scope === "BLOCK") return `Block ${input.block}`;
  if (input.scope === "PHASE") return `Phase ${input.phase}`;
  return "All eligible homeowners";
}

function generationAuditMetadata(input: BillingGenerationInput, rule: NonNullable<Awaited<ReturnType<typeof findEffectiveBillingRule>>>, extra?: Record<string, unknown>) {
  return {
    tenantId: input.actor.tenantId,
    actor: { id: input.actor.id, name: input.actor.name, email: input.actor.email },
    coverageYear: input.coverageYear,
    coverageMonth: input.coverageMonth,
    generationScope: input.scope,
    block: input.block || null,
    phase: input.phase || null,
    selectedHomeownerCount: input.homeownerIds?.length ?? 0,
    selectedHomeownerId: input.scope === "HOMEOWNER" ? input.homeownerIds?.[0] ?? null : null,
    ruleId: rule.id,
    resolutionReference: rule.resolutionReference,
    generationMode: rule.generationMode,
    amount: Number(rule.amount),
    ...extra,
  };
}

function summarizeRows(rows: BillingGenerationRow[], persist: boolean) {
  const createRows = rows.filter((row) => row.action === "CREATE");
  const createdRows = persist ? createRows.filter((row) => row.billId) : [];
  return {
    exemptCount: rows.filter((row) => row.action === "SKIP_EXEMPT").length,
    duplicateCount: rows.filter((row) => row.action === "SKIP_DUPLICATE").length,
    invalidCount: rows.filter((row) => row.action === "SKIP_NO_RULE" || row.action === "ERROR").length,
    projectedNewBillCount: createRows.length,
    projectedTotalAmount: createRows.reduce((sum, row) => sum + row.ruleAmount, 0),
    createdCount: createdRows.length,
    failedCount: rows.filter((row) => row.action === "ERROR").length,
    totalBilledAmount: createdRows.reduce((sum, row) => sum + row.ruleAmount, 0),
  };
}

function effectivePeriodLabel(rule: NonNullable<Awaited<ReturnType<typeof findEffectiveBillingRule>>>) {
  const start = monthYearLabel(rule.effectiveStartYear, rule.effectiveStartMonth);
  const end = rule.effectiveEndYear === null && rule.effectiveEndMonth === null
    ? "Open Ended"
    : rule.effectiveEndYear && rule.effectiveEndMonth
      ? monthYearLabel(rule.effectiveEndYear, rule.effectiveEndMonth)
      : "Incomplete end period";
  return `${start} to ${end}`;
}

function monthYearLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
}

function penaltyConfigurationLabel(rule: NonNullable<Awaited<ReturnType<typeof findEffectiveBillingRule>>>) {
  if (rule.penaltyType === "NONE") return "None";
  const value = Number(rule.penaltyValue);
  const amount = rule.penaltyType === "PERCENTAGE" ? `${value}%` : `PHP ${value.toFixed(2)}`;
  return `${rule.penaltyType.replaceAll("_", " ")} ${amount} ${rule.penaltyFrequency === "NONE" ? "" : rule.penaltyFrequency.replaceAll("_", " ").toLowerCase()}`.trim();
}

async function processInBatches<T>(items: T[], batchSize: number, worker: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += batchSize) {
    await Promise.all(items.slice(index, index + batchSize).map(worker));
  }
}

async function recordGenerationRowAudits(input: BillingGenerationInput, rule: NonNullable<Awaited<ReturnType<typeof findEffectiveBillingRule>>>, rows: BillingGenerationRow[]) {
  const auditableRows = rows.filter((row) => row.action === "SKIP_EXEMPT" || row.action === "SKIP_DUPLICATE" || row.action === "ERROR");
  for (let index = 0; index < auditableRows.length; index += billingAuditBatchSize) {
    await prisma.auditLog.createMany({ data: auditableRows.slice(index, index + billingAuditBatchSize).map((row) => {
      if (row.action === "SKIP_EXEMPT") return { tenantId: input.actor.tenantId, actorId: input.actor.id, module: "BILLING", action: "BILLING_SKIPPED_EXEMPTION", entityType: "DuesExemption", entityId: row.exemptionId, metadata: generationAuditMetadata(input, rule, { homeownerId: row.homeownerId, homeownerName: row.homeownerName, reason: row.exemptionStatus }) };
      if (row.action === "SKIP_DUPLICATE") return { tenantId: input.actor.tenantId, actorId: input.actor.id, module: "BILLING", action: "DUPLICATE_BILLING_PREVENTED", entityType: "HomeownerProfile", entityId: row.homeownerId, metadata: generationAuditMetadata(input, rule, { homeownerName: row.homeownerName, duplicateStatus: row.duplicateStatus }) };
      return { tenantId: input.actor.tenantId, actorId: input.actor.id, module: "BILLING", action: "BILLING_GENERATION_ROW_FAILED", entityType: "HomeownerProfile", entityId: row.homeownerId, metadata: generationAuditMetadata(input, rule, { homeownerName: row.homeownerName, error: row.message }) };
    }) });
  }
}

async function sendBillingNotifications(homeowners: Array<{ homeownerId: string; homeownerName: string; amount: number }>, tenantId: string, billingMonth: Date, dueDate: Date) {
  if (!homeowners.length) return;
  let sendEmailNotification: typeof import("@/lib/services/notifications").sendEmailNotification;
  try {
    ({ sendEmailNotification } = await import("@/lib/services/notifications"));
  } catch {
    return;
  }
  const profiles = await prisma.homeownerProfile.findMany({ where: { tenantId, id: { in: homeowners.map((item) => item.homeownerId) } }, include: { user: true } });
  const amountByHomeowner = new Map(homeowners.map((item) => [item.homeownerId, item.amount]));
  await processInBatches(profiles, billingNotificationBatchSize, async (homeowner) => {
    try {
      await sendEmailNotification({
        tenantId,
        recipientId: homeowner.userId,
        email: homeowner.user.email,
        subject: `HOA billing notice - ${billingMonth.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}`,
        heading: "Monthly dues billing",
        message: `Hello ${homeowner.user.name},\nYour monthly HOA dues of PHP ${(amountByHomeowner.get(homeowner.id) ?? 0).toFixed(2)} has been posted. Payment is due ${dueDate.toLocaleDateString("en-PH")}.`,
        type: NotificationType.BILLING_NOTIFICATION,
        actionLabel: "View my billing",
        actionUrl: `${getAppUrl()}/portal/billing`,
      });
    } catch {
      // Billing persistence must not fail because an email provider is unavailable.
    }
  });
}

function ruleSnapshot(rule: NonNullable<Awaited<ReturnType<typeof findEffectiveBillingRule>>>) {
  return {
    id: rule.id,
    recurringChargeType: rule.recurringChargeType,
    amount: Number(rule.amount),
    billingFrequency: rule.billingFrequency,
    generationMode: rule.generationMode,
    billingDay: rule.billingDay,
    dueDay: rule.dueDay,
    gracePeriodDays: rule.gracePeriodDays,
    penaltyType: rule.penaltyType,
    penaltyValue: Number(rule.penaltyValue),
    penaltyFrequency: rule.penaltyFrequency,
    effectiveStartYear: rule.effectiveStartYear,
    effectiveStartMonth: rule.effectiveStartMonth,
    effectiveEndYear: rule.effectiveEndYear,
    effectiveEndMonth: rule.effectiveEndMonth,
    resolutionReference: rule.resolutionReference,
    resolutionDate: rule.resolutionDate?.toISOString() ?? null,
  };
}
