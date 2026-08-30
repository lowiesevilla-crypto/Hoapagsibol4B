import "server-only";

import { PaymentRequestStatus, PaymentRequestType } from "@prisma/client";
import { platformPrisma as prisma } from "@/lib/db";
import { paymongoBatchDescription, paymongoBatchId } from "@/lib/homeowner-paymongo-batch";
import { PAYMONGO_PAYMENT_REQUEST_MARKER } from "@/lib/homeowner-payment-flow";

export type PayMongoCanonicalReceipt = {
  kind: "payment" | "collection";
  id: string;
  receiptNumber: string;
};

export type PayMongoCanonicalEvidence = {
  reconciled: boolean;
  receipts: PayMongoCanonicalReceipt[];
};

export async function getPayMongoCanonicalEvidence(input: {
  requestId: string;
  tenantId: string;
  homeownerId?: string;
}): Promise<PayMongoCanonicalEvidence> {
  const initial = await prisma.paymentRequest.findFirst({
    where: {
      id: input.requestId,
      tenantId: input.tenantId,
      proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
      ...(input.homeownerId ? { homeownerId: input.homeownerId } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      homeownerId: true,
      type: true,
      description: true,
      status: true,
      paymentId: true,
      collectionId: true,
    },
  });
  if (!initial) return { reconciled: false, receipts: [] };

  const leaderId = paymongoBatchId(initial.description, initial.id);
  const leader = leaderId === initial.id
    ? initial
    : await prisma.paymentRequest.findFirst({
        where: {
          id: leaderId,
          tenantId: input.tenantId,
          homeownerId: initial.homeownerId,
          proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
        },
        select: {
          id: true,
          tenantId: true,
          homeownerId: true,
          type: true,
          description: true,
          status: true,
          paymentId: true,
          collectionId: true,
        },
      });
  if (!leader) return { reconciled: false, receipts: [] };

  const batch = leader.type === PaymentRequestType.MONTHLY_DUES && leader.description === paymongoBatchDescription(leader.id)
    ? await prisma.paymentRequest.findMany({
        where: {
          tenantId: leader.tenantId,
          homeownerId: leader.homeownerId,
          type: PaymentRequestType.MONTHLY_DUES,
          description: paymongoBatchDescription(leader.id),
          proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
        },
        select: {
          id: true,
          tenantId: true,
          homeownerId: true,
          type: true,
          status: true,
          paymentId: true,
          collectionId: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    : [leader];

  if (!batch.length || batch.some((request) => request.status !== PaymentRequestStatus.APPROVED)) {
    return { reconciled: false, receipts: [] };
  }

  const paymentIds = batch
    .filter((request) => request.type === PaymentRequestType.MONTHLY_DUES)
    .map((request) => request.paymentId)
    .filter((id): id is string => Boolean(id));
  const collectionIds = batch
    .filter((request) => request.type !== PaymentRequestType.MONTHLY_DUES)
    .map((request) => request.collectionId)
    .filter((id): id is string => Boolean(id));

  const [payments, collections] = await Promise.all([
    paymentIds.length
      ? prisma.payment.findMany({
          where: {
            tenantId: leader.tenantId,
            homeownerId: leader.homeownerId,
            id: { in: paymentIds },
            receiptNumber: { not: null },
          },
          select: { id: true, receiptNumber: true },
        })
      : Promise.resolve([]),
    collectionIds.length
      ? prisma.collection.findMany({
          where: {
            tenantId: leader.tenantId,
            homeownerId: leader.homeownerId,
            id: { in: collectionIds },
            receiptNumber: { not: null },
          },
          select: { id: true, receiptNumber: true },
        })
      : Promise.resolve([]),
  ]);

  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const collectionById = new Map(collections.map((collection) => [collection.id, collection]));
  const receipts: PayMongoCanonicalReceipt[] = [];

  for (const request of batch) {
    if (request.type === PaymentRequestType.MONTHLY_DUES) {
      if (!request.paymentId) return { reconciled: false, receipts: [] };
      const payment = paymentById.get(request.paymentId);
      if (!payment?.receiptNumber) return { reconciled: false, receipts: [] };
      receipts.push({ kind: "payment", id: payment.id, receiptNumber: payment.receiptNumber });
      continue;
    }

    if (!request.collectionId) return { reconciled: false, receipts: [] };
    const collection = collectionById.get(request.collectionId);
    if (!collection?.receiptNumber) return { reconciled: false, receipts: [] };
    receipts.push({ kind: "collection", id: collection.id, receiptNumber: collection.receiptNumber });
  }

  return { reconciled: receipts.length === batch.length, receipts };
}
