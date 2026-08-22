"use server";

import { CollectionType, PayerType, Prisma, RefundStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission, requirePermissions } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { recordBondRefund } from "@/lib/services/bond-refund";
import { allocateReceiptNumber, collectionReceiptSeries } from "@/lib/services/receipt";
import { bondRefundSchema, collectionSchema } from "@/lib/validation";

const refundableTypes = new Set<CollectionType>([CollectionType.CONSTRUCTION_BOND, CollectionType.CONTRACTOR_BOND]);
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
  const refundable = refundableTypes.has(data.type);
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
    if (!collection || !collection.refundable) throw new Error("Refundable bond not found.");
    if (collection.refundStatus === RefundStatus.REFUNDED || collection.refundStatus === RefundStatus.FORFEITED) throw new Error("This bond is already closed.");
    const available = Number(collection.amount) - Number(collection.amountRefunded) - Number(collection.amountForfeited);
    if (available <= 0) throw new Error("No bond balance remains to forfeit.");
    await tx.collection.update({
      where: { id: collection.id },
      data: {
        amountForfeited: Number(collection.amountForfeited) + available,
        refundStatus: RefundStatus.FORFEITED,
        forfeitedAt: new Date(),
        forfeitedById: admin.id,
        remarks: [collection.remarks, `Forfeited: ${reason}`].filter(Boolean).join("\n"),
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateCollectionPages();
  redirect("/admin/collections?success=forfeited");
}

export async function deleteCollectionAction(formData: FormData) {
  const admin = await requirePermission(Permission.COLLECTIONS_MANAGE);
  const id = String(formData.get("id") || "");
  const collection = await prisma.collection.findFirst({
    where: { id, tenantId: admin.tenantId },
    select: { _count: { select: { refunds: true } }, amountForfeited: true },
  });
  if (!collection) throw new Error("Collection not found.");
  if (collection._count.refunds || Number(collection.amountForfeited) > 0) throw new Error("A bond with refund or forfeiture history cannot be deleted.");
  await prisma.collection.delete({ where: { id } });
  revalidateCollectionPages();
  redirect("/admin/collections?success=deleted");
}

function revalidateCollectionPages() {
  revalidatePath("/admin/collections");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/reports");
  revalidatePath("/portal/collections");
  revalidatePath("/portal/dashboard");
}
