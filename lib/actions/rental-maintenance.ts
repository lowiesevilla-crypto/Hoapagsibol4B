"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";

const ASSET_TYPES = new Set(["STALL", "PARKING", "SPACE", "OTHER"]);
const ASSET_STATUSES = new Set(["AVAILABLE", "OCCUPIED", "INACTIVE"]);
const RENTER_STATUSES = new Set(["ACTIVE", "INACTIVE"]);

type CountRow = { count: bigint | number };
type AssetRow = { id: string; status: string };
type RenterRow = { id: string; status: string };
type AgreementRow = { id: string; assetId: string; startDate: Date; status: string };
type DateRow = { latestPeriodEnd: Date | null };

function requiredText(formData: FormData, key: string, label: string, max = 191) {
  const value = String(formData.get(key) || "").trim();
  if (!value) throw new Error(`${label} is required.`);
  if (value.length > max) throw new Error(`${label} must not exceed ${max} characters.`);
  return value;
}

function optionalText(formData: FormData, key: string, max = 5000) {
  const value = String(formData.get(key) || "").trim();
  if (value.length > max) throw new Error(`${key} is too long.`);
  return value || null;
}

function moneyValue(formData: FormData, key: string, label: string, allowZero = false) {
  const value = Number(formData.get(key));
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) throw new Error(`Enter a valid ${label}.`);
  return Math.round(value * 100) / 100;
}

function dayValue(formData: FormData, key: string, label: string) {
  const value = Number(formData.get(key));
  if (!Number.isInteger(value) || value < 1 || value > 28) throw new Error(`${label} must be from 1 to 28.`);
  return value;
}

function optionalDate(formData: FormData, key: string, label: string) {
  const raw = String(formData.get(key) || "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`Choose a valid ${label}.`);
  const value = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(value.getTime())) throw new Error(`Choose a valid ${label}.`);
  return value;
}

function countValue(rows: CountRow[]) {
  return Number(rows[0]?.count ?? 0);
}

function revalidateRentalPages() {
  revalidatePath("/admin/rentals");
  revalidatePath("/admin/collections");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/reports/dashboard");
  revalidatePath("/admin/dashboard");
}

export async function updateRentalAssetAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_MANAGE);
  const assetId = requiredText(formData, "assetId", "Rental asset");
  const code = requiredText(formData, "code", "Asset code", 60).toUpperCase();
  const name = requiredText(formData, "name", "Asset name");
  const type = String(formData.get("type") || "");
  const status = String(formData.get("status") || "");
  if (!ASSET_TYPES.has(type)) throw new Error("Choose a valid rental asset type.");
  if (!ASSET_STATUSES.has(status)) throw new Error("Choose a valid rental asset status.");
  const defaultRate = moneyValue(formData, "defaultRate", "default rental rate", true);
  const location = optionalText(formData, "location", 191);
  const notes = optionalText(formData, "notes");

  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as Prisma.TransactionClient;
    const rows = await db.$queryRaw<AssetRow[]>(Prisma.sql`SELECT id,status FROM RentalAsset WHERE tenantId=${admin.tenantId} AND id=${assetId} FOR UPDATE`);
    if (!rows[0]) throw new Error("Rental asset was not found in this association.");
    const duplicate = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM RentalAsset WHERE tenantId=${admin.tenantId} AND code=${code} AND id<>${assetId} LIMIT 1`);
    if (duplicate.length) throw new Error("Another rental asset already uses this asset code.");
    const active = await db.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*) AS count FROM RentalAgreement WHERE tenantId=${admin.tenantId} AND assetId=${assetId} AND status='ACTIVE'`);
    const hasActiveAgreement = countValue(active) > 0;
    if (hasActiveAgreement && status !== "OCCUPIED") throw new Error("This asset has an active agreement and must remain Occupied. End the agreement first.");
    if (!hasActiveAgreement && status === "OCCUPIED") throw new Error("An asset can be Occupied only when it has an active rental agreement.");

    await db.$executeRaw(Prisma.sql`
      UPDATE RentalAsset SET code=${code},name=${name},type=${type},location=${location},defaultRate=${defaultRate},status=${status},notes=${notes},updatedAt=NOW(3)
      WHERE tenantId=${admin.tenantId} AND id=${assetId}
    `);
    await db.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "RENTALS", action: "UPDATE_RENTAL_ASSET", entityType: "RentalAsset", entityId: assetId, metadata: { code, name, type, location, defaultRate, status } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateRentalPages();
  redirect("/admin/rentals?success=asset-updated");
}

