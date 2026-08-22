"use server";

import { CollectionType, PaymentMethod, PayerType, Prisma, RefundStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission, requirePermissions } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { allocateReceiptNumber, collectionReceiptSeries } from "@/lib/services/receipt";

type RenterLockRow = { id: string; fullName: string; homeownerId: string | null; status: string };
type AgreementInvoiceRow = { id: string; renterId: string; assetCode: string; monthlyRate: Prisma.Decimal | number | string; billingDay: number; dueDay: number; startDate: Date; endDate: Date | null };
type InvoiceCreditRow = { id: string; balance: Prisma.Decimal | number | string; amountPaid: Prisma.Decimal | number | string; status: string; dueDate: Date };
type CollectionCreditRow = { id: string; amount: Prisma.Decimal | number | string; payerType: PayerType; payerName: string | null; homeownerId: string | null; refundable: boolean; description: string | null };
type ExistingAllocationRow = { id: string; amount: Prisma.Decimal | number | string };
type SumRow = { total: Prisma.Decimal | number | string | null };
type CandidateIdRow = { id: string };

const PAYMENT_METHODS = new Set(Object.values(PaymentMethod));

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

function moneyValue(formData: FormData, key: string, label: string) {
  const value = Number(formData.get(key));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Enter a valid ${label}.`);
  return Math.round(value * 100) / 100;
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

function payerMatchesRenter(collection: CollectionCreditRow, renter: RenterLockRow) {
  if (renter.homeownerId) return collection.payerType === PayerType.HOMEOWNER && collection.homeownerId === renter.homeownerId;
  return collection.payerType === PayerType.RENTER && normalizePersonName(collection.payerName) === normalizePersonName(renter.fullName);
}

function revalidateRentalPages() {
  revalidatePath("/admin/rentals");
  revalidatePath("/admin/collections");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/reports/dashboard");
  revalidatePath("/admin/dashboard");
}

async function applyRentalCreditsForRenter(
  db: Prisma.TransactionClient,
  tenantId: string,
  actorId: string,
  renter: RenterLockRow,
  preferredCollectionIds?: string[],
) {
  const invoices = await db.$queryRaw<InvoiceCreditRow[]>(Prisma.sql`
    SELECT i.id,i.balance,i.amountPaid,i.status,i.dueDate
    FROM RentalInvoice i
    JOIN RentalAgreement a ON a.tenantId=i.tenantId AND a.id=i.agreementId
    WHERE i.tenantId=${tenantId} AND a.renterId=${renter.id} AND i.chargeType='RENT'
      AND i.balance>0 AND i.status IN ('OPEN','PARTIAL','OVERDUE')
    ORDER BY i.dueDate ASC,i.periodStart ASC,i.createdAt ASC
    FOR UPDATE
  `);
  if (!invoices.length) return { applied: 0, allocations: 0 };

  let candidates: CandidateIdRow[];
  if (preferredCollectionIds?.length) {
    candidates = preferredCollectionIds.map((id) => ({ id }));
  } else if (renter.homeownerId) {
    candidates = await db.$queryRaw<CandidateIdRow[]>(Prisma.sql`
      SELECT c.id
      FROM Collection c
      WHERE c.tenantId=${tenantId} AND c.type='OTHER' AND c.refundable=FALSE
        AND c.payerType='HOMEOWNER' AND c.homeownerId=${renter.homeownerId}
        AND (
          c.description='Rental payment'
          OR EXISTS (
            SELECT 1 FROM RentalPaymentAllocation x
            JOIN RentalInvoice xi ON xi.tenantId=x.tenantId AND xi.id=x.invoiceId
            JOIN RentalAgreement xa ON xa.tenantId=xi.tenantId AND xa.id=xi.agreementId
            WHERE x.tenantId=c.tenantId AND x.collectionId=c.id AND xa.renterId=${renter.id}
          )
        )
      ORDER BY c.collectionDate ASC,c.createdAt ASC
    `);
  } else {
    candidates = await db.$queryRaw<CandidateIdRow[]>(Prisma.sql`
      SELECT c.id
      FROM Collection c
      WHERE c.tenantId=${tenantId} AND c.type='OTHER' AND c.refundable=FALSE AND c.payerType='RENTER'
        AND (
          c.description='Rental payment'
          OR EXISTS (
            SELECT 1 FROM RentalPaymentAllocation x
            JOIN RentalInvoice xi ON xi.tenantId=x.tenantId AND xi.id=x.invoiceId
            JOIN RentalAgreement xa ON xa.tenantId=xi.tenantId AND xa.id=xi.agreementId
            WHERE x.tenantId=c.tenantId AND x.collectionId=c.id AND xa.renterId=${renter.id}
          )
        )
      ORDER BY c.collectionDate ASC,c.createdAt ASC
    `);
  }

  let applied = 0;
  let allocations = 0;
  for (const candidate of candidates) {
    const collectionRows = await db.$queryRaw<CollectionCreditRow[]>(Prisma.sql`
      SELECT id,amount,payerType,payerName,homeownerId,refundable,description
      FROM Collection WHERE tenantId=${tenantId} AND id=${candidate.id} AND type='OTHER' FOR UPDATE
    `);
    const collection = collectionRows[0];
    if (!collection || collection.refundable || !payerMatchesRenter(collection, renter)) continue;

    const allocatedRows = await db.$queryRaw<SumRow[]>(Prisma.sql`
      SELECT COALESCE(SUM(amount),0) AS total FROM RentalPaymentAllocation
      WHERE tenantId=${tenantId} AND collectionId=${collection.id}
    `);
    let available = Number(collection.amount) - Number(allocatedRows[0]?.total ?? 0);
    if (available <= 0.0001) continue;

    for (const invoice of invoices) {
      let invoiceBalance = Number(invoice.balance);
      if (invoiceBalance <= 0.0001 || available <= 0.0001) continue;
      const amount = Math.min(invoiceBalance, available);
      if (amount <= 0.0001) continue;

      const existingRows = await db.$queryRaw<ExistingAllocationRow[]>(Prisma.sql`
        SELECT id,amount FROM RentalPaymentAllocation
        WHERE tenantId=${tenantId} AND invoiceId=${invoice.id} AND collectionId=${collection.id}
        FOR UPDATE
      `);
      const existing = existingRows[0];
      if (existing) {
        await db.$executeRaw(Prisma.sql`
          UPDATE RentalPaymentAllocation SET amount=${Number(existing.amount) + amount}
          WHERE tenantId=${tenantId} AND id=${existing.id}
        `);
      } else {
        await db.$executeRaw(Prisma.sql`
          INSERT INTO RentalPaymentAllocation (tenantId,id,invoiceId,collectionId,amount,createdById,createdAt)
          VALUES (${tenantId},${randomUUID()},${invoice.id},${collection.id},${amount},${actorId},NOW(3))
        `);
      }

      const paid = Number(invoice.amountPaid) + amount;
      invoiceBalance = Math.max(0, invoiceBalance - amount);
      const status = invoiceBalance <= 0.0001 ? "PAID" : "PARTIAL";
      await db.$executeRaw(Prisma.sql`
        UPDATE RentalInvoice SET amountPaid=${paid},balance=${invoiceBalance},status=${status},updatedAt=NOW(3)
        WHERE tenantId=${tenantId} AND id=${invoice.id}
      `);
      invoice.amountPaid = paid;
      invoice.balance = invoiceBalance;
      invoice.status = status;
      available -= amount;
      applied += amount;
      allocations += 1;

      await db.auditLog.create({
        data: {
          tenantId,
          actorId,
          module: "RENTALS",
          action: "AUTO_ALLOCATE_RENTAL_CREDIT",
          entityType: "RentalInvoice",
          entityId: invoice.id,
          metadata: { renterId: renter.id, collectionId: collection.id, amount, balance: invoiceBalance, strategy: "OLDEST_DUE_FIRST" },
        },
      });
    }
  }
  return { applied: Math.round(applied * 100) / 100, allocations };
}

export async function recordRentalPaymentAction(formData: FormData) {
  const admin = await requirePermissions([Permission.BILLING_MANAGE, Permission.COLLECTIONS_RECORD, Permission.RECEIPTS_ISSUE]);
  const renterId = requiredText(formData, "renterId", "Renter");
  const amount = moneyValue(formData, "amount", "rental payment amount");
  const collectionDate = dateValue(formData, "paymentDate", "payment date");
  const methodRaw = String(formData.get("method") || "");
  if (!PAYMENT_METHODS.has(methodRaw as PaymentMethod)) throw new Error("Choose a valid payment method.");
  const method = methodRaw as PaymentMethod;
  const allocationMode = String(formData.get("allocationMode") || "AUTO");
  if (!new Set(["AUTO", "ADVANCE"]).has(allocationMode)) throw new Error("Choose how this rental payment should be allocated.");
  const referenceNumber = optionalText(formData, "referenceNumber", 191);
  const remarks = optionalText(formData, "remarks");

  let receiptNumber = "";
  let applied = 0;
  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as Prisma.TransactionClient;
    const renterRows = await db.$queryRaw<RenterLockRow[]>(Prisma.sql`
      SELECT id,fullName,homeownerId,status FROM Renter
      WHERE tenantId=${admin.tenantId} AND id=${renterId} FOR UPDATE
    `);
    const renter = renterRows[0];
    if (!renter || renter.status !== "ACTIVE") throw new Error("Choose an active renter in this association.");

    receiptNumber = await allocateReceiptNumber(db, admin.tenantId, collectionDate, collectionReceiptSeries(CollectionType.OTHER));
    const collection = await db.collection.create({
      data: {
        tenantId: admin.tenantId,
        type: CollectionType.OTHER,
        description: "Rental payment",
        payerType: renter.homeownerId ? PayerType.HOMEOWNER : PayerType.RENTER,
        payerName: renter.homeownerId ? null : renter.fullName,
        homeownerId: renter.homeownerId,
        contractorId: null,
        amount,
        collectionDate,
        method,
        referenceNumber,
        receiptNumber,
        remarks: [allocationMode === "ADVANCE" ? "Advance rental payment" : "Rental payment", remarks].filter(Boolean).join(" · "),
        refundable: false,
        refundStatus: RefundStatus.NOT_APPLICABLE,
        createdById: admin.id,
      },
    });

    await db.auditLog.create({
      data: {
        tenantId: admin.tenantId,
        actorId: admin.id,
        module: "RENTALS",
        action: "RECORD_RENTAL_PAYMENT",
        entityType: "Collection",
        entityId: collection.id,
        metadata: { renterId, amount, receiptNumber, allocationMode, payerType: renter.homeownerId ? "HOMEOWNER" : "RENTER" },
      },
    });

    if (allocationMode === "AUTO") {
      const result = await applyRentalCreditsForRenter(db, admin.tenantId, admin.id, renter, [collection.id]);
      applied = result.applied;
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateRentalPages();
  redirect(`/admin/rentals?view=payments&success=rental-payment-recorded&receipt=${encodeURIComponent(receiptNumber)}&applied=${applied.toFixed(2)}`);
}

export async function generateRentalInvoicesAndReconcileAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_MANAGE);
  const { start, end, year, month } = monthBounds(String(formData.get("billingMonth") || ""));
  let created = 0;
  let autoApplied = 0;

  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as Prisma.TransactionClient;
    const agreements = await db.$queryRaw<AgreementInvoiceRow[]>(Prisma.sql`
      SELECT a.id,a.renterId,ra.code AS assetCode,a.monthlyRate,a.billingDay,a.dueDay,a.startDate,a.endDate
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

    const renterIds = [...new Set(agreements.map((agreement) => agreement.renterId))];
    for (const renterId of renterIds) {
      const renterRows = await db.$queryRaw<RenterLockRow[]>(Prisma.sql`
        SELECT id,fullName,homeownerId,status FROM Renter
        WHERE tenantId=${admin.tenantId} AND id=${renterId} FOR UPDATE
      `);
      const renter = renterRows[0];
      if (!renter || renter.status !== "ACTIVE") continue;
      const result = await applyRentalCreditsForRenter(db, admin.tenantId, admin.id, renter);
      autoApplied += result.applied;
    }

    await db.$executeRaw(Prisma.sql`
      UPDATE RentalInvoice SET status='OVERDUE',updatedAt=NOW(3)
      WHERE tenantId=${admin.tenantId} AND dueDate<CURDATE() AND balance>0 AND status IN ('OPEN','PARTIAL')
    `);
    await db.auditLog.create({
      data: {
        tenantId: admin.tenantId,
        actorId: admin.id,
        module: "RENTALS",
        action: "GENERATE_RENTAL_INVOICES_AND_RECONCILE",
        entityType: "RentalInvoice",
        metadata: { billingMonth: start.toISOString().slice(0, 7), created, autoApplied: Math.round(autoApplied * 100) / 100, strategy: "OLDEST_DUE_FIRST" },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateRentalPages();
  redirect(`/admin/rentals?view=billing&success=invoices-generated&count=${created}&applied=${autoApplied.toFixed(2)}`);
}

export async function reconcileRentalCreditsAction() {
  const admin = await requirePermission(Permission.BILLING_MANAGE);
  let applied = 0;
  let allocations = 0;

  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as Prisma.TransactionClient;
    const renters = await db.$queryRaw<RenterLockRow[]>(Prisma.sql`
      SELECT r.id,r.fullName,r.homeownerId,r.status
      FROM Renter r
      WHERE r.tenantId=${admin.tenantId} AND r.status='ACTIVE'
        AND EXISTS (
          SELECT 1 FROM RentalAgreement a
          WHERE a.tenantId=r.tenantId AND a.renterId=r.id
        )
      ORDER BY r.fullName
      FOR UPDATE
    `);
    for (const renter of renters) {
      const result = await applyRentalCreditsForRenter(db, admin.tenantId, admin.id, renter);
      applied += result.applied;
      allocations += result.allocations;
    }
    await db.auditLog.create({
      data: {
        tenantId: admin.tenantId,
        actorId: admin.id,
        module: "RENTALS",
        action: "RECONCILE_RENTAL_CREDITS",
        entityType: "RentalPaymentAllocation",
        metadata: { applied: Math.round(applied * 100) / 100, allocations, strategy: "OLDEST_DUE_FIRST" },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateRentalPages();
  redirect(`/admin/rentals?view=reconciliation&success=credits-reconciled&applied=${applied.toFixed(2)}&allocations=${allocations}`);
}
