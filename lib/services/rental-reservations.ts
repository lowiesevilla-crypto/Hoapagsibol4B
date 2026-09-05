import "server-only";

import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";

export type AdminRentalReservationSummary = {
  historyCount: number;
  reservationId: string | null;
  homeownerId: string | null;
  homeownerName: string | null;
  block: string | null;
  lot: string | null;
  status: string | null;
  reservedAt: Date | null;
};

type AdminReservationRow = {
  historyCount: bigint | number;
  reservationId: string | null;
  homeownerId: string | null;
  homeownerName: string | null;
  block: string | null;
  lot: string | null;
  status: string | null;
  reservedAt: Date | null;
};

export async function getAdminRentalAssetReservationSummary(assetId: string): Promise<AdminRentalReservationSummary> {
  const admin = await requirePermission(Permission.BILLING_READ);
  const rows = await prisma.$queryRaw<AdminReservationRow[]>(Prisma.sql`
    SELECT
      (SELECT COUNT(*)
       FROM RentalAssetReservation history
       WHERE history.tenantId=ra.tenantId AND history.assetId=ra.id) AS historyCount,
      active.id AS reservationId,
      active.homeownerId,
      u.name AS homeownerName,
      h.block,
      h.lot,
      active.status,
      active.reservedAt
    FROM RentalAsset ra
    LEFT JOIN RentalAssetReservation active
      ON active.tenantId=ra.tenantId AND active.assetId=ra.id AND active.status='ACTIVE'
    LEFT JOIN HomeownerProfile h
      ON h.tenantId=active.tenantId AND h.id=active.homeownerId
    LEFT JOIN User u
      ON u.tenantId=h.tenantId AND u.id=h.userId
    WHERE ra.tenantId=${admin.tenantId} AND ra.id=${assetId}
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) {
    return { historyCount: 0, reservationId: null, homeownerId: null, homeownerName: null, block: null, lot: null, status: null, reservedAt: null };
  }
  return {
    historyCount: Number(row.historyCount ?? 0),
    reservationId: row.reservationId,
    homeownerId: row.homeownerId,
    homeownerName: row.homeownerName,
    block: row.block,
    lot: row.lot,
    status: row.status,
    reservedAt: row.reservedAt,
  };
}