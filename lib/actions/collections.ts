"use server";

import { randomUUID } from "node:crypto";
import { CollectionType, PayerType, Prisma, RefundStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission, requirePermissions } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { bondRefundUserMessage } from "@/lib/bond-refund-errors";
import { isRefundableBondType } from "@/lib/bond-rules";
import { prisma } from "@/lib/db";
import { recordBondRefund } from "@/lib/services/bond-refund";
import { allocateReceiptNumber, collectionReceiptSeries } from "@/lib/services/receipt";
import { withTenantContext } from "@/lib/tenant-context";
import { bondRefundSchema, collectionSchema } from "@/lib/validation";

const rentalPaymentsHref = "/admin/rentals?view=payments&source=collections";
const collectionRevalidationPaths = [
  "/admin/collections",
  "/admin/dashboard",
  "/admin/reports",
  "/portal/collections",
  "/portal/dashboard",
] as const;

class CollectionPostingError extends Error {}
class BondForfeitError extends Error {}
class CollectionDeleteError extends Error {}

function redirectCollectionError(message: string): never {
  redirect(`/admin/collections?collectionError=${encodeURIComponent(message)}`);
}

function redirectForfeitError(message: string): never {
  redirect(`/admin/collections?forfeitError=${encodeURIComponent(message)}`);
}

