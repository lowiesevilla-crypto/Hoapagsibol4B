import "server-only";

import { PaymentMethod, PaymentRequestStatus, PaymentRequestType } from "@prisma/client";
import { platformPrisma as prisma } from "@/lib/db";
import { validatePaidCheckoutAmounts } from "@/lib/homeowner-convenience-fee";
import { paymongoBatchDescription, paymongoBatchId, paymongoCheckoutSessionId } from "@/lib/homeowner-paymongo-batch";
import { isPayMongoPaymentRequest, PAYMONGO_PAYMENT_REQUEST_MARKER } from "@/lib/homeowner-payment-flow";
import { approvePaymentRequest } from "@/lib/services/payment-requests";

const CHECKOUT_RESOURCE_ENDPOINT = "https://api.paymongo.com/v1/checkout_sessions";
const SECRET_KEY_ENV = "PAYMONGO_HOMEOWNER_SECRET_KEY";

type CheckoutAttributes = {
  checkout_url?: string;
  reference_number?: string;
  metadata?: unknown;
  payments?: Array<{
    id?: string;
    attributes?: {
      status?: string;
      amount?: number | string;
      currency?: string;
      paid_at?: number | string;
      source?: { type?: string } | null;
    };
  }>;
};

type CheckoutResponse = {
  data?: { id?: string; attributes?: CheckoutAttributes };
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

function paymentMethodFromSource(source: unknown) {
  const type = String((source as { type?: string } | null)?.type || "").toLowerCase();
  return type === "gcash" ? PaymentMethod.GCASH : PaymentMethod.OTHER;
}

function paidDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const date = new Date(value * 1000);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      const date = new Date(numeric * 1000);
      date.setUTCHours(0, 0, 0, 0);
      return date;
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      parsed.setUTCHours(0, 0, 0, 0);
      return parsed;
    }
  }
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return now;
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

