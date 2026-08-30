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

type EvidenceRequest = {
  id: string;
  tenantId: string;
  homeownerId: string;
  type: PaymentRequestType;
  description: string | null;
  status: PaymentRequestStatus;
  paymentId: string | null;
  collectionId: string | null;
};

const emptyEvidence = (): PayMongoCanonicalEvidence => ({ reconciled: false, receipts: [] });

export async function getPayMongoCanonicalEvidenceBatch(input: {
  requestIds: string[];
  tenantId: string;
}): Promise<Map<string, PayMongoCanonicalEvidence>> {
  const leaderIds = [...new Set(input.requestIds.filter(Boolean))];
  const result = new Map<string, PayMongoCanonicalEvidence>(leaderIds.map((id) => [id, emptyEvidence()]));
  if (!leaderIds.length) return result;

  const batchDescriptions = leaderIds.map(paymongoBatchDescription);
  const requests = await prisma.paymentRequest.findMany({
    where: {
      tenantId: input.tenantId,
      proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
      OR: [
        { id: { in: leaderIds } },
        { description: { in: batchDescriptions } },
      ],
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
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const groups = new Map<string, EvidenceRequest[]>();
  for (const request of requests) {
    const leaderId = paymongoBatchId(request.description, request.id);
    if (!result.has(leaderId)) continue;
    const current = groups.get(leaderId) || [];
    current.push(request);
    groups.set(leaderId, current);
  }

  const paymentIds = requests.map((request) => request.paymentId).filter((id): id is string => Boolean(id));
  const collectionIds = requests.map((request) => request.collectionId).filter((id): id is string => Boolean(id));
  const [payments, collections] = await Promise.all([
    paymentIds.length
      ? prisma.payment.findMany({
          where: { tenantId: input.tenantId, id: { in: paymentIds }, receiptNumber: { not: null } },
          select: { id: true, homeownerId: true, receiptNumber: true },
        })
      : Promise.resolve([]),
    collectionIds.length
      ? prisma.collection.findMany({
          where: { tenantId: input.tenantId, id: { in: collectionIds }, receiptNumber: { not: null } },
          select: { id: true, homeownerId: true, receiptNumber: true },
        })
      : Promise.resolve([]),
  ]);
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const collectionById = new Map(collections.map((collection) => [collection.id, collection]));

  for (const leaderId of leaderIds) {
    const group = groups.get(leaderId) || [];
    const leader = group.find((request) => request.id === leaderId);
    if (!leader || !group.length) continue;
    const expectedBatch = leader.type === PaymentRequestType.MONTHLY_DUES && leader.description === paymongoBatchDescription(leader.id);
    const evidenceRows = expectedBatch ? group : [leader];
    if (evidenceRows.some((request) => request.tenantId !== input.tenantId || request.homeownerId !== leader.homeownerId || request.status !== PaymentRequestStatus.APPROVED)) continue;

    const receipts: PayMongoCanonicalReceipt[] = [];
    let valid = true;
    for (const request of evidenceRows) {
      if (request.type === PaymentRequestType.MONTHLY_DUES) {
        const payment = request.paymentId ? paymentById.get(request.paymentId) : null;
        if (!payment?.receiptNumber || payment.homeownerId !== request.homeownerId) {
          valid = false;
          break;
        }
        receipts.push({ kind: "payment", id: payment.id, receiptNumber: payment.receiptNumber });
      } else {
        const collection = request.collectionId ? collectionById.get(request.collectionId) : null;
        if (!collection?.receiptNumber || collection.homeownerId !== request.homeownerId) {
          valid = false;
          break;
        }
        receipts.push({ kind: "collection", id: collection.id, receiptNumber: collection.receiptNumber });
      }
    }
    if (valid && receipts.length === evidenceRows.length) result.set(leaderId, { reconciled: true, receipts });
  }

  return result;
}

export async function getPayMongoCanonicalEvidence(input: {
  requestId: string;
  tenantId: string;
  homeownerId?: string;
}): Promise<PayMongoCanonicalEvidence> {
  if (input.homeownerId) {
    const owned = await prisma.paymentRequest.findFirst({
      where: {
        id: input.requestId,
        tenantId: input.tenantId,
        homeownerId: input.homeownerId,
        proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
      },
      select: { id: true, description: true },
    });
    if (!owned) return emptyEvidence();
    const leaderId = paymongoBatchId(owned.description, owned.id);
    const evidence = await getPayMongoCanonicalEvidenceBatch({ requestIds: [leaderId], tenantId: input.tenantId });
    return evidence.get(leaderId) || emptyEvidence();
  }
  const evidence = await getPayMongoCanonicalEvidenceBatch({ requestIds: [input.requestId], tenantId: input.tenantId });
  return evidence.get(input.requestId) || emptyEvidence();
}
