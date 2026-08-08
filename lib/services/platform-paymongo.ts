import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  PlatformGatewayEventStatus,
  PlatformInvoiceStatus,
  PlatformPaymentGateway,
  PlatformPaymentMethod,
  PlatformPaymentStatus,
  TenantStatus,
  TenantSubscriptionStatus,
  TenantSuspensionReason,
} from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";

const CHECKOUT_ENDPOINT = "https://api.paymongo.com/v2/checkout_sessions";
const ACCESS_LABEL = "hoahub-platform-invoice-payment-v1";
const WEBHOOK_TOLERANCE_SECONDS = 300;

function requiredSecret(name: "PAYMONGO_SECRET_KEY" | "PAYMONGO_WEBHOOK_SECRET") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function authSecret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (process.env.NODE_ENV === "production" && (!value || value.length < 32)) throw new Error("AUTH_SECRET must contain at least 32 characters in production.");
  return value || "development-only-secret-change-me-now";
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function platformInvoicePaymentToken(invoiceId: string) {
  return createHmac("sha256", authSecret()).update(`${ACCESS_LABEL}:${invoiceId}`).digest("hex");
}

export function verifyPlatformInvoicePaymentToken(invoiceId: string, token: string) {
  return Boolean(invoiceId && token && safeEqual(platformInvoicePaymentToken(invoiceId), token));
}

export function platformInvoicePaymentUrl(invoiceId: string) {
  const url = new URL(`/subscription/pay/${encodeURIComponent(invoiceId)}`, getAppUrl());
  url.searchParams.set("token", platformInvoicePaymentToken(invoiceId));
  return url.toString();
}

function configuredMethods() {
  const allowed = new Set(["card", "gcash", "paymaya", "qrph"]);
  const configured = (process.env.PAYMONGO_CHECKOUT_METHODS || "card,gcash,paymaya,qrph")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => allowed.has(value));
  return configured.length ? configured : ["card", "gcash", "paymaya", "qrph"];
}

export function payMongoIsConfigured() {
  return Boolean(process.env.PAYMONGO_SECRET_KEY?.trim() && process.env.PAYMONGO_WEBHOOK_SECRET?.trim());
}