async function retrieveCheckout(checkoutId: string, accountId: string) {
  const response = await fetch(`${CHECKOUT_RESOURCE_ENDPOINT}/${encodeURIComponent(checkoutId)}`, {
    headers: paymongoHeaders(accountId),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as CheckoutResponse | null;
  if (!response.ok || !payload?.data?.id) {
    throw new Error(payload?.errors?.[0]?.detail || "Unable to verify the online checkout with PayMongo.");
  }
  return payload.data;
}

async function loadLeader(requestId: string, tenantId: string, homeownerId?: string) {
  const initial = await prisma.paymentRequest.findFirst({
    where: { id: requestId, tenantId, ...(homeownerId ? { homeownerId } : {}) },
  });
  if (!initial || !isPayMongoPaymentRequest(initial)) throw new Error("Online payment request was not found.");
  const leaderId = paymongoBatchId(initial.description, initial.id);
  if (leaderId === initial.id) return initial;
  const leader = await prisma.paymentRequest.findFirst({
    where: { id: leaderId, tenantId, homeownerId: initial.homeownerId, proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER },
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

export async function reconcileHomeownerPayMongoCheckout(input: {
  requestId: string;
  tenantId: string;
  homeownerId?: string;
}) {
  const leader = await loadLeader(input.requestId, input.tenantId, input.homeownerId);
  const batch = await loadBatch(leader);
  if (batch.every((item) => item.status === PaymentRequestStatus.APPROVED)) {
    return { state: "paid" as const, requestId: leader.id, alreadyPosted: true, paymentRequestCount: batch.length };
  }
  if (batch.some((item) => ![PaymentRequestStatus.PENDING_REVIEW, PaymentRequestStatus.REJECTED, PaymentRequestStatus.APPROVED].includes(item.status))) {
    throw new Error("One or more online payment records are not eligible for gateway reconciliation.");
  }

  const linkedAccountId = leader.proofFileName?.trim() || "";
  if (!linkedAccountId.startsWith("org_")) throw new Error("Tenant PayMongo linked account is invalid.");
  if (batch.some((item) => item.tenantId !== leader.tenantId || item.homeownerId !== leader.homeownerId || item.proofFileName?.trim() !== linkedAccountId)) {
    throw new Error("Online payment batch tenant or merchant context is inconsistent.");
  }

  const checkoutId = await checkoutIdForRequest(leader);
  if (!checkoutId) throw new Error("Online checkout session could not be identified.");
  const checkout = await retrieveCheckout(checkoutId, linkedAccountId);
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
  const paidPayment = payments.find((payment) => String(payment.attributes?.status || "").toLowerCase() === "paid");
  if (!paidPayment?.id) {
    return { state: "awaiting_payment" as const, requestId: leader.id, checkoutId, paymentRequestCount: batch.length };
  }

  const paymentAttributes = paidPayment.attributes || {};
  const currency = String(paymentAttributes.currency || "PHP").toUpperCase();
  if (currency !== "PHP") throw new Error("PayMongo payment currency does not match HOAHub billing currency.");
  const paidCentavos = Number(paymentAttributes.amount || 0);
  const principalCentavos = batch.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0);
  if (!Number.isSafeInteger(principalCentavos) || principalCentavos <= 0) throw new Error("HOAHub payment principal is invalid.");
  const amounts = validatePaidCheckoutAmounts({ requestPrincipalCentavos: principalCentavos, paidCentavos, metadata: attributes.metadata });
  const paymentDate = paidDate(paymentAttributes.paid_at);
  const method = paymentMethodFromSource(paymentAttributes.source);
  const pending = batch.filter((item) => item.status !== PaymentRequestStatus.APPROVED);

  for (const item of pending) {
    await prisma.paymentRequest.update({
      where: { id: item.id },
      data: {
        status: PaymentRequestStatus.PENDING_REVIEW,
        method,
        paymentDate,
        reviewRemarks: null,
        reviewedAt: null,
        reviewedById: null,
      },
    });
    await approvePaymentRequest(
      item.id,
      undefined,
      "Automatically reconciled from verified PayMongo Checkout Session.",
      item.tenantId,
      { allowGatewayConfirmation: true },
    );
  }

  await prisma.auditLog.create({
    data: {
      tenantId: leader.tenantId,
      actorId: null,
      module: "PAYMENTS",
      action: "PAYMONGO_HOMEOWNER_PAYMENT_RECONCILED",
      entityType: "PaymentRequest",
      entityId: leader.id,
      correlationId: checkoutId,
      metadata: {
        checkoutId,
        gatewayPaymentId: paidPayment.id,
        paymentRequestIds: batch.map((item) => item.id),
        paymentRequestCount: batch.length,
        hoaPrincipalAmount: amounts.principalCentavos / 100,
        platformConvenienceFeeAmount: amounts.platformFeeCentavos / 100,
        processingFeeAmount: amounts.providerFeeCentavos / 100,
        totalCustomerPaid: amounts.totalPaidCentavos / 100,
        linkedAccountId,
        reconciliationSource: "PAYMONGO_CHECKOUT_RETRIEVAL",
      },
    },
  });

  return { state: "paid" as const, requestId: leader.id, checkoutId, gatewayPaymentId: paidPayment.id, paymentRequestCount: batch.length };
}

export async function reconcilePendingHomeownerPayMongoPayments(input: { tenantId: string; homeownerId: string }) {
  const pending = await prisma.paymentRequest.findMany({
    where: {
      tenantId: input.tenantId,
      homeownerId: input.homeownerId,
      status: { in: [PaymentRequestStatus.PENDING_REVIEW, PaymentRequestStatus.REJECTED] },
      proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const leaderIds = [...new Set(pending.map((item) => paymongoBatchId(item.description, item.id)))];
  const results = [];
  for (const requestId of leaderIds) {
    try {
      results.push(await reconcileHomeownerPayMongoCheckout({ requestId, tenantId: input.tenantId, homeownerId: input.homeownerId }));
    } catch (error) {
      results.push({ state: "error" as const, requestId, message: error instanceof Error ? error.message : "Online payment reconciliation failed." });
    }
  }
  return results;
}
