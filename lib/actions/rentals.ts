"use server";

import { CollectionType, PayerType, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";

const ASSET_TYPES = new Set(["STALL", "PARKING", "SPACE", "OTHER"]);
const ASSET_STATUSES = new Set(["AVAILABLE", "OCCUPIED", "INACTIVE"]);
const RENTER_STATUSES = new Set(["ACTIVE", "INACTIVE"]);

type IdRow = { id: string };
type AssetLockRow = { id: string; status: string; code: string };
type RenterLockRow = { id: string; status: string; homeownerId: string | null; fullName: string };
type AgreementInvoiceRow = {
  id: string;
  assetCode: string;
  monthlyRate: Prisma.Decimal | number | string;
  billingDay: number;
  dueDay: number;
  startDate: Date;
  endDate: Date | null;
};
type InvoiceLockRow = {
  id: string;
  agreementId: string;
  chargeType: string;
  balance: Prisma.Decimal | number | string;
  amountPaid: Prisma.Decimal | number | string;
  status: string;
  renterId: string;
  renterName: string;
  homeownerId: string | null;
};
type CollectionLockRow = {
  id: string;
  amount: Prisma.Decimal | number | string;
  payerType: PayerType;
  payerName: string | null;
  homeownerId: string | null;
  homeownerName: string | null;
  type: CollectionType;
  description: string | null;
  refundable: boolean;
  amountRefunded: Prisma.Decimal | number | string;
  amountForfeited: Prisma.Decimal | number | string;
};
type SumRow = { total: Prisma.Decimal | number | string | null };

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

function dateValue(formData: FormData, key: string, label: string) {
  const raw = String(formData.get(key) || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`Choose a valid ${label}.`);
  const value = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(value.getTime())) throw new Error(`Choose a valid ${label}.`);
  return value;
}

function monthBounds(raw: string) {
  if (!/^\d{4}-\d{2}$/.test(raw)) throw new Error("Choose a valid rental billing month.");
  const [year, month] = raw.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start, end, year, month };
}

function dayInMonth(year: number, month: number, day: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(day, last)));
}

function invoiceNumber(prefix: string, period: Date, identity: string) {
  const ym = period.toISOString().slice(0, 7).replace("-", "");
  return `${prefix}-${ym}-${identity.replace(/[^A-Za-z0-9]/g, "").slice(-12).toUpperCase()}`;
}

function normalizePersonName(value: string | null | undefined) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-PH")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function revalidateRentalPages() {
  revalidatePath("/admin/rentals");
  revalidatePath("/admin/collections");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/reports/dashboard");
  revalidatePath("/admin/dashboard");
}

export async function saveRentalAssetAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_MANAGE);
  const code = requiredText(formData, "code", "Asset code", 60).toUpperCase();
  const name = requiredText(formData, "name", "Asset name");
  const type = String(formData.get("type") || "");
  const status = String(formData.get("status") || "AVAILABLE");
  if (!ASSET_TYPES.has(type)) throw new Error("Choose a valid rental asset type.");
  if (!ASSET_STATUSES.has(status)) throw new Error("Choose a valid asset status.");
  const defaultRate = moneyValue(formData, "defaultRate", "default rental rate", true);
  const id = randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO RentalAsset (tenantId,id,code,name,type,location,defaultRate,status,notes,createdAt,updatedAt)
    VALUES (${admin.tenantId},${id},${code},${name},${type},${optionalText(formData,"location",191)},${defaultRate},${status},${optionalText(formData,"notes")},NOW(3),NOW(3))
  `);
  await prisma.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "RENTALS", action: "CREATE_RENTAL_ASSET", entityType: "RentalAsset", entityId: id, metadata: { code, name, type, defaultRate, status } } });
  revalidateRentalPages();
  redirect("/admin/rentals?success=asset-created");
}

export async function saveRenterAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_MANAGE);
  const fullName = requiredText(formData, "fullName", "Renter name");
  const homeownerId = String(formData.get("homeownerId") || "").trim() || null;
  if (homeownerId) {
    const owner = await prisma.homeownerProfile.findFirst({ where: { id: homeownerId, tenantId: admin.tenantId }, select: { id: true } });
    if (!owner) throw new Error("Linked homeowner was not found in this association.");
  }
  const status = String(formData.get("status") || "ACTIVE");
  if (!RENTER_STATUSES.has(status)) throw new Error("Choose a valid renter status.");
  const id = randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO Renter (tenantId,id,homeownerId,fullName,email,phone,address,status,createdAt,updatedAt)
    VALUES (${admin.tenantId},${id},${homeownerId},${fullName},${optionalText(formData,"email",191)},${optionalText(formData,"phone",50)},${optionalText(formData,"address")},${status},NOW(3),NOW(3))
  `);
  await prisma.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "RENTALS", action: "CREATE_RENTER", entityType: "Renter", entityId: id, metadata: { fullName, homeownerId, status } } });
  revalidateRentalPages();
  redirect("/admin/rentals?success=renter-created");
}

