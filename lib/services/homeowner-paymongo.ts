import "server-only";

import { createHash } from "node:crypto";
import { PaymentMethod, PaymentRequestStatus, PaymentRequestType, SystemSettingCategory } from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";
import { platformPrisma as prisma } from "@/lib/db";
import { isPayMongoPaymentRequest } from "@/lib/homeowner-payment-flow";
import { approvePaymentRequest } from "@/lib/services/payment-requests";
import { verifyPayMongoWebhookSignature } from "@/lib/services/platform-paymongo";
import { PAYMONGO_LINKED_ACCOUNT_ID_KEY } from "@/lib/services/homeowner-payment-config";

const CHECKOUT_ENDPOINT = "https://api.paymongo.com/v2/checkout_sessions";
const WEBHOOK_SECRET_ENV = "PAYMONGO_HOMEOWNER_WEBHOOK_SECRET";
const SECRET_KEY_ENV = "PAYMONGO_HOMEOWNER_SECRET_KEY";

function requiredHomeownerPayMongoSecret(name: typeof WEBHOOK_SECRET_ENV | typeof SECRET_KEY_ENV) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function configuredMethods() {
  const allowed = new Set(["card", "gcash", "paymaya", "qrph"]);
  const methods = (process.env.PAYMONGO_HOMEOWNER_CHECKOUT_METHODS || "card,gcash,paymaya,qrph")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => allowed.has(value));
  return methods.length ? methods : ["card", "gcash", "paymaya", "qrph"];
}

function paymentPurpose(request: {
  type: PaymentRequestType;
  description: string | null;
  bill: { billingMonth: Date } | null;
  documentRequest: { definition: { displayName: string } | null } | null;
}) {
  if (request.type === PaymentRequestType.MONTHLY_DUES) {
    return `Monthly dues - ${request.bill?.billingMonth.toLocaleDateString("en-PH", { month: "long", year: "numeric" }) || "billing"}`;
  }
  if (request.type === PaymentRequestType.DOCUMENT_FEE) {
    return `Document fee - ${request.documentRequest?.definition?.displayName || "HOA document"}`;
  }
  return request.description?.trim() || "HOA homeowner payment";
}

export async function createHomeownerPayMongoCheckout(requestId: string, tenantId: string) {
  const request = await prisma.paymentRequest.findFirst({
    where: { id: requestId, tenantId },
    include: {
      homeowner: { include: { user: true } },
      tenant: true,
      bill: true,
      documentRequest: { include: { definition: true } },
    },
  });
  if (!request || !isPayMongoPaymentRequest(request)) throw new Error("PayMongo payment request was not found.");
  if (request.status !== PaymentRequestStatus.PENDING_REVIEW) throw new Error("This PayMongo payment request is no longer pending.");
  if (!request.referenceNumber) throw new Error("PayMongo payment request is missing its checkout reference.");

  const linkedAccountId = request.proofFileName?.trim();
  if (!linkedAccountId) throw new Error("This tenant does not have a PayMongo linked merchant account configured.");
  const amount = Number(request.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Payment amount is invalid.");

  const secretKey = requiredHomeownerPayMongoSecret(SECRET_KEY_ENV);
  const successUrl = new URL("/portal/pay", getAppUrl());
  successUrl.searchParams.set("online", "confirming");
  const cancelUrl = new URL("/portal/pay", getAppUrl());
  cancelUrl.searchParams.set("online", "cancelled");
  const cents = Math.round(amount * 100);
  const purpose = paymentPurpose(request);
  const idempotencyKey = `hoahub-homeowner-${tenantId}-${request.id}`.slice(0, 255);

  const response = await fetch(CHECKOUT_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [{
            name: purpose,
            description: `${request.tenant.name} homeowner payment`,
            amount: cents,
            currency: "PHP",
            quantity: 1,
          }],
          payment_method_types: configuredMethods(),
          success_url: successUrl.toString(),
          cancel_url: cancelUrl.toString(),
          reference_number: request.referenceNumber,
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          billing: {
            name: request.homeowner.user.name,
            email: request.homeowner.user.email,
          },
          split_payment: {
            transfer_to: linkedAccountId,
          },
          metadata: {
            tenantId: request.tenantId,
            homeownerId: request.homeownerId,
            paymentRequestId: request.id,
          },
        },
      },
    }),
  });

  const payload = await response.json().catch(() => null) as {
    data?: { id?: string; attributes?: { checkout_url?: string } };
    errors?: Array<{ detail?: string }>;
  } | null;
  const checkoutId = payload?.data?.id;
  const checkoutUrl = payload?.data?.attributes?.checkout_url;
  if (!response.ok || !checkoutId || !checkoutUrl) {
    throw new Error(payload?.errors?.[0]?.detail || "PayMongo checkout could not be created.");
  }

  await prisma.auditLog.create({
    data: {
      tenantId: request.tenantId,
      actorId: request.homeowner.userId,
      module: "PAYMENTS",
      action: "CREATE_PAYMONGO_HOMEOWNER_CHECKOUT",
      entityType: "PaymentRequest",
      entityId: request.id,
      correlationId: checkoutId,
      metadata: {
        checkoutId,
        referenceNumber: request.referenceNumber,
        amount,
        linkedAccountId,
      },
    },
  });

  return { checkoutId, checkoutUrl };
}

