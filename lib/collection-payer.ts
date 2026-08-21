import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type CollectionPayerCategory = "HOMEOWNER" | "CONTRACTOR" | "RENTER" | "OTHER";

export type CollectionPayerMetadata = {
  id: string;
  payerCategory: CollectionPayerCategory;
  payerName: string | null;
};

export function isExternalCollectionPayer(value: string): value is "RENTER" | "OTHER" {
  return value === "RENTER" || value === "OTHER";
}

export function isCollectionPayerCategory(value: string): value is CollectionPayerCategory {
  return value === "HOMEOWNER" || value === "CONTRACTOR" || value === "RENTER" || value === "OTHER";
}

export async function getCollectionPayerMetadata(tenantId: string, collectionIds: string[]) {
  if (!collectionIds.length) return new Map<string, CollectionPayerMetadata>();
  const rows = await prisma.$queryRaw<Array<{ id: string; payerCategory: string; payerName: string | null }>>(Prisma.sql`
    SELECT id, payerCategory, payerName
    FROM Collection
    WHERE tenantId = ${tenantId}
      AND id IN (${Prisma.join(collectionIds)})
  `);
  return new Map(rows.flatMap((row) => isCollectionPayerCategory(row.payerCategory)
    ? [[row.id, { id: row.id, payerCategory: row.payerCategory, payerName: row.payerName }] as const]
    : []));
}

export async function getSingleCollectionPayerMetadata(tenantId: string, collectionId: string) {
  const map = await getCollectionPayerMetadata(tenantId, [collectionId]);
  return map.get(collectionId) ?? null;
}