export async function saveRentalAgreementAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_MANAGE);
  const assetId = requiredText(formData, "assetId", "Rental asset");
  const renterId = requiredText(formData, "renterId", "Renter");
  const startDate = dateValue(formData, "startDate", "start date");
  const endRaw = String(formData.get("endDate") || "").trim();
  const endDate = endRaw ? dateValue(formData, "endDate", "end date") : null;
  if (endDate && endDate < startDate) throw new Error("Agreement end date cannot be before its start date.");
  const monthlyRate = moneyValue(formData, "monthlyRate", "monthly rental rate");
  const securityDeposit = moneyValue(formData, "securityDeposit", "security deposit", true);
  const billingDay = dayValue(formData, "billingDay", "Billing day");
  const dueDay = dayValue(formData, "dueDay", "Due day");
  const agreementId = randomUUID();

  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as Prisma.TransactionClient;
    const assets = await db.$queryRaw<AssetLockRow[]>(Prisma.sql`SELECT id,status,code FROM RentalAsset WHERE tenantId=${admin.tenantId} AND id=${assetId} FOR UPDATE`);
    const asset = assets[0];
    if (!asset) throw new Error("Rental asset was not found in this association.");
    if (asset.status !== "AVAILABLE") throw new Error("This rental asset is not available.");
    const renters = await db.$queryRaw<RenterLockRow[]>(Prisma.sql`SELECT id,status,homeownerId,fullName FROM Renter WHERE tenantId=${admin.tenantId} AND id=${renterId} FOR UPDATE`);
    const renter = renters[0];
    if (!renter || renter.status !== "ACTIVE") throw new Error("Choose an active renter in this association.");
    const active = await db.$queryRaw<IdRow[]>(Prisma.sql`SELECT id FROM RentalAgreement WHERE tenantId=${admin.tenantId} AND assetId=${assetId} AND status='ACTIVE' LIMIT 1 FOR UPDATE`);
    if (active.length) throw new Error("This asset already has an active rental agreement.");
    await db.$executeRaw(Prisma.sql`
      INSERT INTO RentalAgreement (tenantId,id,assetId,renterId,startDate,endDate,monthlyRate,billingDay,dueDay,securityDeposit,status,notes,createdAt,updatedAt)
      VALUES (${admin.tenantId},${agreementId},${assetId},${renterId},${startDate},${endDate},${monthlyRate},${billingDay},${dueDay},${securityDeposit},'ACTIVE',${optionalText(formData,"notes")},NOW(3),NOW(3))
    `);
    await db.$executeRaw(Prisma.sql`UPDATE RentalAsset SET status='OCCUPIED',updatedAt=NOW(3) WHERE tenantId=${admin.tenantId} AND id=${assetId}`);
    if (securityDeposit > 0) {
      const depositId = randomUUID();
      const number = invoiceNumber("RDEP", startDate, agreementId);
      await db.$executeRaw(Prisma.sql`
        INSERT INTO RentalInvoice (tenantId,id,agreementId,invoiceNumber,chargeType,periodStart,periodEnd,dueDate,amount,amountPaid,balance,status,notes,createdAt,updatedAt)
        VALUES (${admin.tenantId},${depositId},${agreementId},${number},'SECURITY_DEPOSIT',${startDate},${startDate},${startDate},${securityDeposit},0,${securityDeposit},'OPEN','Refundable rental security deposit',NOW(3),NOW(3))
      `);
    }
    await db.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "RENTALS", action: "CREATE_RENTAL_AGREEMENT", entityType: "RentalAgreement", entityId: agreementId, metadata: { assetId, renterId, monthlyRate, securityDeposit, billingDay, dueDay, startDate: startDate.toISOString(), endDate: endDate?.toISOString() ?? null } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateRentalPages();
  redirect("/admin/rentals?success=agreement-created");
}

