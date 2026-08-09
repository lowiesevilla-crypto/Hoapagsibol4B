import "server-only";

import { PaymentRequestStatus, PaymentRequestType } from "@prisma/client";
import { platformPrisma as prisma } from "@/lib/db";
import { paymongoBatchDescription, paymongoBatchId, paymongoCheckoutSessionId } from "@/lib/homeowner-paymongo-batch";
import { isPayMongoPaymentRequest, PAYMONGO_EXPIRED_REMARK, PAYMONGO_PAYMENT_REQUEST_MARKER } from "@/lib/homeowner-payment-flow";

const CHECKOUT_RESOURCE_ENDPOINT = "https://api.paymongo.com/v1/checkout_sessions";
const SECRET_KEY_ENV = "PAYMONGO_HOMEOWNER_SECRET_KEY";

type CheckoutResponse = {
  data?: {
    id?: string;
    attributes?: {
      status?: string;
      reference_number?: string;
      metadata?: unknown;
      payments?: Array<{ attributes?: { status?: string } }>;
    };
  };
  errors?: Array<{ detail?: string }>;
};

function requiredSecret() {
  const secret = process.env[SECRET_KEY_ENV]?.trim();
  if (!secret) throw new Error(`${SECRET_KEY_ENV} is not configured.`);
  return secret;
}

function paymongoHeaders(accountId: string) {
  if (!accountId.startsWith("org_")) throw new Error("Tenant PayMongo linked account is invalid.");
  return {
    Authorization: `Basic ${Buffer.from(`${requiredSecret()}:`).toString("base64")}`,
    Accept: "application/json",
    "Account-ID": accountId,
  };
}