export async function deleteRentalAssetAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_MANAGE);
  const assetId = requiredText(formData, "assetId", "Rental asset");

  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as Prisma.TransactionClient;
    const rows = await db.$queryRaw<Array<{ id: string; code: string; name: string }>>(Prisma.sql`SELECT id,code,name FROM RentalAsset WHERE tenantId=${admin.tenantId} AND id=${assetId} FOR UPDATE`);
    const asset = rows[0];
    if (!asset) throw new Error("Rental asset was not found in this association.");
    const agreements = await db.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*) AS count FROM RentalAgreement WHERE tenantId=${admin.tenantId} AND assetId=${assetId}`);
    if (countValue(agreements) > 0) throw new Error("This asset has rental agreement history and cannot be deleted. Set it to Inactive instead.");
    await db.$executeRaw(Prisma.sql`DELETE FROM RentalAsset WHERE tenantId=${admin.tenantId} AND id=${assetId}`);
    await db.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "RENTALS", action: "DELETE_RENTAL_ASSET", entityType: "RentalAsset", entityId: assetId, metadata: { code: asset.code, name: asset.name } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateRentalPages();
  redirect("/admin/rentals?success=asset-deleted");
}

export async function updateRenterAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_MANAGE);
  const renterId = requiredText(formData, "renterId", "Renter");
  const fullName = requiredText(formData, "fullName", "Renter name");
  const status = String(formData.get("status") || "");
  if (!RENTER_STATUSES.has(status)) throw new Error("Choose a valid renter status.");
  const homeownerId = String(formData.get("homeownerId") || "").trim() || null;
  if (homeownerId) {
    const owner = await prisma.homeownerProfile.findFirst({ where: { id: homeownerId, tenantId: admin.tenantId }, select: { id: true } });
    if (!owner) throw new Error("Linked homeowner was not found in this association.");
  }
  const email = optionalText(formData, "email", 191);
  const phone = optionalText(formData, "phone", 50);
  const address = optionalText(formData, "address");

  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as Prisma.TransactionClient;
    const rows = await db.$queryRaw<RenterRow[]>(Prisma.sql`SELECT id,status FROM Renter WHERE tenantId=${admin.tenantId} AND id=${renterId} FOR UPDATE`);
    if (!rows[0]) throw new Error("Renter was not found in this association.");
    if (status === "INACTIVE") {
      const active = await db.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*) AS count FROM RentalAgreement WHERE tenantId=${admin.tenantId} AND renterId=${renterId} AND status='ACTIVE'`);
      if (countValue(active) > 0) throw new Error("This renter has an active rental agreement. End the agreement before making the renter inactive.");
    }
    await db.$executeRaw(Prisma.sql`
      UPDATE Renter SET homeownerId=${homeownerId},fullName=${fullName},email=${email},phone=${phone},address=${address},status=${status},updatedAt=NOW(3)
      WHERE tenantId=${admin.tenantId} AND id=${renterId}
    `);
    await db.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "RENTALS", action: "UPDATE_RENTER", entityType: "Renter", entityId: renterId, metadata: { fullName, homeownerId, email, phone, status } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateRentalPages();
  redirect("/admin/rentals?success=renter-updated");
}