export async function endRentalAgreementAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_MANAGE);
  const agreementId = requiredText(formData, "agreementId", "Agreement");
  const endDate = dateValue(formData, "endDate", "end date");
  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as Prisma.TransactionClient;
    const rows = await db.$queryRaw<Array<{ id: string; assetId: string; startDate: Date; status: string }>>(Prisma.sql`SELECT id,assetId,startDate,status FROM RentalAgreement WHERE tenantId=${admin.tenantId} AND id=${agreementId} FOR UPDATE`);
    const agreement = rows[0];
    if (!agreement) throw new Error("Rental agreement not found.");
    if (agreement.status !== "ACTIVE") throw new Error("Only an active rental agreement can be ended.");
    if (endDate < agreement.startDate) throw new Error("End date cannot be before the agreement start date.");
    await db.$executeRaw(Prisma.sql`UPDATE RentalAgreement SET status='ENDED',endDate=${endDate},updatedAt=NOW(3) WHERE tenantId=${admin.tenantId} AND id=${agreementId}`);
    await db.$executeRaw(Prisma.sql`UPDATE RentalAsset SET status='AVAILABLE',updatedAt=NOW(3) WHERE tenantId=${admin.tenantId} AND id=${agreement.assetId} AND status='OCCUPIED'`);
    await db.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "RENTALS", action: "END_RENTAL_AGREEMENT", entityType: "RentalAgreement", entityId: agreementId, metadata: { endDate: endDate.toISOString(), assetId: agreement.assetId } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidateRentalPages();
  redirect("/admin/rentals?success=agreement-ended");
}

export async function generateRentalInvoicesAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_MANAGE);
  const { start, end, year, month } = monthBounds(String(formData.get("billingMonth") || ""));
  let created = 0;
  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as Prisma.TransactionClient;
    const agreements = await db.$queryRaw<AgreementInvoiceRow[]>(Prisma.sql`
      SELECT a.id,ra.code AS assetCode,a.monthlyRate,a.billingDay,a.dueDay,a.startDate,a.endDate
      FROM RentalAgreement a JOIN RentalAsset ra ON ra.tenantId=a.tenantId AND ra.id=a.assetId
      WHERE a.tenantId=${admin.tenantId} AND a.status='ACTIVE' AND a.startDate<=${end} AND (a.endDate IS NULL OR a.endDate>=${start})
      FOR UPDATE
    `);
    for (const agreement of agreements) {
      const amount = Number(agreement.monthlyRate);
      const number = invoiceNumber("RENT", start, agreement.id);
      const dueDate = dayInMonth(year, month, agreement.dueDay);
      const result = await db.$executeRaw(Prisma.sql`
        INSERT IGNORE INTO RentalInvoice (tenantId,id,agreementId,invoiceNumber,chargeType,periodStart,periodEnd,dueDate,amount,amountPaid,balance,status,notes,createdAt,updatedAt)
        VALUES (${admin.tenantId},${randomUUID()},${agreement.id},${number},'RENT',${start},${end},${dueDate},${amount},0,${amount},'OPEN',${`Monthly rent - ${agreement.assetCode}`},NOW(3),NOW(3))
      `);
      created += result;
    }
    await db.$executeRaw(Prisma.sql`UPDATE RentalInvoice SET status='OVERDUE',updatedAt=NOW(3) WHERE tenantId=${admin.tenantId} AND dueDate<CURDATE() AND balance>0 AND status IN ('OPEN','PARTIAL')`);
    await db.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "RENTALS", action: "GENERATE_RENTAL_INVOICES", entityType: "RentalInvoice", metadata: { billingMonth: start.toISOString().slice(0, 7), created } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidateRentalPages();
  redirect(`/admin/rentals?success=invoices-generated&count=${created}`);
}

