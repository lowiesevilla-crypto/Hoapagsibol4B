import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("platform settlement reconciliation uses existing payment audit evidence and PayMongo payout transactions", async () => {
  const service = await source("lib/services/platform-payment-settlements.ts");

  assert.match(service, /PAYMONGO_HOMEOWNER_PAYMENT_CONFIRMED/);
  assert.match(service, /\/payments\/\$\{encodeURIComponent\(paymentId\)\}/);
  assert.match(service, /\/payouts\/\$\{encodeURIComponent\(payout\.id\)\}\/transactions/);
  assert.match(service, /stringValue\(resource\.type\) !== "split_payment"/);
  assert.match(service, /attributes\.payment_id/);
  assert.match(service, /available_at/);
  assert.match(service, /credited_at/);
  assert.match(service, /No fallback transfer/iu);
});

test("platform payment settlements are visible from platform navigation and remain read only", async () => {
  const links = await source("components/sidebar-links.ts");
  const page = await source("app/platform/payment-settlements/page.tsx");

  assert.match(links, /href: "\/platform\/payment-settlements", label: "Payment Settlements", icon: "payments"/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /Live PayMongo reconciliation/);
  assert.match(page, /Read only/);
  assert.match(page, /No fallback transfer is attempted/);
  assert.doesNotMatch(page, /method:\s*"POST"/);
  assert.doesNotMatch(page, /method:\s*"PUT"/);
  assert.doesNotMatch(page, /method:\s*"DELETE"/);
});