type NormalizedCheckoutEvent = {
  eventType: string;
  eventId: string;
  session: Record<string, unknown>;
  sessionAttributes: Record<string, unknown>;
};

function normalizeCheckoutEvent(payload: unknown, rawBody: string): NormalizedCheckoutEvent {
  const root = payload as Record<string, unknown>;
  const data = (root?.data || {}) as Record<string, unknown>;
  const attributes = (data.attributes || {}) as Record<string, unknown>;
  const modernType = typeof data.type === "string" && data.type.includes(".") ? data.type : undefined;
  const legacyType = typeof attributes.type === "string" ? attributes.type : undefined;
  const eventType = modernType || legacyType || "unknown";
  const session = ((modernType ? data.data : attributes.data) || {}) as Record<string, unknown>;
  const sessionAttributes = (session.attributes || {}) as Record<string, unknown>;
  const explicitEventId = typeof data.id === "string" && data.id.startsWith("evt_") ? data.id : "";
  return {
    eventType,
    eventId: explicitEventId || `evt_hash_${createHash("sha256").update(rawBody).digest("hex")}`,
    session,
    sessionAttributes,
  };
}

function paymentMethodFromSource(source: unknown) {
  const type = String((source as { type?: string } | null)?.type || "").toLowerCase();
  return type === "gcash" ? PaymentMethod.GCASH : PaymentMethod.OTHER;
}

