import "server-only";

import { RecurringChargeType } from "@prisma/client";
import { buildPaymentCoveragePeriod, type PaymentCoveragePeriod } from "@/lib/payment-coverage";
import { findEffectiveBillingRule, periodIndex } from "@/lib/services/billing-rules";

export const MAX_HOMEOWNER_ADVANCE_DUES_MONTHS = 12;
const ADVANCE_DUES_DESCRIPTION = /^Advance Monthly Dues: (\d{4}-\d{2}) to (\d{4}-\d{2})$/;

type MonthPeriod = { year: number; month: number };

export type HomeownerAdvanceDuesQuote = {
  totalAmount: number;
  description: string;
  coverage: ReturnType<typeof buildPaymentCoveragePeriod>;
  months: Array<{ year: number; month: number; label: string; amount: number; ruleId: string; resolutionReference: string | null }>;
};

function parseMonthKey(value: string, label = "month"): MonthPeriod {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Choose a valid ${label}.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Choose a valid ${label}.`);
  }
  return { year, month };
}

function monthKey(period: MonthPeriod) {
  return `${period.year}-${String(period.month).padStart(2, "0")}`;
}

function monthLabel(period: MonthPeriod) {
  return new Date(Date.UTC(period.year, period.month - 1, 1)).toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function addMonths(period: MonthPeriod, offset: number): MonthPeriod {
  const absolute = period.year * 12 + (period.month - 1) + offset;
  return { year: Math.floor(absolute / 12), month: (absolute % 12) + 1 };
}

function nextManilaMonth(now: Date): MonthPeriod {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  if (!Number.isInteger(year) || !Number.isInteger(month)) throw new Error("Unable to resolve the current billing month.");
  return addMonths({ year, month }, 1);
}

function periodsBetween(from: MonthPeriod, to: MonthPeriod) {
  const count = periodIndex(to.year, to.month) - periodIndex(from.year, from.month) + 1;
  if (count <= 0) throw new Error("Coverage To must be the same as or later than Coverage From.");
  if (count > MAX_HOMEOWNER_ADVANCE_DUES_MONTHS) {
    throw new Error(`Advance Monthly Dues can cover up to ${MAX_HOMEOWNER_ADVANCE_DUES_MONTHS} consecutive months per checkout.`);
  }
  return Array.from({ length: count }, (_, index) => addMonths(from, index));
}

function coveragePeriod(from: MonthPeriod, to: MonthPeriod): PaymentCoveragePeriod {
  return {
    coverageFromMonth: from.month,
    coverageFromYear: from.year,
    coverageToMonth: to.month,
    coverageToYear: to.year,
  };
}

export function encodeHomeownerAdvanceDuesDescription(period: PaymentCoveragePeriod) {
  return `Advance Monthly Dues: ${monthKey({ year: period.coverageFromYear, month: period.coverageFromMonth })} to ${monthKey({ year: period.coverageToYear, month: period.coverageToMonth })}`;
}

export function decodeHomeownerAdvanceDuesDescription(value?: string | null): PaymentCoveragePeriod | null {
  const match = ADVANCE_DUES_DESCRIPTION.exec(value?.trim() || "");
  if (!match) return null;
  try {
    const from = parseMonthKey(match[1], "Coverage From");
    const to = parseMonthKey(match[2], "Coverage To");
    if (periodIndex(to.year, to.month) < periodIndex(from.year, from.month)) return null;
    return coveragePeriod(from, to);
  } catch {
    return null;
  }
}

export function homeownerAdvanceDuesCoverageLabel(period: PaymentCoveragePeriod) {
  const from = monthLabel({ year: period.coverageFromYear, month: period.coverageFromMonth });
  const to = monthLabel({ year: period.coverageToYear, month: period.coverageToMonth });
  return from === to ? from : `${from} to ${to}`;
}

export async function quoteHomeownerAdvanceDues(input: {
  tenantId: string;
  coverageFrom: string;
  coverageTo: string;
  now?: Date;
}): Promise<HomeownerAdvanceDuesQuote> {
  const from = parseMonthKey(input.coverageFrom, "Coverage From");
  const to = parseMonthKey(input.coverageTo, "Coverage To");
  const earliest = nextManilaMonth(input.now ?? new Date());
  if (periodIndex(from.year, from.month) < periodIndex(earliest.year, earliest.month)) {
    throw new Error(`Advance coverage must start no earlier than ${monthLabel(earliest)}.`);
  }

  const periods = periodsBetween(from, to);
  const months: HomeownerAdvanceDuesQuote["months"] = [];
  let totalCentavos = 0;

  for (const period of periods) {
    const rule = await findEffectiveBillingRule(input.tenantId, RecurringChargeType.MONTHLY_DUES, period.year, period.month);
    if (!rule) throw new Error(`No active Monthly Dues billing rule covers ${monthLabel(period)}.`);
    const amount = Number(rule.amount);
    const centavos = Math.round(amount * 100);
    if (!Number.isSafeInteger(centavos) || centavos <= 0) throw new Error(`The Monthly Dues amount for ${monthLabel(period)} is invalid.`);
    totalCentavos += centavos;
    if (!Number.isSafeInteger(totalCentavos)) throw new Error("The advance payment total is too large.");
    months.push({
      year: period.year,
      month: period.month,
      label: monthLabel(period),
      amount: centavos / 100,
      ruleId: rule.id,
      resolutionReference: rule.resolutionReference,
    });
  }

  const coverage = buildPaymentCoveragePeriod(coveragePeriod(from, to));
  return {
    totalAmount: totalCentavos / 100,
    description: encodeHomeownerAdvanceDuesDescription(coveragePeriod(from, to)),
    coverage,
    months,
  };
}
