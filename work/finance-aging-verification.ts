import { receivablesAgingBucket, receivablesAgingBuckets, type ReceivablesAgingBucket } from "../lib/services/receivables-aging";

type SampleBill = {
  label: string;
  dueDate: Date;
  totalAmount: number;
  appliedAmount: number;
  archived?: boolean;
  voided?: boolean;
};

const checks: string[] = [];

function check(condition: unknown, label: string) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function buildAging(bills: SampleBill[], asOf: Date) {
  const rows = Object.fromEntries(receivablesAgingBuckets.map((bucket) => [bucket.key, { amount: 0, billCount: 0 }])) as Record<ReceivablesAgingBucket, { amount: number; billCount: number }>;
  for (const bill of bills) {
    if (bill.archived || bill.voided) continue;
    const balance = Math.max(0, bill.totalAmount - bill.appliedAmount);
    if (balance <= 0) continue;
    const bucket = receivablesAgingBucket(bill.dueDate, asOf);
    rows[bucket].amount += balance;
    rows[bucket].billCount += 1;
  }
  return rows;
}

async function main() {
  const asOf = utcDate("2026-07-15");
  const samples: SampleBill[] = [
    { label: "current", dueDate: utcDate("2026-07-15"), totalAmount: 1000, appliedAmount: 250 },
    { label: "30", dueDate: utcDate("2026-06-15"), totalAmount: 1000, appliedAmount: 100 },
    { label: "60", dueDate: utcDate("2026-05-16"), totalAmount: 1000, appliedAmount: 200 },
    { label: "90", dueDate: utcDate("2026-04-16"), totalAmount: 1000, appliedAmount: 300 },
    { label: "120", dueDate: utcDate("2026-03-16"), totalAmount: 1000, appliedAmount: 400 },
    { label: "paid", dueDate: utcDate("2026-03-01"), totalAmount: 1000, appliedAmount: 1000 },
    { label: "archived", dueDate: utcDate("2026-03-01"), totalAmount: 1000, appliedAmount: 0, archived: true },
    { label: "voided", dueDate: utcDate("2026-03-01"), totalAmount: 1000, appliedAmount: 0, voided: true },
  ];

  check(receivablesAgingBucket(samples[0].dueDate, asOf) === "current", "current bucket classifier");
  check(receivablesAgingBucket(samples[1].dueDate, asOf) === "thirtyDays", "30-day bucket classifier");
  check(receivablesAgingBucket(samples[2].dueDate, asOf) === "sixtyDays", "60-day bucket classifier");
  check(receivablesAgingBucket(samples[3].dueDate, asOf) === "ninetyDays", "90-day bucket classifier");
  check(receivablesAgingBucket(samples[4].dueDate, asOf) === "overOneHundredTwenty", "120-plus bucket classifier");

  const aging = buildAging(samples, asOf);
  check(aging.current.amount === 750 && aging.current.billCount === 1, "current bucket respects partial payment");
  check(aging.thirtyDays.amount === 900 && aging.thirtyDays.billCount === 1, "30-day bucket respects partial payment");
  check(aging.sixtyDays.amount === 800 && aging.sixtyDays.billCount === 1, "60-day bucket respects partial payment");
  check(aging.ninetyDays.amount === 700 && aging.ninetyDays.billCount === 1, "90-day bucket respects partial payment");
  check(aging.overOneHundredTwenty.amount === 600 && aging.overOneHundredTwenty.billCount === 1, "120-plus bucket respects partial payment");
  check(Object.values(aging).reduce((sum, row) => sum + row.billCount, 0) === 5, "fully paid archived and voided bills are excluded");

  console.log(`PASS ${checks.length} finance aging checks`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
