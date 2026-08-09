import "server-only";

import { createHash } from "node:crypto";
import { PaymentMethod, PaymentRequestStatus, PaymentRequestType, SystemSettingCategory } from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";
import { platformPrisma as prisma } from "@/lib/db";
import {
  HOMEOWNER_PLATFORM_FEE_LABEL,
  PAYMONGO_HOMEOWNER_PARENT_ACCOUNT_ENV,
  buildPlatformFeeSplitPayment,
  checkoutAmounts,
  validatePaidCheckoutAmounts,
} from "@/lib/homeowner-convenience-fee";
import { isPayMongoPaymentRequest } from "@/lib/homeowner-payment-flow";
import { approvePaymentRequest } from "@/lib/services/payment-requests";
import { verifyPayMongoWebhookSignature } from "@/lib/services/platform-paymongo";
import { getHomeownerPaymentConfig, paymongoWebhookSecretSettingKey } from "@/lib/services/homeowner-payment-config";

const CHECKOUT_ENDPOINT = "https://api.paymongo.com/v2/checkout_sessions";
const WEBHOOK_ENDPOINT = "https://api.paymongo.com/v1/webhooks";
const SECRET_KEY_ENV = "PAYMONGO_HOMEOWNER_SECRET_KEY";
const HOMEOWNER_WEBHOOK_EVENT = "checkout_session.payment.paid";

function requiredHomeownerPayMongoSecret() {
  const value = process.env[SECRET_KEY_ENV]?.trim();
  if (!value) throw new Error(`${SECRET_KEY_ENV} is not configured.`);
  return value;
}

