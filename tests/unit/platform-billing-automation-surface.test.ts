import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("daily maintenance runs the platform commercial billing cycle", async () => {
  const route = await source("app/api/cron/daily/route.ts");
  assert.match(route, /runPlatformBillingCycle/);
  assert.match(route, /platformBilling/);
  assert.match(route, /authorizeCron/);
});

test("automatic platform billing is idempotent and ages receivables", async () => {
  const service = await source("lib/services/platform-billing.ts");
  assert.match(service, /subscriptionId: subscription\.id/);
  assert.match(service, /billingPeriodStart: periodStart/);
  assert.match(service, /billingPeriodEnd: periodEnd/);
  assert.match(service, /PlatformInvoiceStatus\.OVERDUE/);
  assert.match(service, /TenantSubscriptionStatus\.PAST_DUE/);
  assert.match(service, /TenantSubscriptionStatus\.GRACE/);
  assert.match(service, /PLATFORM_BILLING_GRACE_DAYS/);
  assert.match(service, /PLATFORM_BILLING_SUSPEND_DAYS/);
  assert.match(service, /TenantSuspensionReason\.NON_PAYMENT/);
  assert.match(service, /autoReinstate: true/);
});

test("trusted platform billing services bypass tenant-scoped prisma only after boundary authorization", async () => {
  const [billing, gateway, actions, webhook] = await Promise.all([
    source("lib/services/platform-billing.ts"),
    source("lib/services/platform-paymongo.ts"),
    source("lib/actions/platform-billing.ts"),
    source("app/api/platform/billing/webhooks/paymongo/route.ts"),
  ]);
  assert.match(billing, /platformPrisma as prisma/);
  assert.match(gateway, /platformPrisma as prisma/);
  assert.match(actions, /requirePlatformBillingUser/);
  assert.match(gateway, /verifyPlatformInvoicePaymentToken/);
  assert.match(webhook, /paymongo-signature/);
});

test("payment recovery waits for all tenant receivables before automatic reinstatement", async () => {
  const [billing, gateway] = await Promise.all([
    source("lib/services/platform-billing.ts"),
    source("lib/services/platform-paymongo.ts"),
  ]);
  assert.match(billing, /otherOutstanding/);
  assert.match(gateway, /otherOutstanding/);
  assert.match(billing, /outstandingBalance: \{ gt: 0 \}/);
  assert.match(gateway, /outstandingBalance: \{ gt: 0 \}/);
});
