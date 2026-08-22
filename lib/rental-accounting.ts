export type RentalAccountingAllocation = {
  collectionId: string;
  amount: unknown;
  chargeType: string;
};

function positiveAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function summarizeRentalAllocations(rows: RentalAccountingAllocation[]) {
  const rentByCollection = new Map<string, number>();
  const securityDepositByCollection = new Map<string, number>();
  let rentTotal = 0;
  let securityDepositTotal = 0;

  for (const row of rows) {
    const amount = positiveAmount(row.amount);
    if (!amount) continue;
    if (row.chargeType === "RENT") {
      rentByCollection.set(row.collectionId, (rentByCollection.get(row.collectionId) ?? 0) + amount);
      rentTotal += amount;
    } else if (row.chargeType === "SECURITY_DEPOSIT") {
      securityDepositByCollection.set(row.collectionId, (securityDepositByCollection.get(row.collectionId) ?? 0) + amount);
      securityDepositTotal += amount;
    }
  }

  return { rentByCollection, securityDepositByCollection, rentTotal, securityDepositTotal };
}

export function summarizeRentalSecurityDeposits(rows: RentalAccountingAllocation[]) {
  const summary = summarizeRentalAllocations(rows);
  return { byCollection: summary.securityDepositByCollection, total: summary.securityDepositTotal };
}

export function recognizedCollectionAmount(amount: unknown, depositAllocated: number) {
  const cash = positiveAmount(amount);
  if (!cash) return 0;
  return Math.max(0, cash - Math.min(cash, Math.max(0, depositAllocated)));
}

export function rentalCollectionAccounting(input: {
  amount: unknown;
  rentAllocated?: number;
  securityDepositAllocated?: number;
  isRentalPayment?: boolean;
}) {
  const cash = positiveAmount(input.amount);
  const rentAllocated = Math.min(cash, Math.max(0, Number(input.rentAllocated ?? 0)));
  const securityDepositAllocated = Math.min(Math.max(0, cash - rentAllocated), Math.max(0, Number(input.securityDepositAllocated ?? 0)));
  const isRental = Boolean(input.isRentalPayment || rentAllocated > 0);

  if (!isRental) {
    return {
      rentalIncome: 0,
      advanceCredit: 0,
      securityDeposit: securityDepositAllocated,
      genericIncome: Math.max(0, cash - securityDepositAllocated),
    };
  }

  return {
    rentalIncome: rentAllocated,
    advanceCredit: Math.max(0, cash - rentAllocated - securityDepositAllocated),
    securityDeposit: securityDepositAllocated,
    genericIncome: 0,
  };
}
