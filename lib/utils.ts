import { BillStatus } from "@prisma/client";

export const MANILA_TIME_ZONE = "Asia/Manila";

export function manilaDayPeriod(value: Date | string = new Date()) {
  const hourPart = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value)).find((part) => part.type === "hour")?.value;
  const hour = Number(hourPart);

  if (!Number.isInteger(hour)) return "Morning";
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 18) return "Afternoon";
  return "Evening";
}

export function money(value: number | string | { toString(): string }) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value));
}

export function shortDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function receiptDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export function monthLabel(value: Date | string) {
  return new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

export function inputDate(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

export function statusTone(status: BillStatus | string) {
  return {
    PAID: "bg-emerald-100 text-emerald-700",
    PARTIAL: "bg-amber-100 text-amber-800",
    UNPAID: "bg-slate-100 text-slate-700",
    OVERDUE: "bg-rose-100 text-rose-700",
    ACTIVE: "bg-emerald-100 text-emerald-700",
    INACTIVE: "bg-slate-100 text-slate-600",
    EXPIRED: "bg-rose-100 text-rose-700",
    SENT: "bg-emerald-100 text-emerald-700",
    QUEUED: "bg-blue-100 text-blue-700",
    FAILED: "bg-rose-100 text-rose-700",
    SKIPPED: "bg-amber-100 text-amber-800",
    NOT_REQUESTED: "bg-slate-100 text-slate-600",
    HELD: "bg-blue-100 text-blue-700",
    PARTIALLY_REFUNDED: "bg-amber-100 text-amber-800",
    REFUNDED: "bg-emerald-100 text-emerald-700",
    FORFEITED: "bg-rose-100 text-rose-700",
    NOT_APPLICABLE: "bg-slate-100 text-slate-600",
    INCOME: "bg-emerald-100 text-emerald-700",
    PRESENT: "bg-emerald-100 text-emerald-700",
    HALF_DAY: "bg-amber-100 text-amber-800",
    ABSENT: "bg-rose-100 text-rose-700",
    PAID_LEAVE: "bg-blue-100 text-blue-700",
    UNPAID_LEAVE: "bg-slate-100 text-slate-600",
    HOLIDAY: "bg-violet-100 text-violet-700",
    DRAFT: "bg-slate-100 text-slate-600",
    FINALIZED: "bg-blue-100 text-blue-700",
    PENDING_REVIEW: "bg-amber-100 text-amber-800",
    APPROVED: "bg-emerald-100 text-emerald-700",
    REJECTED: "bg-rose-100 text-rose-700",
  }[status] ?? "bg-slate-100 text-slate-700";
}

export function collectionLabel(type: string, description?: string | null) {
  if (type === "OTHER" && description) return description;
  return type.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function amountInWords(value: number | string | { toString(): string }) {
  const totalCentavos = Math.round(Number(value) * 100);
  const pesos = Math.floor(totalCentavos / 100);
  const centavos = totalCentavos % 100;
  const pesoWords = wholeNumberWords(pesos);
  return `${pesoWords} Peso${pesos === 1 ? "" : "s"}${centavos ? ` and ${wholeNumberWords(centavos)} Centavos` : ""} Only`;
}

function wholeNumberWords(value: number): string {
  if (value === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const underThousand = (number: number) => {
    const parts: string[] = [];
    if (number >= 100) { parts.push(`${ones[Math.floor(number / 100)]} Hundred`); number %= 100; }
    if (number >= 20) { parts.push(tens[Math.floor(number / 10)]); number %= 10; }
    if (number > 0) parts.push(ones[number]);
    return parts.join(" ");
  };
  const groups = [{ size: 1_000_000_000, label: "Billion" }, { size: 1_000_000, label: "Million" }, { size: 1_000, label: "Thousand" }];
  const parts: string[] = [];
  for (const group of groups) {
    if (value >= group.size) { parts.push(`${underThousand(Math.floor(value / group.size))} ${group.label}`); value %= group.size; }
  }
  if (value > 0) parts.push(underThousand(value));
  return parts.join(" ");
}

export function asDate(value: FormDataEntryValue | null, field: string) {
  const date = new Date(String(value) + "T00:00:00.000Z");
  if (Number.isNaN(date.valueOf())) throw new Error(`${field} is invalid.`);
  return date;
}
