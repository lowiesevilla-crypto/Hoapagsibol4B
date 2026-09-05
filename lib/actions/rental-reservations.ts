"use server";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";

type AssetLockRow = {
  id: string;
  code: string;
  name: string;
  status: string;
};

type ReservationLockRow = {
  id: string;
  homeownerId: string;
  status: string;
};

function requiredId(formData: FormData, key: string, label: string) {
  const value = String(formData.get(key) || "").trim();
  if (!value || value.length > 191) throw new Error(`${label} is required.`);
  return value;
}

function revalidateReservationSurfaces() {
  revalidatePath("/portal/rentals");
  revalidatePath("/admin/rentals");
}

export async function reserveRentalAssetAction(formData: FormData) {
  const profile = await requireHomeownerProfile();
  const assetId = requiredId(formData, "assetId", "Rental asset");
  let alreadyActive = false;

  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as Prisma.TransactionClient;
    const assets = await db.$queryRaw<AssetLockRow[]>(Prisma.sql`
      SELECT id,code,name,status
      FROM RentalAsset
      WHERE tenantId=${profile.tenantId} AND id=${assetId}
      FOR UPDATE
    `);
    const asset = assets[0];
    if (!asset) throw new Error("Rental asset was not found in this association.");
    if (asset.status !== "AVAILABLE") throw new Error("This rental asset is no longer available.");

    const activeRows = await db.$queryRaw<ReservationLockRow[]>(Prisma.sql`
      SELECT id,homeownerId,status
      FROM RentalAssetReservation
      WHERE tenantId=${profile.tenantId} AND assetId=${assetId} AND status='ACTIVE'
      LIMIT 1
      FOR UPDATE
    `);
    const active = activeRows[0];
    if (active) {
      if (active.homeownerId === profile.id) {
        alreadyActive = true;
        return;
      }
      throw new Error("This rental asset is already reserved by another homeowner.");
    }

    const reservationId = randomUUID();
    await db.$executeRaw(Prisma.sql`
      INSERT INTO RentalAssetReservation
        (tenantId,id,assetId,homeownerId,status,reservedAt,createdAt,updatedAt)
      VALUES
        (${profile.tenantId},${reservationId},${assetId},${profile.id},'ACTIVE',NOW(3),NOW(3),NOW(3))
    `);
    await db.auditLog.create({
      data: {
        tenantId: profile.tenantId,
        actorId: profile.userId,
        module: "RENTALS",
        action: "CREATE_RENTAL_ASSET_RESERVATION",
        entityType: "RentalAssetReservation",
        entityId: reservationId,
        metadata: {
          assetId,
          assetCode: asset.code,
          assetName: asset.name,
          homeownerId: profile.id,
          status: "ACTIVE",
        },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateReservationSurfaces();
  redirect(`/portal/rentals?success=${alreadyActive ? "reservation-already-active" : "reservation-created"}`);
}

export async function cancelRentalAssetReservationAction(formData: FormData) {
  const profile = await requireHomeownerProfile();
  const reservationId = requiredId(formData, "reservationId", "Reservation");
  let alreadyClosed = false;

  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as Prisma.TransactionClient;
    const rows = await db.$queryRaw<ReservationLockRow[]>(Prisma.sql`
      SELECT id,homeownerId,status
      FROM RentalAssetReservation
      WHERE tenantId=${profile.tenantId} AND id=${reservationId}
      FOR UPDATE
    `);
    const reservation = rows[0];
    if (!reservation || reservation.homeownerId !== profile.id) {
      throw new Error("Rental reservation was not found for this homeowner.");
    }
    if (reservation.status !== "ACTIVE") {
      alreadyClosed = true;
      return;
    }

    await db.$executeRaw(Prisma.sql`
      UPDATE RentalAssetReservation
      SET status='CANCELLED',cancelledAt=NOW(3),updatedAt=NOW(3)
      WHERE tenantId=${profile.tenantId} AND id=${reservationId} AND homeownerId=${profile.id} AND status='ACTIVE'
    `);
    await db.auditLog.create({
      data: {
        tenantId: profile.tenantId,
        actorId: profile.userId,
        module: "RENTALS",
        action: "CANCEL_RENTAL_ASSET_RESERVATION",
        entityType: "RentalAssetReservation",
        entityId: reservationId,
        metadata: { homeownerId: profile.id, priorStatus: "ACTIVE", status: "CANCELLED" },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateReservationSurfaces();
  redirect(`/portal/rentals?success=${alreadyClosed ? "reservation-already-closed" : "reservation-cancelled"}`);
}