export async function deleteRenterAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_MANAGE);
  const renterId = requiredText(formData, "renterId", "Renter");

  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as Prisma.TransactionClient;
    const rows = await db.$queryRaw<Array<{ id: string; fullName: string }>>(Prisma.sql`SELECT id,fullName FROM Renter WHERE tenantId=${admin.tenantId} AND id=${renterId} FOR UPDATE`);
    const renter = rows[0];
    if (!renter) throw new Error("Renter was not found in this association.");
    const agreements = await db.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*) AS count FROM RentalAgreement WHERE tenantId=${admin.tenantId} AND renterId=${renterId}`);
    if (countValue(agreements) > 0) throw new Error("This renter has rental agreement history and cannot be deleted. Set the renter to Inactive instead.");
    await db.$executeRaw(Prisma.sql`DELETE FROM Renter WHERE tenantId=${admin.tenantId} AND id=${renterId}`);
    await db.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "RENTALS", action: "DELETE_RENTER", entityType: "Renter", entityId: renterId, metadata: { fullName: renter.fullName } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateRentalPages();
  redirect("/admin/rentals?success=renter-deleted");
}

export async function updateRentalAgreementAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_MANAGE);
  const agreementId = requiredText(formData, "agreementId", "Rental agreement");
  const monthlyRate = moneyValue(formData, "monthlyRate", "monthly rental rate");
  const billingDay = dayValue(formData, "billingDay", "Billing day");
  const dueDay = dayValue(formData, "dueDay", "Due day");
  const endDate = optionalDate(formData, "endDate", "end date");
  const notes = optionalText(formData, "notes");

  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as Prisma.TransactionClient;
    const rows = await db.$queryRaw<AgreementRow[]>(Prisma.sql`SELECT id,assetId,startDate,status FROM RentalAgreement WHERE tenantId=${admin.tenantId} AND id=${agreementId} FOR UPDATE`);
    const agreement = rows[0];
    if (!agreement) throw new Error("Rental agreement was not found in this association.");
    if (endDate && endDate < agreement.startDate) throw new Error("Agreement end date cannot be before its start date.");
    if (endDate) {
      const latest = await db.$queryRaw<DateRow[]>(Prisma.sql`SELECT MAX(periodEnd) AS latestPeriodEnd FROM RentalInvoice WHERE tenantId=${admin.tenantId} AND agreementId=${agreementId} AND status<>'VOID'`);
      const latestPeriodEnd = latest[0]?.latestPeriodEnd;
      if (latestPeriodEnd && endDate < latestPeriodEnd) throw new Error("The end date cannot be earlier than an existing rental invoice period. Void or correct the invoice first.");
    }
    await db.$executeRaw(Prisma.sql`
      UPDATE RentalAgreement SET monthlyRate=${monthlyRate},billingDay=${billingDay},dueDay=${dueDay},endDate=${endDate},notes=${notes},updatedAt=NOW(3)
      WHERE tenantId=${admin.tenantId} AND id=${agreementId}
    `);
    await db.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "RENTALS", action: "UPDATE_RENTAL_AGREEMENT", entityType: "RentalAgreement", entityId: agreementId, metadata: { monthlyRate, billingDay, dueDay, endDate: endDate?.toISOString() ?? null } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateRentalPages();
  redirect("/admin/rentals?success=agreement-updated");
}

export async function deleteRentalAgreementAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_MANAGE);
  const agreementId = requiredText(formData, "agreementId", "Rental agreement");

  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as Prisma.TransactionClient;
    const rows = await db.$queryRaw<AgreementRow[]>(Prisma.sql`SELECT id,assetId,startDate,status FROM RentalAgreement WHERE tenantId=${admin.tenantId} AND id=${agreementId} FOR UPDATE`);
    const agreement = rows[0];
    if (!agreement) throw new Error("Rental agreement was not found in this association.");
    const invoices = await db.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*) AS count FROM RentalInvoice WHERE tenantId=${admin.tenantId} AND agreementId=${agreementId}`);
    if (countValue(invoices) > 0) throw new Error("This agreement has invoice or deposit history and cannot be deleted. End the agreement instead so the financial audit trail is preserved.");
    await db.$executeRaw(Prisma.sql`DELETE FROM RentalAgreement WHERE tenantId=${admin.tenantId} AND id=${agreementId}`);
    if (agreement.status === "ACTIVE") {
      await db.$executeRaw(Prisma.sql`UPDATE RentalAsset SET status='AVAILABLE',updatedAt=NOW(3) WHERE tenantId=${admin.tenantId} AND id=${agreement.assetId} AND status='OCCUPIED'`);
    }
    await db.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "RENTALS", action: "DELETE_RENTAL_AGREEMENT", entityType: "RentalAgreement", entityId: agreementId, metadata: { assetId: agreement.assetId, priorStatus: agreement.status, startDate: agreement.startDate.toISOString() } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateRentalPages();
  redirect("/admin/rentals?success=agreement-deleted");
}
