"use server";

import { CollectionType, PayerType, Prisma, RefundStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission, requirePermissions } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { bondDuesCreditBatchPrefix } from "@/lib/bond-dues-credit";
import { isRefundableBondType } from "@/lib/bond-rules";
import { prisma } from "@/lib/db";
import { applyConstructionBondToMonthlyDues } from "@/lib/services/bond-dues-credit";
import { recordBondRefund } from "@/lib/services/bond-refund";
import { allocateReceiptNumber, collectionReceiptSeries } from "@/lib/services/receipt";
import { bondRefundSchema, collectionSchema } from "@/lib/validation";

const rentalPaymentsHref = "/admin/rentals?view=payments&source=collections";

export async function recordCollectionAction(formData: FormData) {
  const admin = await requirePermissions([
    Permission.COLLECTIONS_RECORD,
    Permission.RECEIPTS_ISSUE,
  ]);

  const requestedType = String(formData.get("type") || "");
  const requestedPayerType = String(formData.get("payerType") || "");
  if (requestedType === "RENTAL_PAYMENT" || (requestedType === CollectionType.OTHER && requestedPayerType === PayerType.RENTER)) {
    redirect(rentalPaymentsHref);
  }

  const parsed = collectionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid collection details.");
  const data = parsed.data;
  const refundable = isRefundableBondType(data.type);
  const externalPayer = data.payerType === PayerType.RENTER || data.payerType === PayerType.OTHER;
  const payerName = data.payerName?.trim() ?? "";

  if (data.type === CollectionType.CONSTRUCTION_BOND && data.payerType !== PayerType.HOMEOWNER) {
    throw new Error("A construction bond must be assigned to a homeowner.");
  }
  if (data.type === CollectionType.CONTRACTOR_BOND && data.payerType !== PayerType.CONTRACTOR) {
    throw new Error("A contractor bond must be assigned to a contractor profile.");
  }
  if (externalPayer && data.type !== CollectionType.OTHER) {
    throw new Error("Renter and other payers are available only for Other income collections.");
  }
  if (data.type === CollectionType.OTHER && !data.description) throw new Error("Enter a name for the other collection type.");
  if (externalPayer && !payerName) throw new Error("Enter the payer name.");
  if (data.payerType === PayerType.HOMEOWNER && !data.homeownerId) throw new Error("Select a homeowner.");
  if (data.payerType === PayerType.CONTRACTOR && !data.contractorId) throw new Error("Select a contractor.");

  if (data.payerType === PayerType.HOMEOWNER) {
    const exists = await prisma.homeownerProfile.count({ where: { id: data.homeownerId, tenantId: admin.tenantId } });
    if (!exists) throw new Error("Homeowner not found.");
  } else if (data.payerType === PayerType.CONTRACTOR) {
    const exists = await prisma.contractorProfile.count({ where: { id: data.contractorId, tenantId: admin.tenantId } });
    if (!exists) throw new Error("Contractor not found.");
  }

  await prisma.$transaction(async (tx) => {
    const collectionDate = new Date(`${data.collectionDate}T00:00:00.000Z`);
    const series = collectionReceiptSeries(data.type);
    const receiptNumber = await allocateReceiptNumber(tx as unknown as Prisma.TransactionClient, admin.tenantId, collectionDate, series);
    const collection = await tx.collection.create({ data: {
      tenantId: admin.tenantId,
      type: data.type,
      description: data.description || null,
      payerType: data.payerType,
      payerName: externalPayer ? payerName : null,
      homeownerId: data.payerType === PayerType.HOMEOWNER ? data.homeownerId : null,
      contractorId: data.payerType === PayerType.CONTRACTOR ? data.contractorId : null,
      amount: data.amount,
      collectionDate,
      method: data.method,
      referenceNumber: data.referenceNumber || null,
      receiptNumber,
      remarks: data.remarks || null,
      refundable,
      refundStatus: refundable ? RefundStatus.HELD : RefundStatus.NOT_APPLICABLE,
      createdById: admin.id,
    } });
    await tx.auditLog.create({ data: {
      tenantId: admin.tenantId,
      actorId: admin.id,
      module: "RECEIPTS",
      action: `GENERATE_${series}_RECEIPT`,
      entityType: "Collection",
      entityId: collection.id,
      metadata: { receiptNumber, amount: data.amount, payerType: data.payerType, payerName: externalPayer ? payerName : null },
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateCollectionPages();
  redirect("/admin/collections?success=recorded");
}

export async function recordBondRefundAction(formData: FormData) {
  const admin = await requirePermission(Permission.COLLECTIONS_REFUND);
  const parsed = bondRefundSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid refund details.");
  const data = parsed.data;

  await recordBondRefund({
    collectionId: data.collectionId,
    amount: data.amount,
    refundDate: new Date(`${data.refundDate}T00:00:00.000Z`),
    method: data.method,
    referenceNumber: data.referenceNumber,
    remarks: data.remarks,
    actor: { id: admin.id, tenantId: admin.tenantId },
  });

  revalidateCollectionPages();
  redirect("/admin/collections?success=refunded");
}

export async function applyConstructionBondToDuesAction(formData: FormData) {
  const admin = await requirePermissions([Permission.COLLECTIONS_REFUND, Permission.PAYMENTS_RECORD]);
  const collectionId = String(formData.get("collectionId") || "").trim();
  const amount = Number(formData.get("amount"));
  const applicationDateText = String(formData.get("applicationDate") || "").trim();
  const idempotencyKey = String(formData.get("idempotencyKey") || "").trim();
  const authorizationReference = String(formData.get("authorizationReference") || "").trim();
  const remarks = String(formData.get("remarks") || "").trim();
  if (!collectionId) throw new Error("Select a Construction Bond.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(applicationDateText)) throw new Error("Choose a valid application date.");
  if (!authorizationReference) throw new Error("Enter the homeowner authorization or request reference.");
  if (authorizationReference.length > 191) throw new Error("Authorization reference is too long.");
  if (remarks.length > 500) throw new Error("Remarks are too long.");

  const result = await applyConstructionBondToMonthlyDues({
    collectionId,
    amount,
    applicationDate: new Date(`${applicationDateText}T00:00:00.000Z`),
    idempotencyKey,
    authorizationReference,
    remarks: remarks || null,
    actor: { id: admin.id, tenantId: admin.tenantId, name: admin.name, email: admin.email },
  });

  revalidateCollectionPages(result.paymentId);
  redirect(`/admin/collections?success=bond-credit&receipt=${encodeURIComponent(result.receiptNumber || "")}`);
}

export async function forfeitBondAction(formData: FormData) {
  const admin = await requirePermission(Permission.COLLECTIONS_FORFEIT);
  const collectionId = String(formData.get("collectionId") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!reason) throw new Error("A violation or forfeiture reason is required.");
  if (reason.length > 500) throw new Error("Forfeiture reason is too long.");

  await prisma.$transaction(async (tx) => {
    const collection = await tx.collection.findFirst({
      where: { id: collectionId, tenantId: admin.tenantId },
    });
    if (!collection || !isRefundableBondType(collection.type)) throw new Error("Refundable bond not found.");
    if (collection.refundStatus === RefundStatus.REFUNDED || collection.refundStatus === RefundStatus.FORFEITED) throw new Error("This bond is already closed.");
    const applied = await tx.payment.aggregate({
      where: { tenantId: admin.tenantId, status: "ACTIVE", paymentBatchId: { startsWith: bondDuesCreditBatchPrefix(collection.id) } },
      _sum: { amount: true },
    });
    const amountAppliedToDues = Number(applied._sum.amount ?? 0);
    const available = Number(collection.amount) - Number(collection.amountRefunded) - Number(collection.amountForfeited) - amountAppliedToDues;
    if (available <= 0) throw new Error("No bond balance remains to forfeit.");
    await tx.collection.update({
      where: { id: collection.id },
      data: {
        refundable: true,
        amountForfeited: Number(collection.amountForfeited) + available,
        refundStatus: RefundStatus.FORFEITED,
        forfeitedAt: new Date(),
        forfeitedById: admin.id,
        remarks: [collection.remarks, `Forfeited: ${reason}`].filter(Boolean).join("\n"),
      },
    });
    await tx.auditLog.create({ data: {
      tenantId: admin.tenantId,
      actorId: admin.id,
      module: "COLLECTIONS",
      action: "BOND_BALANCE_FORFEITED",
      entityType: "Collection",
      entityId: collection.id,
      metadata: { amountForfeited: available, amountAppliedToDues, reason },
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateCollectionPages();
  redirect("/admin/collections?success=forfeited");
}

export async function deleteCollectionAction(formData: FormData) {
  const admin = await requirePermission(Permission.COLLECTIONS_MANAGE);
  const id = String(formData.get("id") || "");
  const [collection, bondCreditCount] = await Promise.all([
    prisma.collection.findFirst({
      where: { id, tenantId: admin.tenantId },
      select: { _count: { select: { refunds: true } }, amountForfeited: true },
    }),
    prisma.payment.count({ where: { tenantId: admin.tenantId, paymentBatchId: { startsWith: bondDuesCreditBatchPrefix(id) } } }),
  ]);
  if (!collection) throw new Error("Collection not found.");
  if (collection._count.refunds || Number(collection.amountForfeited) > 0 || bondCreditCount > 0) throw new Error("A bond with refund, dues application, or forfeiture history cannot be deleted.");
  await prisma.collection.delete({ where: { id } });
  revalidateCollectionPages();
  redirect("/admin/collections?success=deleted");
}

function revalidateCollectionPages(paymentId?: string) {
  revalidatePath("/admin/collections");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/payments/active");
  revalidatePath("/admin/payments/history");
  revalidatePath("/admin/billing");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/reports/homeowner-balances");
  revalidatePath("/admin/reports/transactions");
  revalidatePath("/portal/collections");
  revalidatePath("/portal/billing");
  revalidatePath("/portal/payments");
  revalidatePath("/portal/dashboard");
  if (paymentId) revalidatePath(`/receipts/payment/${paymentId}`);
}
