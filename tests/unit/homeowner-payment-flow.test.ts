import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_HOMEOWNER_PAYMENT_FLOW, PAYMONGO_PAYMENT_REQUEST_MARKER, isPayMongoPaymentRequest, normalizeHomeownerPaymentFlow } from "../../lib/homeowner-payment-flow";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("homeowner payment flow defaults safely to the existing manual flow", () => {
  assert.equal(DEFAULT_HOMEOWNER_PAYMENT_FLOW, "MANUAL_QR");
  assert.equal(normalizeHomeownerPaymentFlow(undefined), "MANUAL_QR");
  assert.equal(normalizeHomeownerPaymentFlow(""), "MANUAL_QR");
  assert.equal(normalizeHomeownerPaymentFlow("INVALID"), "MANUAL_QR");
  assert.equal(normalizeHomeownerPaymentFlow("PAYMONGO"), "PAYMONGO");
});

test("PayMongo payment requests use an internal non-upload marker", () => {
  assert.equal(isPayMongoPaymentRequest({ proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER }), true);
  assert.equal(isPayMongoPaymentRequest({ proofContentType: "image/png" }), false);
  assert.equal(isPayMongoPaymentRequest({ proofContentType: null }), false);
});

test("manual and PayMongo submission paths both enforce the tenant-selected flow", () => {
  const manualAction = source("lib/actions/payment-requests.ts");
  const paymongoAction = source("lib/actions/homeowner-paymongo.ts");
  assert.match(manualAction, /paymentConfig\.flow !== "MANUAL_QR"/);
  assert.match(paymongoAction, /config\.flow !== "PAYMONGO"/);
});

test("homeowner PayMongo checkout routes funds to the tenant linked account and uses separate credentials", () => {
  const paymongoService = source("lib/services/homeowner-paymongo.ts");
  assert.match(paymongoService, /PAYMONGO_HOMEOWNER_SECRET_KEY/);
  assert.match(paymongoService, /PAYMONGO_HOMEOWNER_WEBHOOK_SECRET/);
  assert.match(paymongoService, /split_payment:\s*\{\s*transfer_to: linkedAccountId/);
  assert.doesNotMatch(paymongoService, /requiredHomeownerPayMongoSecret\("PAYMONGO_SECRET_KEY"/);
});

test("PayMongo-origin requests cannot be manually approved or rejected", () => {
  const postingService = source("lib/services/payment-requests.ts");
  assert.match(postingService, /isPayMongoPaymentRequest\(request\) && !options\?\.allowGatewayConfirmation/);
  assert.match(postingService, /PayMongo payment requests are controlled by the payment gateway/);
});

test("the homeowner portal renders a single flow based on tenant configuration", () => {
  const page = source("app/portal/pay/page.tsx");
  assert.match(page, /const isPayMongoFlow = paymentConfig\.flow === "PAYMONGO"/);
  assert.match(page, /isPayMongoFlow \? <PayMongoHomeownerForm/);
  assert.match(page, /<PayByQrForm/);
});
