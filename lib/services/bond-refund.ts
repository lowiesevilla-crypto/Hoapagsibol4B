import {
  PaymentMethod,
  Prisma,
  RefundStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";

export type BondRefundActor = {
  id: string;
  tenantId: string;
};

export type RecordBondRefundInput = {
  collectionId: string;
  amount: number;
  refundDate: Date;
  method: PaymentMethod;
  referenceNumber?: string | null;
  remarks?: string | null;
  actor: BondRefundActor;
};

export async function recordBondRefund({
  collectionId,
  amount,
  refundDate,
  method,
  referenceNumber,
  remarks,
  actor,
}: RecordBondRefundInput) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Refund amount must be greater than zero.");
  }
  if (Number.isNaN(refundDate.getTime())) {
    throw new Error("Choose a valid refund date.");
  }

  return prisma.$transaction(
    async (tx) => {
      const collection = await tx.collection.findUnique({
        where: { id: collectionId },
        select: {
          id: true,
          amount: true,
          amountRefunded: true,
          amountForfeited: true,
          receiptNumber: true,
          refundable: true,
          refundStatus: true,
        },
      });
      if (!collection || !collection.refundable) {
        throw new Error("Refundable bond not found.");
      }
      if (
        collection.refundStatus === RefundStatus.REFUNDED ||
        collection.refundStatus === RefundStatus.FORFEITED
      ) {
        throw new Error("This bond is already closed.");
      }

      const bondAmount = Number(collection.amount);
      const previousRefunded = Number(collection.amountRefunded);
      const amountForfeited = Number(collection.amountForfeited);
      const available = roundCurrency(bondAmount - previousRefunded - amountForfeited);
      if (amount > available) {
        throw new Error("Refund cannot exceed the remaining bond balance.");
      }

      const amountRefunded = roundCurrency(previousRefunded + amount);
      const remaining = roundCurrency(bondAmount - amountRefunded - amountForfeited);
      const refundStatus = remaining === 0
        ? RefundStatus.REFUNDED
        : RefundStatus.PARTIALLY_REFUNDED;

      const refund = await tx.bondRefund.create({
        data: {
          collectionId: collection.id,
          amount,
          refundDate,
          method,
          referenceNumber: referenceNumber || null,
          remarks: remarks || null,
          processedById: actor.id,
        },
        select: { id: true, createdAt: true },
      });
      const refundReference = bondRefundReference(refund.id, refundDate);

      await tx.collection.update({
        where: { id: collection.id },
        data: { amountRefunded, refundStatus },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          module: "COLLECTIONS",
          action: "BOND_REFUND_PROCESSED",
          entityType: "BondRefund",
          entityId: refund.id,
          metadata: {
            refundReference,
            collectionId: collection.id,
            collectionReceiptNumber: collection.receiptNumber,
            amount,
            previousRefunded,
            amountRefunded,
            amountForfeited,
            remaining,
            refundStatus,
            method,
            externalReferenceNumber: referenceNumber || null,
          },
        },
      });

      return {
        id: refund.id,
        refundReference,
        amountRefunded,
        remaining,
        refundStatus,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export function bondRefundReference(refundId: string, refundDate: Date) {
  return `RF-BR-${refundDate.getUTCFullYear()}-${refundId.slice(-8).toUpperCase()}`;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
