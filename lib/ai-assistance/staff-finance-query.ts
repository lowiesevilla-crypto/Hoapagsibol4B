export type StaffFinanceQueryKind = "MONTHLY_DUES_COLLECTION" | "TOTAL_COLLECTION";

export type StaffFinanceDateRange = {
  start: Date;
  end: Date;
  label: string;
  kind: "DAY" | "MONTH" | "RANGE" | "YTD";
};

const MONTHS: ReadonlyArray<{ month: number; names: string[] }> = [
  { month: 0, names: ["january", "jan"] },
  { month: 1, names: ["february", "feb"] },
  { month: 2, names: ["march", "mar"] },
  { month: 3, names: ["april", "apr"] },
  { month: 4, names: ["may"] },
  { month: 5, names: ["june", "jun"] },
  { month: 6, names: ["july", "jul"] },
  { month: 7, names: ["august", "aug"] },
  { month: 8, names: ["september", "sep", "sept"] },
  { month: 9, names: ["october", "oct"] },
  { month: 10, names: ["november", "nov"] },
  { month: 11, names: ["december", "dec"] },
];

const MONTH_PATTERN = MONTHS.flatMap((entry) => entry.names).join("|");
const KNOWLEDGE_ONLY_TERMS = /\b(policy|policies|bylaw|bylaws|by-laws|rule|rules|guideline|procedure|resolution|manual)\b/i;

function monthIndex(name: string) {
  const normalized = name.toLowerCase();
  return MONTHS.find((entry) => entry.names.includes(normalized))?.month ?? null;
}

function tenantDateString(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return { year, month, day };
}

function phtStart(year: number, month: number, day = 1) {
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00+08:00`);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function monthRange(year: number, month: number): StaffFinanceDateRange {
  const start = phtStart(year, month);
  const end = month === 11 ? phtStart(year + 1, 0) : phtStart(year, month + 1);
  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "Asia/Manila" }).format(start);
  return { start, end, label, kind: "MONTH" };
}

function todayRange(now: Date): StaffFinanceDateRange {
  const parts = tenantDateString(now);
  const start = phtStart(parts.year, parts.month - 1, parts.day);
  return { start, end: addDays(start, 1), label: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`, kind: "DAY" };
}

export function classifyStaffFinanceQuery(question: unknown): StaffFinanceQueryKind | null {
  if (typeof question !== "string") return null;
  const value = question.trim();
  if (!value) return null;

  // Policy/rule questions must remain on the approved knowledge path, not live finance data.
  if (KNOWLEDGE_ONLY_TERMS.test(value)) return null;

  const monthlyDues = /\b(monthly\s+dues?|association\s+dues?|hoa\s+dues?|dues)\b.{0,90}\b(collections?|collected|payments?|received|receipts?)\b/i.test(value)
    || /\b(collections?|collected|payments?|received|receipts?)\b.{0,90}\b(monthly\s+dues?|association\s+dues?|hoa\s+dues?|dues)\b/i.test(value);
  if (monthlyDues) return "MONTHLY_DUES_COLLECTION";

  const totalCollection = /\b(total|overall|all)\s+(?:tenant\s+)?collections?\b/i.test(value)
    || /\bhow\s+much\b.{0,100}\bcollections?\b/i.test(value)
    || /\bcollections?\b.{0,100}\b(today|this month|current month|last month|year to date|ytd|from|for|between|until|through|thru)\b/i.test(value);
  if (totalCollection) return "TOTAL_COLLECTION";

  return null;
}

export function parseStaffFinanceDateRange(question: string, now = new Date()): StaffFinanceDateRange | null {
  const value = question.trim();
  const current = tenantDateString(now);

  if (/\b(today|this day)\b/i.test(value)) return todayRange(now);

  const isoRange = /\b(?:from\s+)?(20\d{2})-(\d{2})-(\d{2})\s+(?:to|through|thru|until)\s+(20\d{2})-(\d{2})-(\d{2})\b/i.exec(value);
  if (isoRange) {
    const start = phtStart(Number(isoRange[1]), Number(isoRange[2]) - 1, Number(isoRange[3]));
    const inclusiveEnd = phtStart(Number(isoRange[4]), Number(isoRange[5]) - 1, Number(isoRange[6]));
    if (inclusiveEnd >= start) return { start, end: addDays(inclusiveEnd, 1), label: `${isoRange[1]}-${isoRange[2]}-${isoRange[3]} to ${isoRange[4]}-${isoRange[5]}-${isoRange[6]}`, kind: "RANGE" };
  }

  const fromMonthToNow = new RegExp(`\\b(?:from\\s+)?(${MONTH_PATTERN})(?:\\s+(20\\d{2}))?\\s+(?:until|to|through|thru)\\s+(?:now|today)\\b`, "i").exec(value);
  if (fromMonthToNow) {
    const month = monthIndex(fromMonthToNow[1]);
    const year = Number(fromMonthToNow[2] || current.year);
    if (month != null) {
      const start = phtStart(year, month);
      const today = todayRange(now);
      if (start <= today.end) return { start, end: today.end, label: `${MONTHS[month].names[0]} ${year} through today`, kind: "RANGE" };
    }
  }

  if (/\b(year\s+to\s+date|ytd|this year)\b/i.test(value)) {
    const start = phtStart(current.year, 0);
    return { start, end: todayRange(now).end, label: `${current.year} year to date`, kind: "YTD" };
  }

  if (/\b(last month|previous month)\b/i.test(value)) {
    const month = current.month - 2;
    return month >= 0 ? monthRange(current.year, month) : monthRange(current.year - 1, 11);
  }

  if (/\b(this month|current month|month to date|mtd)\b/i.test(value)) {
    const range = monthRange(current.year, current.month - 1);
    return { ...range, end: todayRange(now).end, label: `${range.label} month to date` };
  }

  const explicitMonth = new RegExp(`\\b(${MONTH_PATTERN})\\s+(20\\d{2})\\b`, "i").exec(value);
  if (explicitMonth) {
    const month = monthIndex(explicitMonth[1]);
    if (month != null) return monthRange(Number(explicitMonth[2]), month);
  }

  const monthOnly = new RegExp(`\\b(?:for|in|during)\\s+(${MONTH_PATTERN})\\b`, "i").exec(value);
  if (monthOnly) {
    const month = monthIndex(monthOnly[1]);
    if (month != null) return monthRange(current.year, month);
  }

  return null;
}
