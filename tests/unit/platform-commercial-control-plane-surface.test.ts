import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("platform commercial ledger is separate from homeowner billing", async () => {
  const schema = await source("prisma/schema.prisma");
  for (const model of ["SubscriptionPlan", "TenantSubscription", "TenantBillingProfile", "PlatformInvoice", "PlatformPayment", "PlatformPaymentAllocation", "PlatformGatewayEvent", "TenantSuspensionRecord"]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(schema, /subscription\s+TenantSubscription\s+@relation\(fields: \[tenantId, subscriptionId\]/);
  assert.match(schema, /payment\s+PlatformPayment\s+@relation\(fields: \[tenantId, paymentId\]/);
  assert.match(schema, /invoice\s+PlatformInvoice\s+@relation\(fields: \[tenantId, invoiceId\]/);
});

test("tenant portfolio and billing pages expose premium commercial controls", async () => {
  const [tenants, billing, plans, subscriptions, tabs] = await Promise.all([
    source("app/platform/tenants/page.tsx"),
    source("app/platform/tenants/[id]/billing/page.tsx"),
    source("app/platform/plans/page.tsx"),
    source("app/platform/subscriptions/page.tsx"),
    source("components/platform-tenant-tabs.tsx"),
  ]);
  assert.match(tenants, /Outstanding AR/);
  assert.match(tenants, /Next billing/);
  assert.match(tenants, /\/billing/);
  assert.match(billing, /Generate bill/);
  assert.match(billing, /Record external\/manual payment/);
  assert.match(billing, /Suspend tenant/);
  assert.match(billing, /Reinstate tenant/);
  assert.match(plans, /Subscription plan catalog/);
  assert.match(plans, /createSubscriptionPlanAction/);
  assert.match(subscriptions, /Tenant subscriptions/);
  assert.match(subscriptions, /Outstanding AR/);
  assert.match(tabs, /Subscription & Billing/);
});

test("PayMongo checkout uses V2 hosted checkout and webhook source of truth", async () => {
  const [gateway, webhook, middleware, paymentPage, env] = await Promise.all([
    source("lib/services/platform-paymongo.ts"),
    source("app/api/platform/billing/webhooks/paymongo/route.ts"),
    source("middleware.ts"),
    source("app/subscription/pay/[invoiceId]/page.tsx"),
    source(".env.example"),
  ]);
  assert.match(gateway, /https:\/\/api\.paymongo\.com\/v2\/checkout_sessions/);
  assert.match(gateway, /Idempotency-Key/);
  assert.match(gateway, /checkout_session\.payment\.paid/);
  assert.match(gateway, /PayMongo amount does not match/);
  assert.match(gateway, /createHmac\("sha256"/);
  assert.match(gateway, /timingSafeEqual/);
  assert.match(webhook, /request\.text\(\)/);
  assert.match(webhook, /paymongo-signature/);
  assert.match(middleware, /\/api\/platform\/billing\/webhooks\/paymongo/);
  assert.match(paymentPage, /Pay .* online/);
  assert.match(paymentPage, /verified gateway webhook/);
  assert.match(env, /PAYMONGO_SECRET_KEY/);
  assert.match(env, /PAYMONGO_WEBHOOK_SECRET/);
});

test("commercial suspension revokes sessions and supports eligible automatic reinstatement", async () => {
  const service = await source("lib/services/platform-billing.ts");
  assert.match(service, /TENANT_SUSPENDED/);
  assert.match(service, /userSession\.updateMany/);
  assert.match(service, /TenantSuspensionReason\.NON_PAYMENT/);
  assert.match(service, /autoReinstate: true/);
  assert.match(service, /TENANT_REINSTATED/);
});
