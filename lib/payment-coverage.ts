import { monthLabel } from "@/lib/utils";

type CoverageSource = {
  coverageStart?: Date | string | null;
  coverageEnd?: Date | string | null;
  coverageMonths?: unknown;
  coverageFromMonth?: number | null;
  coverageFromYear?: number | null;
  coverageToMonth?: number | null;
  coverageToYear?: number | null;
  paymentCoverageDisplay?: string | null;
  bill?: { billingMonth: Date | string } | null;
  billingMonth?: Date | string | null;
};

export type PaymentCoveragePeriod = {
  coverageFromMonth: number;
  coverageFromYear: number;
  coverageToMonth: number;
  coverageToYear: number;
};

export const paymentCoverageMonths = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function buildPaymentCoverage(months: Array<Date | string>) {
  const normalized = uniqueSortedMonths(months);
  if (!normalized.length) throw new Error("At least one billing month is required for payment coverage.");
  return buildPaymentCoveragePeriod({
    coverageFromMonth: normalized[0].getUTCMonth() + 1,
    coverageFromYear: normalized[0].getUTCFullYear(),
    coverageToMonth: normalized[normalized.length - 1].getUTCMonth() + 1,
    coverageToYear: normalized[normalized.length - 1].getUTCFullYear(),
  });
}

export function buildPaymentCoveragePeriod(period: PaymentCoveragePeriod) {
  validatePaymentCoveragePeriod(period);
  const coverageStart = new Date(Date.UTC(period.coverageFromYear, period.coverageFromMonth - 1, 1));
  const coverageEnd = new Date(Date.UTC(period.coverageToYear, period.coverageToMonth - 1, 1));
  const coverageMonths: string[] = [];
  for (let cursor = new Date(coverageStart); cursor <= coverageEnd; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
    coverageMonths.push(cursor.toISOString().slice(0, 10));
  }
  const periodLabel = formatCoveragePeriod(coverageStart, coverageEnd);
  return {
    coverageFromMonth: period.coverageFromMonth,
    coverageFromYear: period.coverageFromYear,
    coverageToMonth: period.coverageToMonth,
    coverageToYear: period.coverageToYear,
    coverageStart,
    coverageEnd,
    coverageMonths,
    paymentCoverageDisplay: `Monthly Dues - ${periodLabel}`,
  };
}

export function migratedPaymentCoverageDisplay() {
  return "Monthly Dues - Previous Balance / Migrated Balance";
}

export function paymentCoverageLabel(source: CoverageSource) {
  const storedDisplay = source.paymentCoverageDisplay?.trim();
  if (storedDisplay) return storedDisplay.replace(/^Monthly Dues\s*-\s*/i, "");
  const explicitStart = validMonthYear(source.coverageFromMonth, source.coverageFromYear);
  const explicitEnd = validMonthYear(source.coverageToMonth, source.coverageToYear);
  if (explicitStart && explicitEnd) return formatCoveragePeriod(explicitStart, explicitEnd);
  const storedMonths = Array.isArray(source.coverageMonths)
    ? source.coverageMonths.filter((value): value is string => typeof value === "string")
    : [];
  const fallback = [source.coverageStart, source.coverageEnd, source.bill?.billingMonth, source.billingMonth]
    .filter((value): value is Date | string => Boolean(value));
  const months = uniqueSortedMonths(storedMonths.length ? storedMonths : fallback);
  if (!months.length) return "Previous Balance / Migrated Balance";
  return formatCoveragePeriod(months[0], months[months.length - 1]);
}

export function paymentCoverageDisplay(source: CoverageSource) {
  return source.paymentCoverageDisplay?.trim() || `Monthly Dues - ${paymentCoverageLabel(source)}`;
}

export function validatePaymentCoveragePeriod(period: PaymentCoveragePeriod) {
  for (const month of [period.coverageFromMonth, period.coverageToMonth]) {
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Coverage month must be between January and December.");
  }
  for (const year of [period.coverageFromYear, period.coverageToYear]) {
    if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new Error("Coverage year must be between 1900 and 2200.");
  }
  const start = period.coverageFromYear * 12 + period.coverageFromMonth;
  const end = period.coverageToYear * 12 + period.coverageToMonth;
  if (end < start) throw new Error("Coverage To must not be earlier than Coverage From.");
}

function uniqueSortedMonths(values: Array<Date | string>) {
  const months = new Map<string, Date>();
  for (const value of values) {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) continue;
    const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    months.set(month.toISOString().slice(0, 10), month);
  }
  return [...months.values()].sort((left, right) => left.valueOf() - right.valueOf());
}

function validMonthYear(month?: number | null, year?: number | null) {
  if (!Number.isInteger(month) || !Number.isInteger(year) || month! < 1 || month! > 12 || year! < 1900 || year! > 2200) return null;
  return new Date(Date.UTC(year!, month! - 1, 1));
}

function formatCoveragePeriod(startDate: Date, endDate: Date) {
  const start = monthLabel(startDate);
  const end = monthLabel(endDate);
  return start === end ? start : `${start} to ${end}`;
}
