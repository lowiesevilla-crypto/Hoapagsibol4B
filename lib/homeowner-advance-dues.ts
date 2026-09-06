import { buildPaymentCoveragePeriod } from "@/lib/payment-coverage";

export const HOMEOWNER_ADVANCE_DUES_TRANSACTION_TYPE = "ADVANCE_MONTHLY_DUES";
export const HOMEOWNER_ADVANCE_DUES_MAX_MONTHS = 24;
const ADVANCE_DUES_PREFIX = "HOAHUB_ADVANCE_MONTHLY_DUES|v1|";

export type HomeownerAdvanceDuesMonth = {
  key: string;
  year: number;
  month: number;
  date: Date;
};

export function parseHomeownerAdvanceDuesMonth(value: string): HomeownerAdvanceDuesMonth {
  const raw = value.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) throw new Error("Choose a valid coverage month.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || year < 1900 || year > 2200 || month < 1 || month > 12) {
    throw new Error("Choose a valid coverage month.");
  }
  return { key: `${year}-${String(month).padStart(2, "0")}`, year, month, date: new Date(Date.UTC(year, month - 1, 1)) };
}

export function homeownerAdvanceDuesMonths(fromValue: string, toValue: string) {
  const from = parseHomeownerAdvanceDuesMonth(fromValue);
  const to = parseHomeownerAdvanceDuesMonth(toValue);
  const start = from.year * 12 + from.month;
  const end = to.year * 12 + to.month;
  if (end < start) throw new Error("Coverage To must not be earlier than Coverage From.");
  const count = end - start + 1;
  if (count > HOMEOWNER_ADVANCE_DUES_MAX_MONTHS) {
    throw new Error(`Advance Monthly Dues coverage is limited to ${HOMEOWNER_ADVANCE_DUES_MAX_MONTHS} months per checkout.`);
  }
  const months: HomeownerAdvanceDuesMonth[] = [];
  for (let index = 0; index < count; index += 1) {
    const date = new Date(Date.UTC(from.year, from.month - 1 + index, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    months.push({ key: `${year}-${String(month).padStart(2, "0")}`, year, month, date });
  }
  return { from, to, months };
}

export function buildHomeownerAdvanceDuesDescription(fromValue: string, toValue: string) {
  const { from, to } = homeownerAdvanceDuesMonths(fromValue, toValue);
  return `${ADVANCE_DUES_PREFIX}${from.key}|${to.key}`;
}

export function parseHomeownerAdvanceDuesDescription(value: string | null | undefined) {
  const raw = value?.trim() || "";
  if (!raw.startsWith(ADVANCE_DUES_PREFIX)) return null;
  const parts = raw.slice(ADVANCE_DUES_PREFIX.length).split("|");
  if (parts.length !== 2) return null;
  try {
    const range = homeownerAdvanceDuesMonths(parts[0], parts[1]);
    return {
      from: range.from.key,
      to: range.to.key,
      months: range.months,
      coverage: buildPaymentCoveragePeriod({
        coverageFromMonth: range.from.month,
        coverageFromYear: range.from.year,
        coverageToMonth: range.to.month,
        coverageToYear: range.to.year,
      }),
    };
  } catch {
    return null;
  }
}

export function homeownerAdvanceDuesCoverageLabel(fromValue: string, toValue: string) {
  const range = homeownerAdvanceDuesMonths(fromValue, toValue);
  return buildPaymentCoveragePeriod({
    coverageFromMonth: range.from.month,
    coverageFromYear: range.from.year,
    coverageToMonth: range.to.month,
    coverageToYear: range.to.year,
  }).paymentCoverageDisplay.replace(/^Monthly Dues\s*-\s*/i, "");
}
