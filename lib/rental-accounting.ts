export type RentalAccountingAllocation = {
  collectionId: string;
  amount: unknown;
  chargeType: string;
};

export function summarizeRentalSecurityDeposits(rows: RentalAccountingAllocation[]) {
  const byCollection = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    if (row.chargeType !== "SECURITY_DEPOSIT") continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    byCollection.set(row.collectionId, (byCollection.get(row.collectionId) ?? 0) + amount);
    total += amount;
  }
  return { byCollection, total };
}

export function recognizedCollectionAmount(amount: unknown, depositAllocated: number) {
  const cash = Number(amount);
  if (!Number.isFinite(cash) || cash <= 0) return 0;
  return Math.max(0, cash - Math.min(cash, Math.max(0, depositAllocated)));
}