export async function allocateRentalPaymentAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_MANAGE);
  const invoiceId = requiredText(formData, "invoiceId", "Rental invoice");
  const collectionId = requiredText(formData, "collectionId", "Collection receipt");
  const amount = moneyValue(formData, "amount", "allocation amount");

  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as Prisma.TransactionClient;
    const invoices = await db.$queryRaw<InvoiceLockRow[]>(Prisma.sql`
      SELECT i.id,i.agreementId,i.chargeType,i.balance,i.amountPaid,i.status,a.renterId,r.fullName AS renterName,r.homeownerId
      FROM RentalInvoice i JOIN RentalAgreement a ON a.tenantId=i.tenantId AND a.id=i.agreementId
      JOIN Renter r ON r.tenantId=a.tenantId AND r.id=a.renterId
      WHERE i.tenantId=${admin.tenantId} AND i.id=${invoiceId} FOR UPDATE
    `);
    const invoice = invoices[0];
    if (!invoice) throw new Error("Rental invoice was not found in this association.");
    if (["PAID", "VOID"].includes(invoice.status)) throw new Error("This rental invoice cannot accept another payment.");
    const collections = await db.$queryRaw<CollectionLockRow[]>(Prisma.sql`
      SELECT c.id,c.amount,c.payerType,c.payerName,c.homeownerId,c.type,c.description,c.refundable,c.amountRefunded,c.amountForfeited,u.name AS homeownerName
      FROM Collection c
      LEFT JOIN HomeownerProfile h ON h.tenantId=c.tenantId AND h.id=c.homeownerId
      LEFT JOIN User u ON u.id=h.userId
      WHERE c.tenantId=${admin.tenantId} AND c.id=${collectionId} FOR UPDATE
    `);
    const collection = collections[0];
    if (!collection) throw new Error("Collection receipt was not found in this association.");
    if (collection.type !== CollectionType.OTHER) throw new Error("Only Other collection receipts can settle rental invoices.");

    const renterNameKey = normalizePersonName(invoice.renterName);
    const externalMatches = collection.payerType === PayerType.RENTER && normalizePersonName(collection.payerName) === renterNameKey;
    const homeownerIdMatches = Boolean(invoice.homeownerId && collection.payerType === PayerType.HOMEOWNER && collection.homeownerId === invoice.homeownerId);
    const homeownerNameMatches = Boolean(!invoice.homeownerId && collection.payerType === PayerType.HOMEOWNER && collection.homeownerId && normalizePersonName(collection.homeownerName) === renterNameKey);
    const payerMatch = externalMatches ? "RENTER_NAME" : homeownerIdMatches ? "HOMEOWNER_ID" : homeownerNameMatches ? "HOMEOWNER_NAME_FALLBACK" : null;
    if (!payerMatch) throw new Error("The collection payer does not match this invoice renter. Link the renter to the homeowner or use a receipt recorded for the same renter.");

    const allocationTotal = await db.$queryRaw<SumRow[]>(Prisma.sql`SELECT COALESCE(SUM(amount),0) AS total FROM RentalPaymentAllocation WHERE tenantId=${admin.tenantId} AND collectionId=${collectionId}`);
    const allocatedBefore = Number(allocationTotal[0]?.total ?? 0);
    const collectionAvailable = Number(collection.amount) - allocatedBefore;
    const invoiceBalance = Number(invoice.balance);
    if (amount > invoiceBalance + 0.0001) throw new Error("Allocation exceeds the rental invoice balance.");
    if (amount > collectionAvailable + 0.0001) throw new Error("Allocation exceeds the unallocated amount on this collection receipt.");

    let receiptReclassified = false;
    if (invoice.chargeType === "SECURITY_DEPOSIT") {
      if (Number(collection.amountRefunded) > 0 || Number(collection.amountForfeited) > 0) {
        throw new Error("A refunded or forfeited receipt cannot be applied to a rental security deposit.");
      }
      if (!collection.refundable) {
        if (allocatedBefore > 0.0001) {
          throw new Error("This receipt is already allocated as income and cannot be converted to a rental security deposit liability. Use a separate receipt.");
        }
        if (Math.abs(amount - collectionAvailable) > 0.0001) {
          throw new Error("Allocate the receipt's full unused amount when applying an income receipt to a rental security deposit. Use a separate receipt if the payment covers both rent and deposit.");
        }
        await db.$executeRaw(Prisma.sql`
          UPDATE Collection SET refundable=TRUE,refundStatus='HELD',description='Rental security deposit',updatedAt=NOW(3)
          WHERE tenantId=${admin.tenantId} AND id=${collection.id}
        `);
        await db.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "RENTALS", action: "RECLASSIFY_RENTAL_SECURITY_DEPOSIT_RECEIPT", entityType: "Collection", entityId: collection.id, metadata: { invoiceId, priorDescription: collection.description, amount: Number(collection.amount), renterId: invoice.renterId, payerMatch } } });
        receiptReclassified = true;
      }
    } else if (collection.refundable) {
      throw new Error("A refundable rental security deposit receipt cannot be applied to rent income.");
    }

    await db.$executeRaw(Prisma.sql`
      INSERT INTO RentalPaymentAllocation (tenantId,id,invoiceId,collectionId,amount,createdById,createdAt)
      VALUES (${admin.tenantId},${randomUUID()},${invoiceId},${collectionId},${amount},${admin.id},NOW(3))
    `);
    const paid = Number(invoice.amountPaid) + amount;
    const balance = Math.max(0, invoiceBalance - amount);
    const status = balance <= 0.0001 ? "PAID" : paid > 0 ? "PARTIAL" : invoice.status;
    await db.$executeRaw(Prisma.sql`UPDATE RentalInvoice SET amountPaid=${paid},balance=${balance},status=${status},updatedAt=NOW(3) WHERE tenantId=${admin.tenantId} AND id=${invoiceId}`);
    await db.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "RENTALS", action: "ALLOCATE_RENTAL_COLLECTION", entityType: "RentalInvoice", entityId: invoiceId, metadata: { collectionId, amount, renterId: invoice.renterId, chargeType: invoice.chargeType, status, balance, payerMatch, receiptReclassified } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateRentalPages();
  redirect("/admin/rentals?success=payment-allocated");
}