export async function createPayMongoInvoiceCheckout(invoiceId: string) {
  const invoice = await prisma.platformInvoice.findUnique({
    where: { id: invoiceId },
    include: { tenant: { include: { billingProfile: true } }, subscription: { include: { plan: true } } },
  });
  if (!invoice || ![PlatformInvoiceStatus.OPEN, PlatformInvoiceStatus.PARTIALLY_PAID, PlatformInvoiceStatus.OVERDUE].includes(invoice.status)) throw new Error("This invoice is not available for online payment.");
  const amount = Number(invoice.outstandingBalance);
  if (amount <= 0) throw new Error("This invoice has no outstanding balance.");
  if (invoice.currency !== "PHP") throw new Error("PayMongo checkout is currently enabled only for PHP invoices.");
  const secretKey = requiredSecret("PAYMONGO_SECRET_KEY");
  const accessToken = platformInvoicePaymentToken(invoice.id);
  const successUrl = new URL(`/subscription/pay/${invoice.id}`, getAppUrl());
  successUrl.searchParams.set("token", accessToken);
  successUrl.searchParams.set("result", "success");
  const cancelUrl = new URL(`/subscription/pay/${invoice.id}`, getAppUrl());
  cancelUrl.searchParams.set("token", accessToken);
  cancelUrl.searchParams.set("result", "cancelled");
  const billingEmail = invoice.tenant.billingProfile?.billingEmail || invoice.tenant.email || undefined;
  const billingName = invoice.tenant.billingProfile?.legalBusinessName || invoice.tenant.name;
  const cents = Math.round(amount * 100);
  const idempotencyKey = `hoahub-checkout-${invoice.id}-${cents}-${invoice.updatedAt.getTime()}`.slice(0, 255);
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
          line_items: [{ name: `${invoice.subscription.plan.name} · ${invoice.invoiceNumber}`, description: `HOAHub subscription invoice ${invoice.invoiceNumber}`, amount: cents, currency: invoice.currency, quantity: 1 }],
          payment_method_types: configuredMethods(),
          success_url: successUrl.toString(),
          cancel_url: cancelUrl.toString(),
          reference_number: invoice.invoiceNumber,
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          ...(billingEmail ? { billing: { name: billingName, email: billingEmail } } : {}),
          metadata: { tenantId: invoice.tenantId, invoiceId: invoice.id, subscriptionId: invoice.subscriptionId },
        },
      },
    }),
  });
  const payload = await response.json().catch(() => null) as { data?: { id?: string; attributes?: { checkout_url?: string } }; errors?: Array<{ detail?: string }> } | null;
  const checkoutId = payload?.data?.id;
  const checkoutUrl = payload?.data?.attributes?.checkout_url;
  if (!response.ok || !checkoutId || !checkoutUrl) throw new Error(payload?.errors?.[0]?.detail || "PayMongo checkout could not be created.");

  const existing = await prisma.platformPayment.findFirst({ where: { gateway: PlatformPaymentGateway.PAYMONGO, gatewayCheckoutId: checkoutId } });
  if (!existing) {
    await prisma.platformPayment.create({
      data: {
        tenantId: invoice.tenantId,
        paymentReference: `PM-${invoice.invoiceNumber}-${randomBytes(3).toString("hex").toUpperCase()}`,
        gateway: PlatformPaymentGateway.PAYMONGO,
        gatewayCheckoutId: checkoutId,
        amount,
        netAmount: amount,
        currency: invoice.currency,
        method: PlatformPaymentMethod.PAYMONGO_CHECKOUT,
        status: PlatformPaymentStatus.PENDING,
        metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, checkoutUrl },
      },
    });
  }
  return { checkoutId, checkoutUrl };
}

type VerifiedSignature = { valid: boolean; mode?: "test" | "live"; timestamp?: number };

export function verifyPayMongoWebhookSignature(rawBody: string, signatureHeader: string | null, secret = process.env.PAYMONGO_WEBHOOK_SECRET || "", nowSeconds = Math.floor(Date.now() / 1000)): VerifiedSignature {
  if (!rawBody || !signatureHeader || !secret) return { valid: false };
  const parts = new Map(signatureHeader.split(",").map((part) => { const [key, ...rest] = part.trim().split("="); return [key, rest.join("=")]; }));
  const timestamp = Number(parts.get("t"));
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return { valid: false };
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const test = parts.get("te") || "";
  const live = parts.get("li") || "";
  if (test && safeEqual(expected, test)) return { valid: true, mode: "test", timestamp };
  if (live && safeEqual(expected, live)) return { valid: true, mode: "live", timestamp };
  return { valid: false, timestamp };
}

function normalizeCheckoutEvent(payload: unknown) {
  const root = payload as Record<string, unknown>;
  const data = (root?.data || {}) as Record<string, unknown>;
  const attributes = (data.attributes || {}) as Record<string, unknown>;
  const modernType = typeof data.type === "string" && data.type.includes(".") ? data.type : undefined;
  const legacyType = typeof attributes.type === "string" ? attributes.type : undefined;
  const eventType = modernType || legacyType || "unknown";
  const session = ((modernType ? data.data : attributes.data) || {}) as Record<string, unknown>;
  const sessionAttributes = (session.attributes || {}) as Record<string, unknown>;
  const livemode = modernType ? Boolean(data.livemode) : Boolean(attributes.livemode);
  const explicitEventId = typeof data.id === "string" && data.id.startsWith("evt_") ? data.id : undefined;
  return { eventType, session, sessionAttributes, livemode, explicitEventId };
}

