import { HomeownerStatus, RecurringChargeType } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  buildHomeownerAdvanceDuesDescription,
  homeownerAdvanceDuesCoverageLabel,
  homeownerAdvanceDuesMonths,
} from "@/lib/homeowner-advance-dues";
import { periodIndex, periodFromDate } from "@/lib/services/billing-rules";
import { monthLabel } from "@/lib/utils";

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function currentManilaMonth(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return { year, month, index: periodIndex(year, month) };
}

export type HomeownerAdvanceDuesQuote = Awaited<ReturnType<typeof quoteHomeownerAdvanceDues>>;

export async function quoteHomeownerAdvanceDues(input: {
  tenantId: string;
  homeownerId: string;
  from: string;
  to: string;
  now?: Date;
}) {
  const range = homeownerAdvanceDuesMonths(input.from, input.to);
  const current = currentManilaMonth(input.now ?? new Date());
  if (periodIndex(range.from.year, range.from.month) < current.index) {
    throw new Error("Advance Monthly Dues coverage cannot start before the current month. Pay existing billing records for prior months.");
  }

  const homeowner = await prisma.homeownerProfile.findFirst({
    where: { id: input.homeownerId, tenantId: input.tenantId, status: HomeownerStatus.ACTIVE },
    select: { id: true },
  });
  if (!homeowner) throw new Error("Active homeowner account was not found in this association.");

  const [rules, exemptions, existingBills] = await Promise.all([
    prisma.billingRule.findMany({
      where: { tenantId: input.tenantId, recurringChargeType: RecurringChargeType.MONTHLY_DUES, active: true },
      orderBy: [{ effectiveStartYear: "desc" }, { effectiveStartMonth: "desc" }, { createdAt: "desc" }],
    }),
    prisma.duesExemption.findMany({
      where: { tenantId: input.tenantId, homeownerId: input.homeownerId, recurringChargeType: RecurringChargeType.MONTHLY_DUES, active: true },
    }),
    prisma.bill.findMany({
      where: {
        tenantId: input.tenantId,
        homeownerId: input.homeownerId,
        recurringChargeType: RecurringChargeType.MONTHLY_DUES,
        billingMonth: { gte: range.from.date, lte: range.to.date },
      },
      select: { id: true, billingMonth: true, coverageYear: true, coverageMonth: true, archivedAt: true },
    }),
  ]);

  const existingKeys = new Set(existingBills.map((bill) => `${bill.coverageYear}-${String(bill.coverageMonth).padStart(2, "0")}`));
  const lines = range.months.map((period) => {
    if (existingKeys.has(period.key)) {
      throw new Error(`${monthLabel(period.date)} already has a billing record. Pay that billing record instead of creating advance credit for the same month.`);
    }

    const target = periodIndex(period.year, period.month);
    const exemption = exemptions.find((item) => {
      const fallback = periodFromDate(item.billingMonth);
      const start = periodIndex(item.startYear ?? fallback.year, item.startMonth ?? fallback.month);
      const end = periodIndex(item.endYear ?? fallback.year, item.endMonth ?? fallback.month);
      return start <= target && target <= end;
    });
    if (exemption) {
      return {
        key: period.key,
        year: period.year,
        month: period.month,
        label: monthLabel(period.date),
        amount: 0,
        exempt: true,
        exemptionReason: exemption.reason,
        resolutionReference: exemption.resolutionReference ?? null,
      };
    }

    const rule = rules.find((item) => {
      const start = periodIndex(item.effectiveStartYear, item.effectiveStartMonth);
      const end = item.effectiveEndYear && item.effectiveEndMonth
        ? periodIndex(item.effectiveEndYear, item.effectiveEndMonth)
        : Number.POSITIVE_INFINITY;
      return start <= target && target <= end;
    });
    if (!rule) throw new Error(`No active Monthly Dues rule covers ${monthLabel(period.date)}. Ask the HOA administrator to configure the billing rule before paying in advance.`);

    const amount = roundMoney(Number(rule.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`The Monthly Dues rule for ${monthLabel(period.date)} has an invalid amount.`);
    return {
      key: period.key,
      year: period.year,
      month: period.month,
      label: monthLabel(period.date),
      amount,
      exempt: false,
      exemptionReason: null,
      resolutionReference: rule.resolutionReference,
    };
  });

  const total = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
  if (total <= 0) throw new Error("The selected coverage is fully exempt and has no Monthly Dues amount to pay.");

  return {
    from: range.from.key,
    to: range.to.key,
    monthCount: range.months.length,
    coverageLabel: homeownerAdvanceDuesCoverageLabel(range.from.key, range.to.key),
    description: buildHomeownerAdvanceDuesDescription(range.from.key, range.to.key),
    total,
    lines,
  };
}