function paymongoHeaders(accountId?: string) {
  const secretKey = requiredHomeownerPayMongoSecret();
  return {
    Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
    "Content-Type": "application/json",
    ...(accountId ? { "Account-ID": accountId } : {}),
  };
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

type PayMongoResponse = {
  data?: unknown;
  errors?: Array<{ detail?: string }>;
};

type PayMongoWebhookResource = {
  id?: string;
  attributes?: {
    events?: string[];
    livemode?: boolean;
    secret_key?: string;
    status?: string;
    url?: string;
  };
};

type PayMongoCheckoutResource = {
  id?: string;
  attributes?: { checkout_url?: string };
};

async function parsePayMongoResponse(response: Response): Promise<PayMongoResponse | null> {
  return response.json().catch(() => null) as Promise<PayMongoResponse | null>;
}

function paymongoError(payload: PayMongoResponse | null, fallback: string) {
  return payload?.errors?.[0]?.detail || fallback;
}

export async function ensureHomeownerPayMongoWebhook(accountId: string) {
  if (!accountId.startsWith("org_")) throw new Error("PayMongo linked merchant account ID must start with org_.");
  const webhookUrl = new URL("/api/homeowner-payments/webhooks/paymongo", getAppUrl()).toString();
  const listUrl = new URL(WEBHOOK_ENDPOINT);
  listUrl.searchParams.set("url", webhookUrl);
  listUrl.searchParams.set("limit", "100");

  const listResponse = await fetch(listUrl, {
    headers: paymongoHeaders(accountId),
    cache: "no-store",
  });
  const listPayload = await parsePayMongoResponse(listResponse);
  if (!listResponse.ok) throw new Error(paymongoError(listPayload, "Unable to inspect the tenant PayMongo webhooks."));
  const hooks = Array.isArray(listPayload?.data) ? listPayload.data as PayMongoWebhookResource[] : [];
  let hook = hooks.find((candidate) =>
    candidate.attributes?.url === webhookUrl
    && candidate.attributes.events?.includes(HOMEOWNER_WEBHOOK_EVENT),
  );

  if (!hook) {
    const createResponse = await fetch(WEBHOOK_ENDPOINT, {
      method: "POST",
      headers: paymongoHeaders(accountId),
      body: JSON.stringify({
        data: {
          attributes: {
            url: webhookUrl,
            events: [HOMEOWNER_WEBHOOK_EVENT],
          },
        },
      }),
    });
    const createPayload = await parsePayMongoResponse(createResponse);
    if (!createResponse.ok) throw new Error(paymongoError(createPayload, "Unable to create the tenant PayMongo webhook."));
    hook = createPayload?.data as PayMongoWebhookResource | undefined;
  } else if (hook.attributes?.status !== "enabled" && hook.id) {
    const enableResponse = await fetch(`${WEBHOOK_ENDPOINT}/${encodeURIComponent(hook.id)}/enable`, {
      method: "POST",
      headers: paymongoHeaders(accountId),
    });
    const enablePayload = await parsePayMongoResponse(enableResponse);
    if (!enableResponse.ok) throw new Error(paymongoError(enablePayload, "Unable to enable the tenant PayMongo webhook."));
    hook = enablePayload?.data as PayMongoWebhookResource | undefined;
  }

  if (hook?.id && !hook.attributes?.secret_key) {
    const retrieveResponse = await fetch(`${WEBHOOK_ENDPOINT}/${encodeURIComponent(hook.id)}`, {
      headers: paymongoHeaders(accountId),
      cache: "no-store",
    });
    const retrievePayload = await parsePayMongoResponse(retrieveResponse);
    if (!retrieveResponse.ok) throw new Error(paymongoError(retrievePayload, "Unable to retrieve the tenant PayMongo webhook."));
    hook = retrievePayload?.data as PayMongoWebhookResource | undefined;
  }

  const webhookId = hook?.id?.trim() || "";
  const webhookSecret = hook?.attributes?.secret_key?.trim() || "";
  if (!webhookId || !webhookSecret) {
    throw new Error("PayMongo did not return the tenant webhook ID and signing secret.");
  }
  return {
    webhookId,
    webhookSecret,
    livemode: Boolean(hook?.attributes?.livemode),
    webhookUrl,
  };
}

async function requireTenantWebhookSecret(tenantId: string, accountId: string) {
  const setting = await prisma.systemSetting.findUnique({
    where: {
      tenantId_category_key: {
        tenantId,
        category: SystemSettingCategory.PAYMENT,
        key: paymongoWebhookSecretSettingKey(accountId),
      },
    },
    select: { value: true },
  });
  const secret = setting?.value?.trim() || "";
  if (!secret) throw new Error("This tenant does not have a provisioned PayMongo child webhook.");
  return secret;
}

async function resolveWebhookTenant(accountId: string) {
  const settings = await prisma.systemSetting.findMany({
    where: {
      category: SystemSettingCategory.PAYMENT,
      key: paymongoWebhookSecretSettingKey(accountId),
      value: { not: null },
    },
    select: { tenantId: true, value: true },
  });
  const matches = settings.filter((setting) => Boolean(setting.value?.trim()));
  if (!matches.length) return { ok: false as const, status: 503, message: "Tenant PayMongo webhook signing secret is not configured." };
  if (matches.length > 1) return { ok: false as const, status: 409, message: "PayMongo child account is mapped to more than one tenant." };
  return { ok: true as const, tenantId: matches[0].tenantId, webhookSecret: matches[0].value!.trim() };
}

export async function createHomeownerPayMongoCheckout(requestId: string, tenantId: string) {
  const request = await prisma.paymentRequest.findFirst({
    where: { id: requestId, tenantId },
    include: {
      homeowner: { include: { user: true } },
      bill: true,
      documentRequest: { include: { definition: true } },
    },
  });
  if (!request || !isPayMongoPaymentRequest(request)) throw new Error("PayMongo payment request was not found.");
  if (request.status !== PaymentRequestStatus.PENDING_REVIEW) throw new Error("This PayMongo payment request is no longer pending.");
  if (!request.referenceNumber) throw new Error("PayMongo payment request is missing its checkout reference.");

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  if (!tenant) throw new Error("Tenant was not found for PayMongo checkout.");
  const linkedAccountId = request.proofFileName?.trim();
  if (!linkedAccountId || !linkedAccountId.startsWith("org_")) throw new Error("This tenant does not have a valid PayMongo linked merchant account configured.");
  await requireTenantWebhookSecret(request.tenantId, linkedAccountId);
  const principalAmount = Number(request.amount);
  if (!Number.isFinite(principalAmount) || principalAmount <= 0) throw new Error("Payment amount is invalid.");

  const config = await getHomeownerPaymentConfig(tenantId);
  const configuredFeeCentavos = config.platformFeeEnabled ? config.platformFeeAmountCentavos : 0;
  const amounts = checkoutAmounts(principalAmount, configuredFeeCentavos);
  const parentAccountId = process.env[PAYMONGO_HOMEOWNER_PARENT_ACCOUNT_ENV]?.trim() || "";
  const splitPayment = buildPlatformFeeSplitPayment({
    childAccountId: linkedAccountId,
    parentAccountId,
    platformFeeCentavos: amounts.platformFeeCentavos,
  });
  const passOnProcessingFees = amounts.platformFeeCentavos > 0;

  const successUrl = new URL("/portal/pay", getAppUrl());
  successUrl.searchParams.set("online", "confirming");
  const cancelUrl = new URL("/portal/pay/paymongo-cancel", getAppUrl());
  cancelUrl.searchParams.set("requestId", request.id);
  const purpose = paymentPurpose(request);
  const idempotencyKey = `hoahub-homeowner-${tenantId}-${request.id}-fee${amounts.platformFeeCentavos}-pof${passOnProcessingFees ? 1 : 0}`.slice(0, 255);
  const lineItems = [
    {
      name: purpose,
      description: `${tenant.name} homeowner payment`,
      amount: amounts.principalCentavos,
      currency: "PHP",
      quantity: 1,
    },
    ...(amounts.platformFeeCentavos > 0 ? [{
      name: HOMEOWNER_PLATFORM_FEE_LABEL,
      description: "HOAHub online payment service fee",
      amount: amounts.platformFeeCentavos,
      currency: "PHP",
      quantity: 1,
    }] : []),
  ];

  const response = await fetch(CHECKOUT_ENDPOINT, {
    method: "POST",
    headers: {
      ...paymongoHeaders(linkedAccountId),
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: lineItems,
          payment_method_types: configuredMethods(),
          success_url: successUrl.toString(),
          cancel_url: cancelUrl.toString(),
          reference_number: request.referenceNumber,
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          ...(splitPayment ? { split_payment: splitPayment } : {}),
          ...(passOnProcessingFees ? { pass_on_fees: true } : {}),
          billing: {
            name: request.homeowner.user.name,
            email: request.homeowner.user.email,
          },
          metadata: {
            tenantId: request.tenantId,
            homeownerId: request.homeownerId,
            paymentRequestId: request.id,
            principalAmountCentavos: String(amounts.principalCentavos),
            platformFeeCentavos: String(amounts.platformFeeCentavos),
            baseChargeCentavos: String(amounts.baseChargeCentavos),
            passOnProcessingFees: String(passOnProcessingFees),
            platformFeeRecipientAccountId: splitPayment ? parentAccountId : "",
            tenantTransferAccountId: linkedAccountId,
          },
        },
      },
    }),
  });

  const payload = await parsePayMongoResponse(response);
  const checkout = payload?.data as PayMongoCheckoutResource | undefined;
  const checkoutId = checkout?.id;
  const checkoutUrl = checkout?.attributes?.checkout_url;
  if (!response.ok || !checkoutId || !checkoutUrl) {
    throw new Error(paymongoError(payload, "PayMongo checkout could not be created."));
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
        hoaPrincipalAmount: principalAmount,
        platformConvenienceFeeAmount: amounts.platformFeeCentavos / 100,
        checkoutBaseAmount: amounts.baseChargeCentavos / 100,
        passOnProcessingFees,
        platformFeeRecipientAccountId: splitPayment ? parentAccountId : null,
        linkedAccountId,
        linkedTransaction: true,
      },
    },
  });

  return { checkoutId, checkoutUrl };
}