function methodFromSource(source: unknown) {
  const type = String((source as { type?: string } | null)?.type || "").toLowerCase();
  if (type === "gcash") return PlatformPaymentMethod.PAYMONGO_GCASH;
  if (type === "paymaya") return PlatformPaymentMethod.PAYMONGO_MAYA;
  if (type === "qrph") return PlatformPaymentMethod.PAYMONGO_QRPH;
  if (type === "card") return PlatformPaymentMethod.PAYMONGO_CARD;
  if (type) return PlatformPaymentMethod.PAYMONGO_BANK;
  return PlatformPaymentMethod.PAYMONGO_CHECKOUT;
}

export async function processPayMongoWebhook(rawBody: string, signatureHeader: string | null) {
  const verification = verifyPayMongoWebhookSignature(rawBody, signatureHeader, requiredSecret("PAYMONGO_WEBHOOK_SECRET"));
  if (!verification.valid) return { ok: false as const, status: 401, message: "Invalid PayMongo signature." };
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return { ok: false as const, status: 400, message: "Invalid JSON payload." }; }
  const event = normalizeCheckoutEvent(payload);
  const providerEventId = event.explicitEventId || `evt_hash_${createHash("sha256").update(rawBody).digest("hex")}`;
  const existing = await prisma.platformGatewayEvent.findUnique({ where: { provider_providerEventId: { provider: PlatformPaymentGateway.PAYMONGO, providerEventId } } });
  if (existing) return { ok: true as const, duplicate: true, eventId: existing.id };
  const providerEvent = await prisma.platformGatewayEvent.create({
    data: { provider: PlatformPaymentGateway.PAYMONGO, providerEventId, eventType: event.eventType, livemode: event.livemode, signatureVerified: true, rawPayload: payload as never },
  });
  if (event.eventType !== "checkout_session.payment.paid") {
    await prisma.platformGatewayEvent.update({ where: { id: providerEvent.id }, data: { status: PlatformGatewayEventStatus.IGNORED, processedAt: new Date() } });
    return { ok: true as const, ignored: true, eventId: providerEvent.id };
  }

  const referenceNumber = String(event.sessionAttributes.reference_number || "");
  const checkoutId = String(event.session.id || "");
  const payments = Array.isArray(event.sessionAttributes.payments) ? event.sessionAttributes.payments as Array<Record<string, unknown>> : [];
  const paidPayment = payments.find((item) => String((item.attributes as Record<string, unknown> | undefined)?.status || "").toLowerCase() === "paid") || payments[0];
  const paymentAttrs = (paidPayment?.attributes || {}) as Record<string, unknown>;
  const gatewayPaymentId = String(paidPayment?.id || "");
  const paidAmount = Number(paymentAttrs.amount || 0) / 100;
  const fee = Number(paymentAttrs.fee || 0) / 100;
  const netAmount = Number(paymentAttrs.net_amount ?? paymentAttrs.amount ?? 0) / 100;
  const currency = String(paymentAttrs.currency || "PHP").toUpperCase();
  const paidAtSeconds = Number(paymentAttrs.paid_at || 0);
  const paidAt = Number.isFinite(paidAtSeconds) && paidAtSeconds > 0 ? new Date(paidAtSeconds * 1000) : new Date();

  try {
    const invoice = await prisma.platformInvoice.findUnique({ where: { invoiceNumber: referenceNumber }, include: { subscription: true } });
    if (!invoice) throw new Error("Platform invoice not found for PayMongo reference.");
    if (invoice.currency !== currency) throw new Error("PayMongo currency does not match the platform invoice.");
    if (Math.abs(Number(invoice.outstandingBalance) - paidAmount) > 0.009) throw new Error("PayMongo amount does not match the current outstanding invoice balance.");
    if (!gatewayPaymentId || !checkoutId) throw new Error("PayMongo webhook is missing payment or checkout identifiers.");
    const pending = await prisma.platformPayment.findFirst({ where: { tenantId: invoice.tenantId, gateway: PlatformPaymentGateway.PAYMONGO, gatewayCheckoutId: checkoutId } });
    const method = methodFromSource(paymentAttrs.source);
    await prisma.$transaction(async (tx) => {
      const payment = pending
        ? await tx.platformPayment.update({ where: { id: pending.id }, data: { gatewayPaymentId, amount: paidAmount, fee, netAmount, currency, method, status: PlatformPaymentStatus.SUCCEEDED, paidAt, metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, checkoutId } } })
        : await tx.platformPayment.create({ data: { tenantId: invoice.tenantId, paymentReference: `PM-${invoice.invoiceNumber}-${randomBytes(3).toString("hex").toUpperCase()}`, gateway: PlatformPaymentGateway.PAYMONGO, gatewayPaymentId, gatewayCheckoutId: checkoutId, amount: paidAmount, fee, netAmount, currency, method, status: PlatformPaymentStatus.SUCCEEDED, paidAt, metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber } } });
      await tx.platformPaymentAllocation.upsert({ where: { paymentId_invoiceId: { paymentId: payment.id, invoiceId: invoice.id } }, create: { tenantId: invoice.tenantId, paymentId: payment.id, invoiceId: invoice.id, amount: paidAmount }, update: { amount: paidAmount } });
      await tx.platformInvoice.update({ where: { id: invoice.id }, data: { amountPaid: Number(invoice.amountPaid) + paidAmount, outstandingBalance: 0, status: PlatformInvoiceStatus.PAID, paidAt } });
      await tx.tenantSubscription.update({ where: { id: invoice.subscriptionId }, data: { status: TenantSubscriptionStatus.ACTIVE } });
      const nonPaymentHold = await tx.tenantSuspensionRecord.findFirst({ where: { tenantId: invoice.tenantId, reinstatedAt: null, reason: { not: TenantSuspensionReason.NON_PAYMENT } } });
      if (!nonPaymentHold) {
        const autoSuspension = await tx.tenantSuspensionRecord.findFirst({ where: { tenantId: invoice.tenantId, reinstatedAt: null, reason: TenantSuspensionReason.NON_PAYMENT, autoReinstate: true } });
        if (autoSuspension) {
          await tx.tenantSuspensionRecord.updateMany({ where: { tenantId: invoice.tenantId, reinstatedAt: null, reason: TenantSuspensionReason.NON_PAYMENT }, data: { reinstatedAt: paidAt } });
          await tx.tenant.update({ where: { id: invoice.tenantId }, data: { status: TenantStatus.ACTIVE, subscriptionStatus: TenantSubscriptionStatus.ACTIVE } });
        } else {
          await tx.tenant.update({ where: { id: invoice.tenantId }, data: { subscriptionStatus: TenantSubscriptionStatus.ACTIVE } });
        }
      }
      await tx.platformGatewayEvent.update({ where: { id: providerEvent.id }, data: { tenantId: invoice.tenantId, status: PlatformGatewayEventStatus.PROCESSED, processedAt: new Date() } });
      await tx.auditLog.create({ data: { tenantId: invoice.tenantId, module: "PLATFORM_BILLING", action: "PAYMONGO_PAYMENT_CONFIRMED", entityType: "PlatformPayment", entityId: payment.id, metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, gatewayPaymentId, checkoutId, amount: paidAmount, fee, netAmount, method } } });
    });
    return { ok: true as const, duplicate: false, eventId: providerEvent.id, invoiceId: invoice.id };
  } catch (error) {
    await prisma.platformGatewayEvent.update({ where: { id: providerEvent.id }, data: { status: PlatformGatewayEventStatus.FAILED, processingError: error instanceof Error ? error.message : "Webhook processing failed.", processedAt: new Date() } });
    return { ok: true as const, processingFailed: true, eventId: providerEvent.id };
  }
}
