import "server-only";

import { PaymentMethod, PaymentRequestStatus, PaymentRequestType } from "@prisma/client";
import { platformPrisma as prisma } from "@/lib/db";
import { validatePaidCheckoutAmounts } from "@/lib/homeowner-convenience-fee";
import { paymongoBatchDescription, paymongoBatchId, paymongoCheckoutSessionId } from "@/lib/homeowner-paymongo-batch";
import { isPayMongoPaymentRequest, PAYMONGO_PAYMENT_REQUEST_MARKER } from "@/lib/homeowner-payment-flow";
import {
  classifyPayMongoGatewayState,
  paymongoGatewayPresentation,
  paymongoGatewayRemark,
  type PayMongoGatewayState,
} from "@/lib/paymongo-gateway-status";
import { approvePaymentRequest } from "@/lib/services/payment-requests";

const CHECKOUT_RESOURCE_ENDPOINT = "https://api.paymongo.com/v1/checkout_sessions";
const SECRET_KEY_ENV = "PAYMONGO_HOMEOWNER_SECRET_KEY";

type CheckoutAttributes = {
  status?: string;
  checkout_url?: string;
  reference_number?: string;
  metadata?: unknown;
  payment_intent?: {
    id?: string;
    attributes?: {
      status?: string;
      last_payment_error?: unknown;
    };
  } | null;
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

export type PayMongoPaymentActivity = {
  requestId: string;
  homeownerId: string;
  referenceNumber: string;
  amount: number;
  state: PayMongoGatewayState;
  label: string;
  tone: "success" | "info" | "warning" | "danger" | "default";
  localStatus: string;
  financeStatus: "RECONCILED" | "NOT_POSTED";
  canResume: boolean;
  terminal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TenantPayMongoPaymentActivity = PayMongoPaymentActivity & {
  homeownerName: string;
  property: string;
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
  if (payload.data.id !== checkoutId) throw new Error("PayMongo returned a different checkout session.");
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

type LoadedLeader = Awaited<ReturnType<typeof loadLeader>>;

async function loadBatch(leader: LoadedLeader) {
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

function batchAmount(batch: Awaited<ReturnType<typeof loadBatch>>) {
  const centavos = batch.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0);
  if (!Number.isSafeInteger(centavos) || centavos <= 0) throw new Error("HOAHub payment principal is invalid.");
  return centavos / 100;
}

function activity(leader: LoadedLeader, batch: Awaited<ReturnType<typeof loadBatch>>, state: PayMongoGatewayState): PayMongoPaymentActivity {
  const presentation = paymongoGatewayPresentation(state);
  const reconciled = batch.every((item) => item.status === PaymentRequestStatus.APPROVED);
  return {
    requestId: leader.id,
    homeownerId: leader.homeownerId,
    referenceNumber: leader.referenceNumber || `HOP-${leader.id}`,
    amount: batchAmount(batch),
    state,
    label: presentation.label,
    tone: presentation.tone,
    localStatus: reconciled ? PaymentRequestStatus.APPROVED : leader.status,
    financeStatus: reconciled ? "RECONCILED" : "NOT_POSTED",
    canResume: presentation.canResume,
    terminal: presentation.terminal,
    createdAt: leader.createdAt.toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function validateCheckoutAuthority(checkout: Awaited<ReturnType<typeof retrieveCheckout>>, leader: LoadedLeader) {
  const attributes = checkout.attributes || {};
  if (String(attributes.reference_number || "").trim() !== String(leader.referenceNumber || "").trim()) {
    throw new Error("PayMongo checkout reference does not match the HOAHub payment request.");
  }
  const metadata = attributes.metadata && typeof attributes.metadata === "object" ? attributes.metadata as Record<string, unknown> : {};
  if (metadata.tenantId && String(metadata.tenantId) !== leader.tenantId) throw new Error("PayMongo checkout tenant metadata does not match.");
  if (metadata.homeownerId && String(metadata.homeownerId) !== leader.homeownerId) throw new Error("PayMongo checkout homeowner metadata does not match.");
  if (metadata.paymentRequestId && String(metadata.paymentRequestId) !== leader.id) throw new Error("PayMongo checkout request metadata does not match.");
}

async function markNonPaidState(leader: LoadedLeader, batch: Awaited<ReturnType<typeof loadBatch>>, state: PayMongoGatewayState) {
  const ids = batch.map((item) => item.id);
  if (state === "EXPIRED") {
    await prisma.paymentRequest.updateMany({
      where: { tenantId: leader.tenantId, id: { in: ids }, status: PaymentRequestStatus.PENDING_REVIEW },
      data: {
        status: PaymentRequestStatus.REJECTED,
        reviewRemarks: paymongoGatewayRemark("EXPIRED"),
        reviewedAt: new Date(),
        reviewedById: null,
      },
    });
    return;
  }
  if (["AWAITING_PAYMENT", "AWAITING_ACTION", "PROCESSING", "FAILED_RETRYABLE", "UNAVAILABLE"].includes(state)) {
    await prisma.paymentRequest.updateMany({
      where: { tenantId: leader.tenantId, id: { in: ids }, status: PaymentRequestStatus.PENDING_REVIEW },
      data: {
        reviewRemarks: paymongoGatewayRemark(state),
        reviewedAt: null,
        reviewedById: null,
      },
    });
  }
}

async function postPaidCheckout(leader: LoadedLeader, batch: Awaited<ReturnType<typeof loadBatch>>, checkout: Awaited<ReturnType<typeof retrieveCheckout>>) {
  validateCheckoutAuthority(checkout, leader);
  const attributes = checkout.attributes || {};
  const payments = Array.isArray(attributes.payments) ? attributes.payments : [];
  const paidPayment = payments.find((payment) => String(payment.attributes?.status || "").toLowerCase() === "paid");
  if (!paidPayment?.id) throw new Error("PayMongo checkout has no paid payment resource to reconcile.");

  const paymentAttributes = paidPayment.attributes || {};
  const currency = String(paymentAttributes.currency || "PHP").toUpperCase();
  if (currency !== "PHP") throw new Error("PayMongo payment currency does not match HOAHub billing currency.");
  const paidCentavos = Number(paymentAttributes.amount || 0);
  const principalCentavos = Math.round(batchAmount(batch) * 100);
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
        reviewRemarks: paymongoGatewayRemark("PAID"),
        reviewedAt: null,
        reviewedById: null,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      tenantId: leader.tenantId,
      actorId: null,
      module: "PAYMENTS",
      action: "PAYMONGO_HOMEOWNER_PAYMENT_RECONCILED",
      entityType: "PaymentRequest",
      entityId: leader.id,
      correlationId: checkout.id || paidPayment.id,
      metadata: {
        checkoutId: checkout.id,
        gatewayPaymentId: paidPayment.id,
        paymentRequestIds: batch.map((item) => item.id),
        paymentRequestCount: batch.length,
        hoaPrincipalAmount: amounts.principalCentavos / 100,
        platformConvenienceFeeAmount: amounts.platformFeeCentavos / 100,
        processingFeeAmount: amounts.providerFeeCentavos / 100,
        totalCustomerPaid: amounts.totalPaidCentavos / 100,
        linkedAccountId: leader.proofFileName,
        reconciliationSource: "PAYMONGO_CHECKOUT_RETRIEVAL",
      },
    },
  });

  try {
    for (const item of pending) {
      await approvePaymentRequest(
        item.id,
        undefined,
        "Automatically reconciled from verified PayMongo Checkout Session.",
        item.tenantId,
        { allowGatewayConfirmation: true },
      );
    }
  } catch (error) {
    const latest = await prisma.paymentRequest.findMany({
      where: { tenantId: leader.tenantId, id: { in: batch.map((item) => item.id) } },
      select: { status: true },
    });
    if (latest.length !== batch.length || latest.some((item) => item.status !== PaymentRequestStatus.APPROVED)) throw error;
  }
}

export async function reconcileHomeownerPayMongoCheckout(input: {
  requestId: string;
  tenantId: string;
  homeownerId?: string;
}): Promise<PayMongoPaymentActivity> {
  let leader = await loadLeader(input.requestId, input.tenantId, input.homeownerId);
  let batch = await loadBatch(leader);
  if (batch.every((item) => item.status === PaymentRequestStatus.APPROVED)) return activity(leader, batch, "PAID");

  const storedState = classifyPayMongoGatewayState({ localStatus: leader.status, reviewRemarks: leader.reviewRemarks });
  if (leader.status === PaymentRequestStatus.REJECTED && ["CANCELLED", "EXPIRED", "FAILED"].includes(storedState)) {
    return activity(leader, batch, storedState);
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
  if (!checkoutId) return activity(leader, batch, leader.status === PaymentRequestStatus.REJECTED ? "FAILED" : "AWAITING_PAYMENT");
  const checkout = await retrieveCheckout(checkoutId, linkedAccountId);
  validateCheckoutAuthority(checkout, leader);
  const attributes = checkout.attributes || {};
  const payments = Array.isArray(attributes.payments) ? attributes.payments : [];
  const hasPaidPayment = payments.some((payment) => String(payment.attributes?.status || "").toLowerCase() === "paid");
  const state = classifyPayMongoGatewayState({
    localStatus: leader.status,
    reviewRemarks: leader.reviewRemarks,
    checkoutStatus: attributes.status,
    paymentIntentStatus: attributes.payment_intent?.attributes?.status,
    lastPaymentError: attributes.payment_intent?.attributes?.last_payment_error,
    hasPaidPayment,
  });

  if (state === "PAID") {
    await postPaidCheckout(leader, batch, checkout);
    leader = await loadLeader(leader.id, input.tenantId, input.homeownerId);
    batch = await loadBatch(leader);
    return activity(leader, batch, "PAID");
  }

  await markNonPaidState(leader, batch, state);
  leader = await loadLeader(leader.id, input.tenantId, input.homeownerId);
  batch = await loadBatch(leader);
  return activity(leader, batch, state);
}

function uniqueLeaderIds(rows: Array<{ id: string; description: string | null }>, limit: number) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = paymongoBatchId(row.description, row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

export async function reconcilePendingHomeownerPayMongoPayments(input: { tenantId: string; homeownerId: string; limit?: number }) {
  const limit = Math.max(1, Math.min(20, input.limit || 12));
  const recent = await prisma.paymentRequest.findMany({
    where: { tenantId: input.tenantId, homeownerId: input.homeownerId, proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER },
    select: { id: true, description: true },
    orderBy: { createdAt: "desc" },
    take: Math.max(limit * 4, 20),
  });
  const results: PayMongoPaymentActivity[] = [];
  for (const requestId of uniqueLeaderIds(recent, limit)) {
    try {
      results.push(await reconcileHomeownerPayMongoCheckout({ requestId, tenantId: input.tenantId, homeownerId: input.homeownerId }));
    } catch {
      const leader = await loadLeader(requestId, input.tenantId, input.homeownerId).catch(() => null);
      if (!leader) continue;
      const batch = await loadBatch(leader);
      results.push(activity(leader, batch, "UNAVAILABLE"));
    }
  }
  return results;
}

export async function reconcileRecentTenantPayMongoPayments(input: { tenantId: string; limit?: number }): Promise<TenantPayMongoPaymentActivity[]> {
  const limit = Math.max(1, Math.min(50, input.limit || 30));
  const recent = await prisma.paymentRequest.findMany({
    where: { tenantId: input.tenantId, proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER },
    select: { id: true, description: true },
    orderBy: { createdAt: "desc" },
    take: Math.max(limit * 4, 40),
  });
  const results: PayMongoPaymentActivity[] = [];
  for (const requestId of uniqueLeaderIds(recent, limit)) {
    try {
      results.push(await reconcileHomeownerPayMongoCheckout({ requestId, tenantId: input.tenantId }));
    } catch {
      const leader = await loadLeader(requestId, input.tenantId).catch(() => null);
      if (!leader) continue;
      const batch = await loadBatch(leader);
      results.push(activity(leader, batch, "UNAVAILABLE"));
    }
  }
  const homeowners = await prisma.homeownerProfile.findMany({
    where: { tenantId: input.tenantId, id: { in: [...new Set(results.map((row) => row.homeownerId))] } },
    include: { user: true },
  });
  const byId = new Map(homeowners.map((homeowner) => [homeowner.id, homeowner]));
  return results.map((row) => {
    const homeowner = byId.get(row.homeownerId);
    return {
      ...row,
      homeownerName: homeowner?.user.name || "Homeowner",
      property: homeowner ? `Block ${homeowner.block} · Lot ${homeowner.lot}` : "Property unavailable",
    };
  });
}