function redirectDeleteError(message: string): never {
  redirect(`/admin/collections?deleteError=${encodeURIComponent(message)}`);
}

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
  if (!parsed.success) redirectCollectionError(parsed.error.issues[0]?.message || "Invalid collection details.");
  const data = parsed.data;
  const refundable = isRefundableBondType(data.type);
  const externalPayer = data.payerType === PayerType.RENTER || data.payerType === PayerType.OTHER;
  const payerName = data.payerName?.trim() ?? "";

  if (data.type === CollectionType.CONSTRUCTION_BOND && data.payerType !== PayerType.HOMEOWNER) {
    redirectCollectionError("A construction bond must be assigned to a homeowner.");
  }
  if (data.type === CollectionType.CONTRACTOR_BOND && data.payerType !== PayerType.CONTRACTOR) {
    redirectCollectionError("A contractor bond must be assigned to a contractor profile.");
  }
  if (externalPayer && data.type !== CollectionType.OTHER) {
    redirectCollectionError("Renter and other payers are available only for Other income collections.");
  }
  if (data.type === CollectionType.OTHER && !data.description) redirectCollectionError("Enter a name for the other collection type.");
  if (externalPayer && !payerName) redirectCollectionError("Enter the payer name.");
  if (data.payerType === PayerType.HOMEOWNER && !data.homeownerId) redirectCollectionError("Select a homeowner.");
  if (data.payerType === PayerType.CONTRACTOR && !data.contractorId) redirectCollectionError("Select a contractor.");

  let collectionError: string | null = null;
  try {
    await withTenantContext(admin.tenantId, async () => {
      if (data.payerType === PayerType.HOMEOWNER) {
        const exists = await prisma.homeownerProfile.count({ where: { id: data.homeownerId, tenantId: admin.tenantId } });
        if (!exists) throw new CollectionPostingError("Homeowner not found.");
      } else if (data.payerType === PayerType.CONTRACTOR) {
        const exists = await prisma.contractorProfile.count({ where: { id: data.contractorId, tenantId: admin.tenantId } });
        if (!exists) throw new CollectionPostingError("Contractor not found.");
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
    });
  } catch (error) {
    if (error instanceof CollectionPostingError) {
      collectionError = error.message;
    } else {
      const supportReference = `BC-${randomUUID().split("-")[0].toUpperCase()}`;
      console.error("[HOAHub] collection_record_failed", {
        supportReference,
        tenantId: admin.tenantId,
        actorId: admin.id,
        type: data.type,
        payerType: data.payerType,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      collectionError = `We couldn't record this collection. No changes were saved. Support reference: ${supportReference}.`;
    }
  }

  if (collectionError) redirectCollectionError(collectionError);

  safeRevalidateCollectionPages({ action: "record", tenantId: admin.tenantId, actorId: admin.id });
  redirect("/admin/collections?success=recorded");
}

export async function recordBondRefundAction(formData: FormData) {
  const admin = await requirePermission(Permission.COLLECTIONS_REFUND);
  const parsed = bondRefundSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "Invalid refund details.";
    redirect(`/admin/collections?refundError=${encodeURIComponent(message)}`);
  }
  const data = parsed.data;

  let refundError: string | null = null;
  try {
    await withTenantContext(admin.tenantId, () => recordBondRefund({
      collectionId: data.collectionId,
      amount: data.amount,
      refundDate: new Date(`${data.refundDate}T00:00:00.000Z`),
      method: data.method,
      referenceNumber: data.referenceNumber,
      remarks: data.remarks,
      actor: { id: admin.id, tenantId: admin.tenantId },
    }));
  } catch (error) {
    refundError = bondRefundUserMessage(error);
    if (!refundError) {
      const supportReference = `BR-${randomUUID().split("-")[0].toUpperCase()}`;
      console.error("[HOAHub] bond_refund_failed", {
        supportReference,
        tenantId: admin.tenantId,
        actorId: admin.id,
        collectionId: data.collectionId,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      refundError = `We couldn't process this bond refund. No changes were saved. Support reference: ${supportReference}.`;
    }
  }

  if (refundError) {
    redirect(`/admin/collections?refundError=${encodeURIComponent(refundError)}`);
  }

  safeRevalidateCollectionPages({ action: "refund", tenantId: admin.tenantId, actorId: admin.id });
  redirect("/admin/collections?success=refunded");
}

export async function forfeitBondAction(formData: FormData) {
  const admin = await requirePermission(Permission.COLLECTIONS_FORFEIT);
  const collectionId = String(formData.get("collectionId") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!collectionId) redirectForfeitError("Refundable bond not found.");
  if (!reason) redirectForfeitError("A violation or forfeiture reason is required.");
  if (reason.length > 500) redirectForfeitError("Forfeiture reason is too long.");

  let forfeitError: string | null = null;
  try {
    await withTenantContext(admin.tenantId, async () => {
      await prisma.$transaction(async (tx) => {
        const collection = await tx.collection.findFirst({
          where: { id: collectionId, tenantId: admin.tenantId },
        });
        if (!collection || !isRefundableBondType(collection.type)) throw new BondForfeitError("Refundable bond not found.");
        if (collection.refundStatus === RefundStatus.REFUNDED || collection.refundStatus === RefundStatus.FORFEITED) {
          throw new BondForfeitError("This bond is already closed.");
        }
        const available = Number(collection.amount) - Number(collection.amountRefunded) - Number(collection.amountForfeited);
        if (available <= 0) throw new BondForfeitError("No bond balance remains to forfeit.");

        const updated = await tx.collection.updateMany({
          where: { id: collection.id, tenantId: admin.tenantId },
          data: {
            refundable: true,
            amountForfeited: Number(collection.amountForfeited) + available,
            refundStatus: RefundStatus.FORFEITED,
            forfeitedAt: new Date(),
            forfeitedById: admin.id,
            remarks: [collection.remarks, `Forfeited: ${reason}`].filter(Boolean).join("\n"),
          },
        });
        if (updated.count !== 1) throw new BondForfeitError("Refundable bond not found.");

        await tx.auditLog.create({ data: {
          tenantId: admin.tenantId,
          actorId: admin.id,
          module: "COLLECTIONS",
          action: "BOND_FORFEITED",
          entityType: "Collection",
          entityId: collection.id,
          metadata: {
            reason,
            forfeitedAmount: available,
            previousRefundStatus: collection.refundStatus,
            receiptNumber: collection.receiptNumber,
          },
        } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  } catch (error) {
    if (error instanceof BondForfeitError) {
      forfeitError = error.message;
    } else {
      const supportReference = `BF-${randomUUID().split("-")[0].toUpperCase()}`;
      console.error("[HOAHub] bond_forfeit_failed", {
        supportReference,
        tenantId: admin.tenantId,
        actorId: admin.id,
        collectionId,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      forfeitError = `We couldn't forfeit this bond. No changes were saved. Support reference: ${supportReference}.`;
    }
  }

  if (forfeitError) redirectForfeitError(forfeitError);

  safeRevalidateCollectionPages({ action: "forfeit", tenantId: admin.tenantId, actorId: admin.id });
  redirect("/admin/collections?success=forfeited");
}

export async function deleteCollectionAction(formData: FormData) {
  const admin = await requirePermission(Permission.COLLECTIONS_MANAGE);
  const id = String(formData.get("id") || "");
  if (!id) redirectDeleteError("Collection not found.");

  let deleteError: string | null = null;
  try {
    await withTenantContext(admin.tenantId, async () => {
      await prisma.$transaction(async (tx) => {
        const collection = await tx.collection.findFirst({
          where: { id, tenantId: admin.tenantId },
          select: {
            _count: { select: { refunds: true } },
            amount: true,
            amountForfeited: true,
            receiptNumber: true,
            type: true,
          },
        });
        if (!collection) throw new CollectionDeleteError("Collection not found.");
        if (collection._count.refunds || Number(collection.amountForfeited) > 0) {
          throw new CollectionDeleteError("This bond has refund or forfeiture history and must be retained for financial and audit integrity.");
        }

        const deleted = await tx.collection.deleteMany({ where: { id, tenantId: admin.tenantId } });
        if (deleted.count !== 1) throw new CollectionDeleteError("Collection not found.");

        await tx.auditLog.create({ data: {
          tenantId: admin.tenantId,
          actorId: admin.id,
          module: "COLLECTIONS",
          action: "COLLECTION_DELETED",
          entityType: "Collection",
          entityId: id,
          metadata: {
            type: collection.type,
            amount: Number(collection.amount),
            receiptNumber: collection.receiptNumber,
          },
        } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  } catch (error) {
    if (error instanceof CollectionDeleteError) {
      deleteError = error.message;
    } else {
      const supportReference = `CD-${randomUUID().split("-")[0].toUpperCase()}`;
      console.error("[HOAHub] collection_delete_failed", {
        supportReference,
        tenantId: admin.tenantId,
        actorId: admin.id,
        collectionId: id,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      deleteError = `We couldn't delete this collection. No changes were saved. Support reference: ${supportReference}.`;
    }
  }

  if (deleteError) redirectDeleteError(deleteError);

  safeRevalidateCollectionPages({ action: "delete", tenantId: admin.tenantId, actorId: admin.id });
  redirect("/admin/collections?success=deleted");
}

function safeRevalidateCollectionPages(context: { action: string; tenantId: string; actorId: string }) {
  for (const path of collectionRevalidationPaths) {
    try {
      revalidatePath(path);
    } catch (error) {
      console.error("[HOAHub] collection_post_commit_revalidation_failed", {
        ...context,
        path,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
