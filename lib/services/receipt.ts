import type { Prisma } from "@prisma/client";

export type ReceiptSeries = "MD" | "CB" | "CTB" | "OC";

export function collectionReceiptSeries(type: string): ReceiptSeries {
  if (type === "CONSTRUCTION_BOND") return "CB";
  if (type === "CONTRACTOR_BOND") return "CTB";
  return "OC";
}

export async function allocateReceiptNumber(tx: Prisma.TransactionClient, date: Date, series: ReceiptSeries) {
  const year = date.getUTCFullYear();
  const counter = await tx.receiptCounter.upsert({
    where: { series_year: { series, year } },
    create: { series, year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });
  return `AR-${series}-${year}-${String(counter.lastNumber).padStart(7, "0")}`;
}