async function checkoutIdForRequest(request: { id: string; tenantId: string; reviewRemarks: string | null }) {
  const direct = paymongoCheckoutSessionId(request.reviewRemarks);
  if (direct) return direct;
  const audit = await prisma.auditLog.findFirst({
    where: {
      tenantId: request.tenantId,
      entityType: "PaymentRequest",
      entityId: request.id,
      action: "CREATE_PAYMONGO_HOMEOWNER_CHECKOUT",
      correlationId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { correlationId: true },
  });
  const recovered = audit?.correlationId?.trim() || "";
  return recovered.startsWith("cs_") ? recovered : "";
}

async function loadLeader(requestId: string, tenantId: string, homeownerId?: string) {
  const initial = await prisma.paymentRequest.findFirst({
    where: { id: requestId, tenantId, ...(homeownerId ? { homeownerId } : {}) },
  });
  if (!initial || !isPayMongoPaymentRequest(initial)) throw new Error("Online payment request was not found.");
  const leaderId = paymongoBatchId(initial.description, initial.id);
  if (leaderId === initial.id) return initial;
  const leader = await prisma.paymentRequest.findFirst({
    where: {
      id: leaderId,
      tenantId,
      homeownerId: initial.homeownerId,
      proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
    },
  });
  if (!leader || !isPayMongoPaymentRequest(leader)) throw new Error("Online payment batch leader was not found.");
  return leader;
}

async function loadBatch(leader: Awaited<ReturnType<typeof loadLeader>>) {
  const isBatch = leader.type === PaymentRequestType.MONTHLY_DUES && leader.description === paymongoBatchDescription(leader.id);
  if (!isBatch) return [leader];
  const rows = await prisma.paymentRequest.findMany({
    where: {
      tenantId: leader.tenantId,
      homeownerId: leader.homeownerId,
      type: PaymentRequestType.MONTHLY_DUES,
      description: paymongoBatchDescription(leader.id),
      proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (!rows.length || !rows.some((row) => row.id === leader.id)) throw new Error("Online payment batch is incomplete.");
  return rows;
}

export async function releaseExpiredHomeownerPayMongoCheckout(input: {
  requestId: string;
  tenantId: string;
  homeownerId?: string;
}) {
  const leader = await loadLeader(input.requestId, input.tenantId, input.homeownerId);
  const batch = await loadBatch(leader);
  const pending = batch.filter((item) => item.status === PaymentRequestStatus.PENDING_REVIEW);
  if (!pending.length) return { state: "not_pending" as const, requestId: leader.id, releasedCount: 0 };

  const linkedAccountId = leader.proofFileName?.trim() || "";
  if (!linkedAccountId.startsWith("org_")) throw new Error("Tenant PayMongo linked account is invalid.");
  if (batch.some((item) => item.tenantId !== leader.tenantId || item.homeownerId !== leader.homeownerId || item.proofFileName?.trim() !== linkedAccountId)) {
    throw new Error("Online payment batch tenant or merchant context is inconsistent.");
  }

  const checkoutId = await checkoutIdForRequest(leader);
  if (!checkoutId) throw new Error("Online checkout session could not be identified.");
  const response = await fetch(`${CHECKOUT_RESOURCE_ENDPOINT}/${encodeURIComponent(checkoutId)}`, {
    headers: paymongoHeaders(linkedAccountId),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as CheckoutResponse | null;
  const checkout = payload?.data;
  if (!response.ok || !checkout?.id) throw new Error(payload?.errors?.[0]?.detail || "Unable to verify the online checkout with PayMongo.");
  if (checkout.id !== checkoutId) throw new Error("PayMongo returned a different checkout session.");

  const attributes = checkout.attributes || {};
  if (String(attributes.reference_number || "").trim() !== String(leader.referenceNumber || "").trim()) {
    throw new Error("PayMongo checkout reference does not match the HOAHub payment request.");
  }
  const metadata = attributes.metadata && typeof attributes.metadata === "object" ? attributes.metadata as Record<string, unknown> : {};
  if (metadata.tenantId && String(metadata.tenantId) !== leader.tenantId) throw new Error("PayMongo checkout tenant metadata does not match.");
  if (metadata.homeownerId && String(metadata.homeownerId) !== leader.homeownerId) throw new Error("PayMongo checkout homeowner metadata does not match.");
  if (metadata.paymentRequestId && String(metadata.paymentRequestId) !== leader.id) throw new Error("PayMongo checkout request metadata does not match.");

  const payments = Array.isArray(attributes.payments) ? attributes.payments : [];
  const hasPaidPayment = payments.some((payment) => String(payment.attributes?.status || "").toLowerCase() === "paid");
  if (hasPaidPayment) {
    return { state: "paid_exists" as const, requestId: leader.id, checkoutId, releasedCount: 0 };
  }

  const checkoutStatus = String(attributes.status || "").trim().toLowerCase();
  if (checkoutStatus !== "expired") {
    return { state: "active" as const, requestId: leader.id, checkoutId, releasedCount: 0 };
  }

  const pendingIds = pending.map((item) => item.id);
  const now = new Date();
  const update = await prisma.paymentRequest.updateMany({
    where: {
      id: { in: pendingIds },
      tenantId: leader.tenantId,
      homeownerId: leader.homeownerId,
      status: PaymentRequestStatus.PENDING_REVIEW,
      proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
    },
    data: {
      status: PaymentRequestStatus.REJECTED,
      reviewRemarks: PAYMONGO_EXPIRED_REMARK,
      reviewedAt: now,
      reviewedById: null,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: leader.tenantId,
      actorId: null,
      module: "PAYMENTS",
      action: "PAYMONGO_HOMEOWNER_CHECKOUT_EXPIRED",
      entityType: "PaymentRequest",
      entityId: leader.id,
      correlationId: checkoutId,
      metadata: {
        checkoutId,
        linkedAccountId,
        paymentRequestIds: pendingIds,
        releasedBillIds: pending.map((item) => item.billId).filter(Boolean),
        releasedCount: update.count,
      },
    },
  });

  return {
    state: "expired" as const,
    requestId: leader.id,
    checkoutId,
    releasedCount: update.count,
  };
}
