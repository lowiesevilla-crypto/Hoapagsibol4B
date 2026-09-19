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
