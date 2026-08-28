import "server-only";

import { PaymentRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PAYMONGO_PAYMENT_REQUEST_MARKER } from "@/lib/homeowner-payment-flow";

export const HOMEOWNER_HIDE_ONLINE_PAYMENT_HISTORY = "HOMEOWNER_HIDE_ONLINE_PAYMENT_HISTORY";
export const HOMEOWNER_RESTORE_ONLINE_PAYMENT_HISTORY = "HOMEOWNER_RESTORE_ONLINE_PAYMENT_HISTORY";

const visibilityActions = [
  HOMEOWNER_HIDE_ONLINE_PAYMENT_HISTORY,
  HOMEOWNER_RESTORE_ONLINE_PAYMENT_HISTORY,
];

export async function hiddenHomeownerPaymentRequestIds(input: {
  tenantId: string;
  actorId: string;
  requestIds: string[];
}) {
  if (!input.requestIds.length) return new Set<string>();
  const audits = await prisma.auditLog.findMany({
    where: {
      tenantId: input.tenantId,
      actorId: input.actorId,
      module: "PAYMENTS",
      entityType: "PaymentRequest",
      entityId: { in: input.requestIds },
      action: { in: visibilityActions },
    },
    select: { entityId: true, action: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const hidden = new Set<string>();
  for (const audit of audits) {
    if (!audit.entityId) continue;
    if (audit.action === HOMEOWNER_HIDE_ONLINE_PAYMENT_HISTORY) hidden.add(audit.entityId);
    if (audit.action === HOMEOWNER_RESTORE_ONLINE_PAYMENT_HISTORY) hidden.delete(audit.entityId);
  }
  return hidden;
}

async function ownedOnlinePaymentRequest(input: {
  tenantId: string;
  homeownerId: string;
  requestId: string;
}) {
  return prisma.paymentRequest.findFirst({
    where: {
      id: input.requestId,
      tenantId: input.tenantId,
      homeownerId: input.homeownerId,
      proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
    },
    select: { id: true, status: true },
  });
}

export async function setHomeownerPaymentHistoryVisibility(input: {
  tenantId: string;
  homeownerId: string;
  actorId: string;
  requestId: string;
  hidden: boolean;
}) {
  const request = await ownedOnlinePaymentRequest(input);
  if (!request) throw new Error("Online payment history record was not found.");

  if (input.hidden && ![PaymentRequestStatus.APPROVED, PaymentRequestStatus.REJECTED].includes(request.status)) {
    throw new Error("Only completed or closed online payment activity can be archived from your view.");
  }

  const hiddenIds = await hiddenHomeownerPaymentRequestIds({
    tenantId: input.tenantId,
    actorId: input.actorId,
    requestIds: [request.id],
  });
  if (hiddenIds.has(request.id) === input.hidden) return;

  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorId,
      module: "PAYMENTS",
      action: input.hidden ? HOMEOWNER_HIDE_ONLINE_PAYMENT_HISTORY : HOMEOWNER_RESTORE_ONLINE_PAYMENT_HISTORY,
      entityType: "PaymentRequest",
      entityId: request.id,
      metadata: {
        homeownerId: input.homeownerId,
        visibility: input.hidden ? "HIDDEN_FROM_HOMEOWNER_HISTORY" : "VISIBLE_TO_HOMEOWNER",
        retention: "PAYMENT_REQUEST_AND_ACCOUNTING_EVIDENCE_UNCHANGED",
        source: "HOMEOWNER_SELF_SERVICE",
      },
    },
  });
}
