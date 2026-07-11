import { BillStatus, HomeownerStatus, NotificationType, Prisma, RecurringChargeType } from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import { sendEmailNotification } from "@/lib/services/notifications";

type Actor = { id: string; tenantId: string; name: string; email: string };

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
  const target = periodIndex(year, month);
  const rule = await findEffectiveBillingRule(input.actor.tenantId, RecurringChargeType.MONTHLY_DUES, year, month);
  if (!rule) throw new Error("No active monthly dues billing rule covers the selected month.");

  const homeowners = await prisma.homeownerProfile.findMany({
    where: { tenantId: input.actor.tenantId, status: HomeownerStatus.ACTIVE },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });
  const existing = await prisma.bill.findMany({
    where: { tenantId: input.actor.tenantId, recurringChargeType: RecurringChargeType.MONTHLY_DUES, coverageYear: year, coverageMonth: month, archivedAt: null },
    select: { homeownerId: true },
  });
  const existingIds = new Set(existing.map((bill) => bill.homeownerId));
  const exemptions = await prisma.duesExemption.findMany({
    where: { tenantId: input.actor.tenantId, recurringChargeType: RecurringChargeType.MONTHLY_DUES, active: true },
    include: { homeowner: { include: { user: true } } },
  });
  const activeExemptions = exemptions.filter((item) => {
    const fallback = periodFromDate(item.billingMonth);
    const start = periodIndex(item.startYear ?? fallback.year, item.startMonth ?? fallback.month);
    const end = periodIndex(item.endYear ?? fallback.year, item.endMonth ?? fallback.month);
    return start <= target && target <= end;
  });
  const exemptionByHomeowner = new Map(activeExemptions.map((item) => [item.homeownerId, item]));
  const amount = Number(rule.amount);
  const penalty = rule.penaltyType === "NONE" ? 0 : 0;
  const generated: Array<{ homeowner: (typeof homeowners)[number]; bill: { id: string } }> = [];
  const duplicateSkipped: Array<(typeof homeowners)[number]> = [];
  const exemptSkipped: Array<{ homeowner: (typeof homeowners)[number]; exemption: (typeof activeExemptions)[number] }> = [];

  await prisma.$transaction(async (tx) => {
    for (const homeowner of homeowners) {
      if (existingIds.has(homeowner.id)) {
        duplicateSkipped.push(homeowner);
        await tx.auditLog.create({ data: { tenantId: input.actor.tenantId, actorId: input.actor.id, module: "BILLING", action: "DUPLICATE_BILLING_PREVENTED", entityType: "HomeownerProfile", entityId: homeowner.id, metadata: { recurringChargeType: "MONTHLY_DUES", coverageYear: year, coverageMonth: month } } });
        continue;
      }
      const exemption = exemptionByHomeowner.get(homeowner.id);
      if (exemption) {
        exemptSkipped.push({ homeowner, exemption });
        await tx.auditLog.create({ data: { tenantId: input.actor.tenantId, actorId: input.actor.id, module: "BILLING", action: "BILLING_SKIPPED_EXEMPTION", entityType: "DuesExemption", entityId: exemption.id, metadata: { homeownerId: homeowner.id, homeownerName: homeowner.user.name, reason: exemption.reason, resolutionReference: exemption.resolutionReference, coverageYear: year, coverageMonth: month } } });
        continue;
      }
      const bill = await tx.bill.create({
        data: {
          tenantId: input.actor.tenantId,
          homeownerId: homeowner.id,
          billingMonth: input.billingMonth,
          recurringChargeType: RecurringChargeType.MONTHLY_DUES,
          coverageYear: year,
          coverageMonth: month,
          billingRuleId: rule.id,
          billingRuleSnapshot: ruleSnapshot(rule),
          resolutionReference: rule.resolutionReference,
          dueDate: input.dueDate,
          amount,
          penalty,
          totalAmount: amount + penalty,
          balance: amount + penalty,
          status: BillStatus.UNPAID,
          notes: `Generated from ${rule.resolutionReference}.`,
        },
      });
      generated.push({ homeowner, bill });
    }
    await tx.auditLog.create({ data: { tenantId: input.actor.tenantId, actorId: input.actor.id, module: "BILLING", action: "GENERATE_MONTHLY_DUES", entityType: "BillingRule", entityId: rule.id, metadata: { coverageYear: year, coverageMonth: month, amount, generated: generated.length, exemptSkipped: exemptSkipped.length, duplicateSkipped: duplicateSkipped.length, generationMode: rule.generationMode } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await Promise.allSettled(generated.map(({ homeowner }) => sendEmailNotification({
    recipientId: homeowner.userId,
    email: homeowner.user.email,
    subject: `HOA billing notice - ${input.billingMonth.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}`,
    heading: "Monthly dues billing",
    message: `Hello ${homeowner.user.name},\nYour monthly HOA dues of PHP ${amount.toFixed(2)} has been posted. Payment is due ${input.dueDate.toLocaleDateString("en-PH")}.`,
    type: NotificationType.BILLING_NOTIFICATION,
    actionLabel: "View my billing",
    actionUrl: `${getAppUrl()}/portal/billing`,
  })));

  return { rule, generated: generated.length, exemptSkipped: exemptSkipped.length, duplicateSkipped: duplicateSkipped.length };
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