export async function processHomeownerPayMongoWebhook(rawBody: string, signatureHeader: string | null) {
  let webhookSecret: string;
  try {
    webhookSecret = requiredHomeownerPayMongoSecret(WEBHOOK_SECRET_ENV);
  } catch (error) {
    return { ok: false as const, status: 503, message: error instanceof Error ? error.message : "PayMongo webhook is not configured." };
  }
  const verification = verifyPayMongoWebhookSignature(rawBody, signatureHeader, webhookSecret);
  if (!verification.valid) return { ok: false as const, status: 401, message: "Invalid PayMongo signature." };

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { ok: false as const, status: 400, message: "Invalid JSON payload." };
  }
  const event = normalizeCheckoutEvent(payload, rawBody);
  if (event.eventType !== "checkout_session.payment.paid") {
    return { ok: true as const, ignored: true, eventId: event.eventId };
  }

  const referenceNumber = String(event.sessionAttributes.reference_number || "").trim();
  if (!referenceNumber.startsWith("HOP-")) {
    return { ok: true as const, ignored: true, eventId: event.eventId };
  }
  const requestId = referenceNumber.slice(4);
  const request = await prisma.paymentRequest.findUnique({
    where: { id: requestId },
    include: { payment: true, collection: true },
  });
  if (!request || request.referenceNumber !== referenceNumber || !isPayMongoPaymentRequest(request)) {
    return { ok: false as const, status: 404, message: "Homeowner PayMongo payment request was not found." };
  }
  if (request.status === PaymentRequestStatus.APPROVED) {
    return { ok: true as const, duplicate: true, eventId: event.eventId, paymentRequestId: request.id };
  }
  if (request.status !== PaymentRequestStatus.PENDING_REVIEW) {
    return { ok: true as const, ignored: true, eventId: event.eventId, paymentRequestId: request.id };
  }

  const payments = Array.isArray(event.sessionAttributes.payments)
    ? event.sessionAttributes.payments as Array<Record<string, unknown>>
    : [];
  const paidPayment = payments.find((item) => String((item.attributes as Record<string, unknown> | undefined)?.status || "").toLowerCase() === "paid") || payments[0];
  const paymentAttributes = (paidPayment?.attributes || {}) as Record<string, unknown>;
  const gatewayPaymentId = String(paidPayment?.id || "").trim();
  const checkoutId = String(event.session.id || "").trim();
  const amount = Number(paymentAttributes.amount || 0) / 100;
  const currency = String(paymentAttributes.currency || "PHP").toUpperCase();
  if (!gatewayPaymentId || !checkoutId) return { ok: false as const, status: 400, message: "PayMongo webhook is missing payment identifiers." };
  if (currency !== "PHP") return { ok: false as const, status: 400, message: "PayMongo currency does not match the HOA payment currency." };
  if (Math.abs(Number(request.amount) - amount) > 0.009) return { ok: false as const, status: 400, message: "PayMongo amount does not match the homeowner payment request." };

  const linkedAccountId = request.proofFileName?.trim() || "";
  const configuredLinkedAccount = await prisma.systemSetting.findUnique({
    where: {
      tenantId_category_key: {
        tenantId: request.tenantId,
        category: SystemSettingCategory.PAYMENT,
        key: PAYMONGO_LINKED_ACCOUNT_ID_KEY,
      },
    },
    select: { value: true },
  });
  const currentLinkedAccountId = configuredLinkedAccount?.value?.trim() || "";

  try {
    await prisma.paymentRequest.update({
      where: { id: request.id },
      data: { method: paymentMethodFromSource(paymentAttributes.source) },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: request.tenantId,
        actorId: null,
        module: "PAYMENTS",
        action: "PAYMONGO_HOMEOWNER_PAYMENT_CONFIRMED",
        entityType: "PaymentRequest",
        entityId: request.id,
        correlationId: event.eventId,
        metadata: {
          eventId: event.eventId,
          checkoutId,
          gatewayPaymentId,
          amount,
          currency,
          linkedAccountId,
          linkedAccountChangedSinceCheckout: Boolean(currentLinkedAccountId && currentLinkedAccountId !== linkedAccountId),
        },
      },
    });
    await approvePaymentRequest(
      request.id,
      undefined,
      "Automatically confirmed by PayMongo.",
      request.tenantId,
      { allowGatewayConfirmation: true },
    );
    return { ok: true as const, eventId: event.eventId, paymentRequestId: request.id };
  } catch (error) {
    const latest = await prisma.paymentRequest.findUnique({ where: { id: request.id }, select: { status: true } });
    if (latest?.status === PaymentRequestStatus.APPROVED) {
      return { ok: true as const, duplicate: true, eventId: event.eventId, paymentRequestId: request.id };
    }
    await prisma.auditLog.create({
      data: {
        tenantId: request.tenantId,
        actorId: null,
        module: "PAYMENTS",
        action: "PAYMONGO_HOMEOWNER_PAYMENT_POST_FAILED",
        entityType: "PaymentRequest",
        entityId: request.id,
        correlationId: event.eventId,
        metadata: { eventId: event.eventId, checkoutId, gatewayPaymentId },
        reason: error instanceof Error ? error.message.slice(0, 1000) : "Unknown PayMongo posting error.",
      },
    }).catch(() => undefined);
    return { ok: false as const, status: 500, message: error instanceof Error ? error.message : "PayMongo payment could not be posted." };
  }
}
