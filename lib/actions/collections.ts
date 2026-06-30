"use server";

import { CollectionType, PayerType, Prisma, RefundStatus, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bondRefundSchema, collectionSchema } from "@/lib/validation";
import { allocateReceiptNumber, collectionReceiptSeries } from "@/lib/services/receipt";

const refundableTypes = new Set<CollectionType>([CollectionType.CONSTRUCTION_BOND, CollectionType.CONTRACTOR_BOND]);

export async function recordCollectionAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const parsed = collectionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid collection details.");
  const data = parsed.data;
  const refundable = refundableTypes.has(data.type);

  if (data.type === CollectionType.CONSTRUCTION_BOND && data.payerType !== PayerType.HOMEOWNER) {
    throw new Error("A construction bond must be assigned to a homeowner.");
  }
  if (data.type === CollectionType.CONTRACTOR_BOND && data.payerType !== PayerType.CONTRACTOR) {
    throw new Error("A contractor bond must be assigned to a contractor profile.");
  }
  if (data.type === CollectionType.OTHER && !data.description) throw new Error("Enter a name for the other collection type.");
  if (data.payerType === PayerType.HOMEOWNER && !data.homeownerId) throw new Error("Select a homeowner.");
  if (data.payerType === PayerType.CONTRACTOR && !data.contractorId) throw new Error("Select a contractor.");

  if (data.payerType === PayerType.HOMEOWNER) {
    const exists = await prisma.homeownerProfile.count({ where: { id: data.homeownerId } });
    if (!exists) throw new Error("Homeowner not found.");
  } else {
    const exists = await prisma.contractorProfile.count({ where: { id: data.contractorId } });
    if (!exists) throw new Error("Contractor not found.");
  }

  await prisma.$transaction(async (tx) => {
    const collectionDate = new Date(`${data.collectionDate}T00:00:00.000Z`);
    const series = collectionReceiptSeries(data.type);
    const receiptNumber = await allocateReceiptNumber(tx, collectionDate, series);
    const collection = await tx.collection.create({ data: {
      type: data.type,
      description: data.description || null,
      payerType: data.payerType,
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
    await tx.auditLog.create({ data: { actorId: admin.id, module: "RECEIPTS", action: `GENERATE_${series}_RECEIPT`, entityType: "Collection", entityId: collection.id, metadata: { receiptNumber, amount: data.amount, payerType: data.payerType } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateCollectionPages();
  redirect("/admin/collections?success=recorded");
}

export async function recordBondRefundAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const parsed = bondRefundSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid refund details.");
  const data = parsed.data;

  await prisma.$transaction(async (tx) => {
    const collection = await tx.collection.findUnique({ where: { id: data.collectionId } });
    if (!collection || !collection.refundable) throw new Error("Refundable bond not found.");
    if (collection.refundStatus === RefundStatus.REFUNDED || collection.refundStatus === RefundStatus.FORFEITED) throw new Error("This bond is already closed.");
    const available = Number(collection.amount) - Number(collection.amountRefunded) - Number(collection.amountForfeited);
    if (data.amount > available) throw new Error("Refund cannot exceed the remaining bond balance.");
    const amountRefunded = Number(collection.amountRefunded) + data.amount;
    const remaining = Number(collection.amount) - amountRefunded - Number(collection.amountForfeited);
    await tx.bondRefund.create({
      data: {
        collectionId: collection.id,
        amount: data.amount,
        refundDate: new Date(`${data.refundDate}T00:00:00.000Z`),
        method: data.method,
        referenceNumber: data.referenceNumber || null,
        remarks: data.remarks || null,
        processedById: admin.id,
      },
    });
    await tx.collection.update({
      where: { id: collection.id },
      data: { amountRefunded, refundStatus: remaining === 0 ? RefundStatus.REFUNDED : RefundStatus.PARTIALLY_REFUNDED },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateCollectionPages();
  redirect("/admin/collections?success=refunded");
}

export async function forfeitBondAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const collectionId = String(formData.get("collectionId") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!reason) throw new Error("A violation or forfeiture reason is required.");
  if (reason.length > 500) throw new Error("Forfeiture reason is too long.");

  await prisma.$transaction(async (tx) => {
    const collection = await tx.collection.findUnique({ where: { id: collectionId } });
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
  await requireUser(Role.ADMIN);
  const id = String(formData.get("id") || "");
  const collection = await prisma.collection.findUnique({ where: { id }, select: { _count: { select: { refunds: true } }, amountForfeited: true } });
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
