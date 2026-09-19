import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("platform manual payment form submits enum values instead of humanized labels", async () => {
  const page = await source("app/platform/tenants/[id]/billing/page.tsx");
  assert.match(page, /<option key=\{value\} value=\{value\}>\{value\.replaceAll\("_", " "\)\}<\/option>/);
  assert.match(page, /defaultValue=\{PlatformPaymentMethod\.BANK_TRANSFER\}/);
});

test("successful manual payment opens the committed receipt instead of returning without a receipt", async () => {
  const action = await source("lib/actions/platform-billing.ts");
  assert.match(action, /payment = await recordPlatformManualPaymentSafe/);
  assert.match(action, /redirect\(\x60\/platform\/payments\/\$\{payment\.id\}\/receipt\x60\)/);

  const receipt = await source("app/platform/payments/[id]/receipt/page.tsx");
  assert.match(receipt, /Official Manual Payment Receipt/);
  assert.match(receipt, /Remaining balance/);
  assert.match(receipt, /getPlatformManualPaymentReceipt/);
});

test("manual payment receipt loader is limited to successful manual platform payments", async () => {
  const service = await source("lib/services/platform-manual-payment.ts");
  assert.match(service, /gateway: PlatformPaymentGateway\.MANUAL/);
  assert.match(service, /status: PlatformPaymentStatus\.SUCCEEDED/);
  assert.match(service, /allocation\.tenantId !== payment\.tenantId/);
  assert.match(service, /allocation\.invoice\.tenantId !== payment\.tenantId/);
});


test("tenant admin subscription page exposes a receipt link only for successful manual platform payments", async () => {
  const page = await source("app/admin/subscription/page.tsx");
  assert.match(page, /payment\.gateway === "MANUAL" && payment\.status === "SUCCEEDED"/);
  assert.match(page, /\/admin\/subscription\/payments\/\$\{payment\.id\}\/receipt/);

  const receipt = await source("app/admin/subscription/payments/[id]/receipt/page.tsx");
  assert.match(receipt, /requireUser\(Role\.ADMIN\)/);
  assert.match(receipt, /getTenantPlatformManualPaymentReceipt\(id, user\.tenantId\)/);
  assert.match(receipt, /Official Manual Payment Receipt/);
  assert.match(receipt, /Remaining balance/);
});

test("tenant receipt loader enforces payment and allocation tenant scope", async () => {
  const service = await source("lib/services/platform-manual-payment.ts");
  assert.match(service, /getTenantPlatformManualPaymentReceipt\(paymentId: string, tenantId: string\)/);
  assert.match(service, /id: paymentId,[\s\S]*tenantId,/);
  assert.match(service, /allocation\.tenantId !== tenantId/);
  assert.match(service, /allocation\.invoice\.tenantId !== tenantId/);
});


test("platform and tenant admin payment history show only successful platform payments", async () => {
  const service = await source("lib/services/platform-billing.ts");
  assert.match(service, /where: \{ tenantId, status: PlatformPaymentStatus\.SUCCEEDED \}/);

  const adminPage = await source("app/admin/subscription/page.tsx");
  assert.match(adminPage, /PlatformPaymentStatus/);
  assert.match(adminPage, /where: \{ tenantId: user\.tenantId, status: PlatformPaymentStatus\.SUCCEEDED \}/);
});


test("manual payment receipts use the shared HOAHub billing issuer logo and address source", async () => {
  for (const path of [
    "app/platform/payments/[id]/receipt/page.tsx",
    "app/admin/subscription/payments/[id]/receipt/page.tsx",
  ]) {
    const receipt = await source(path);
    assert.match(receipt, /platformBillingIssuer/);
    assert.match(receipt, /Hoahub-logo\.png/);
    assert.match(receipt, /issuer\.address/);
    assert.match(receipt, /issuer\.email/);
    assert.match(receipt, /issuer\.website/);
  }
});
