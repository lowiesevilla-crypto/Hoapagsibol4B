const dayMs = 24 * 60 * 60 * 1000;

export const receivablesAgingBuckets = [
  { key: "current", label: "Current" },
  { key: "thirtyDays", label: "30 Days" },
  { key: "sixtyDays", label: "60 Days" },
  { key: "ninetyDays", label: "90 Days" },
  { key: "overOneHundredTwenty", label: "120+ Days" },
] as const;

export type ReceivablesAgingBucket = (typeof receivablesAgingBuckets)[number]["key"];

export function receivablesAgingBucket(dueDate: Date, asOf: Date): ReceivablesAgingBucket {
  const daysPastDue = Math.floor((utcStartOfDay(asOf).valueOf() - utcStartOfDay(dueDate).valueOf()) / dayMs);
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "thirtyDays";
  if (daysPastDue <= 60) return "sixtyDays";
  if (daysPastDue <= 90) return "ninetyDays";
  return "overOneHundredTwenty";
}

function utcStartOfDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