type NormalizedCheckoutEvent = {
  eventType: string;
  eventId: string;
  organizationId: string;
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
  const organizationId = String(data.organization_id || attributes.organization_id || "").trim();
  const explicitEventId = typeof data.id === "string" && data.id.startsWith("evt_") ? data.id : "";
  return {
    eventType,
    eventId: explicitEventId || `evt_hash_${createHash("sha256").update(rawBody).digest("hex")}`,
    organizationId,
    session,
    sessionAttributes,
  };
}

function paymentMethodFromSource(source: unknown) {
  const type = String((source as { type?: string } | null)?.type || "").toLowerCase();
  return type === "gcash" ? PaymentMethod.GCASH : PaymentMethod.OTHER;
}

export async function processHomeownerPayMongoWebhook(rawBody: string, signatureHeader: string | null) {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { ok: false as const, status: 400, message: "Invalid JSON payload." };
  }
  const event = normalizeCheckoutEvent(payload, rawBody);
  if (!event.organizationId.startsWith("org_")) {
    return { ok: false as const, status: 400, message: "PayMongo child account context is missing." };
  }

  const webhookContext = await resolveWebhookTenant(event.organizationId);
  if (!webhookContext.ok) return webhookContext;
  const verification = verifyPayMongoWebhookSignature(rawBody, signatureHeader, webhookContext.webhookSecret);
  if (!verification.valid) return { ok: false as const, status: 401, message: "Invalid PayMongo signature." };

  if (event.eventType !== HOMEOWNER_WEBHOOK_EVENT) {
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
  const linkedAccountId = request.proofFileName?.trim() || "";
  if (request.tenantId !== webhookContext.tenantId || linkedAccountId !== event.organizationId) {
    return { ok: false as const, status: 400, message: "PayMongo child account does not match the tenant payment request." };
  }
  if (request.status === PaymentRequestStatus.APPROVED) {
    return { ok: true as const, duplicate: true, eventId: event.eventId, paymentRequestId: request.id };
  }
  if (![PaymentRequestStatus.PENDING_REVIEW, PaymentRequestStatus.REJECTED].includes(request.status)) {
    return { ok: true as const, ignored: true, eventId: event.eventId, paymentRequestId: request.id };
  }

  const payments = Array.isArray(event.sessionAttributes.payments)
    ? event.sessionAttributes.payments as Array<Record<string, unknown>>
    : [];
  const paidPayment = payments.find((item) => String((item.attributes as Record<string, unknown> | undefined)?.status || "").toLowerCase() === "paid") || payments[0];
  const paymentAttributes = (paidPayment?.attributes || {}) as Record<string, unknown>;
  const gatewayPaymentId = String(paidPayment?.id || "").trim();
  const checkoutId = String(event.session.id || "").trim();
  const paidCentavos = Number(paymentAttributes.amount || 0);
  const requestPrincipalCentavos = Math.round(Number(request.amount) * 100);
  const currency = String(paymentAttributes.currency || "PHP").toUpperCase();
  const paidAtSeconds = Number(paymentAttributes.paid_at || 0);
  const paidAt = Number.isFinite(paidAtSeconds) && paidAtSeconds > 0 ? new Date(paidAtSeconds * 1000) : new Date();
  paidAt.setUTCHours(0, 0, 0, 0);
  if (!gatewayPaymentId || !checkoutId) return { ok: false as const, status: 400, message: "PayMongo webhook is missing payment identifiers." };
  if (currency !== "PHP") return { ok: false as const, status: 400, message: "PayMongo currency does not match the HOA payment currency." };

  let confirmedAmounts: ReturnType<typeof validatePaidCheckoutAmounts>;
  try {
    confirmedAmounts = validatePaidCheckoutAmounts({
      requestPrincipalCentavos,
      paidCentavos,
      metadata: event.sessionAttributes.metadata,
    });
  } catch (error) {
    return { ok: false as const, status: 400, message: error instanceof Error ? error.message : "PayMongo amount validation failed." };
  }

  try {
    await prisma.paymentRequest.update({
      where: { id: request.id },
      data: {
        status: PaymentRequestStatus.PENDING_REVIEW,
        method: paymentMethodFromSource(paymentAttributes.source),
        paymentDate: paidAt,
        reviewRemarks: null,
        reviewedAt: null,
        reviewedById: null,
      },
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
          hoaPrincipalAmount: confirmedAmounts.principalCentavos / 100,
          platformConvenienceFeeAmount: confirmedAmounts.platformFeeCentavos / 100,
          paymongoProcessingFeeAmount: confirmedAmounts.providerFeeCentavos / 100,
          checkoutBaseAmount: confirmedAmounts.baseChargeCentavos / 100,
          totalCustomerPaid: confirmedAmounts.totalPaidCentavos / 100,
          passOnProcessingFees: confirmedAmounts.passOnFees,
          legacyCheckout: confirmedAmounts.legacyCheckout,
          currency,
          paidAt: paidAt.toISOString(),
          linkedAccountId,
          linkedTransaction: true,
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
        metadata: {
          eventId: event.eventId,
          checkoutId,
          gatewayPaymentId,
          linkedAccountId,
          hoaPrincipalAmount: confirmedAmounts.principalCentavos / 100,
          platformConvenienceFeeAmount: confirmedAmounts.platformFeeCentavos / 100,
          paymongoProcessingFeeAmount: confirmedAmounts.providerFeeCentavos / 100,
          totalCustomerPaid: confirmedAmounts.totalPaidCentavos / 100,
        },
        reason: error instanceof Error ? error.message.slice(0, 1000) : "Unknown PayMongo posting error.",
      },
    }).catch(() => undefined);
    return { ok: false as const, status: 500, message: error instanceof Error ? error.message : "PayMongo payment could not be posted." };
  }
}
