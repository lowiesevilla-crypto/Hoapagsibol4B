import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("settlement trace resolves the opaque request under authenticated tenant payment authority", () => {
  const page = source("app/admin/payments/online/[id]/page.tsx");
  const service = source("lib/services/paymongo-settlement-trace.ts");

  assert.match(page, /requirePermission\(Permission\.PAYMENTS_MANAGE\)/);
  assert.match(page, /tenantId: admin\.tenantId, requestId: id/);
  assert.match(service, /where: \{ id: requestId, tenantId, proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER \}/);
  assert.match(service, /tenantId: input\.tenantId,[\s\S]*entityType: "PaymentRequest"/);
  assert.match(service, /item\.tenantId !== input\.tenantId \|\| item\.homeownerId !== leader\.homeownerId/);
});

test("settlement trace uses child-scoped checkout retrieval and exact payment-to-payout matching", () => {
  const service = source("lib/services/paymongo-settlement-trace.ts");

  assert.match(service, /"Account-ID": accountId/);
  assert.match(service, /\/checkout_sessions\/\$\{encodeURIComponent\(checkoutId\)\}/);
  assert.match(service, /attributes\.payment_id === input\.paymentId/);
  assert.match(service, /attributes\.organization_id === input\.organizationId/);
  assert.match(service, /transactionTypes: \["split_payment"\]/);
  assert.match(service, /transactionTypes: \["payment", "split_payment"\]/);
  assert.match(service, /exactMatch: false/);
  assert.match(service, /aggregate payout estimate, not proof that this individual payment is included/);
});

test("settlement trace UI separates money destinations and exposes no bank-account payload", () => {
  const listPage = source("app/admin/payments/online/page.tsx");
  const detailPage = source("app/admin/payments/online/[id]/page.tsx");

  assert.match(listPage, /Trace settlement/);
  assert.match(detailPage, /HOA principal/);
  assert.match(detailPage, /HOAHub fee/);
  assert.match(detailPage, /Processing fee/);
  assert.match(detailPage, /Original Payment ID/);
  assert.match(detailPage, /This page never initiates, changes, refunds, or releases money/);
  assert.doesNotMatch(detailPage, /Authorization|PAYMONGO_HOMEOWNER_SECRET_KEY/);
  assert.doesNotMatch(detailPage, /bank_account_number|receiver_account_number/);
});
