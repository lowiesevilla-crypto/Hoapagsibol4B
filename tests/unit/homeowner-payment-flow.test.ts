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

test("homeowner checkout is created on behalf of the tenant child account with a bounded platform fee split", () => {
  const paymongoService = source("lib/services/homeowner-paymongo.ts");
  const feePolicy = source("lib/homeowner-convenience-fee.ts");
  assert.match(paymongoService, /PAYMONGO_HOMEOWNER_SECRET_KEY/);
  assert.match(paymongoService, /"Account-ID": accountId/);
  assert.match(paymongoService, /paymongoHeaders\(linkedAccountId\)/);
  assert.match(paymongoService, /linkedTransaction: true/);
  assert.match(paymongoService, /split_payment: splitPayment/);
  assert.match(paymongoService, /pass_on_fees: true/);
  assert.match(paymongoService, /platformFeeRecipientAccountId/);
  assert.match(feePolicy, /transfer_to: childAccountId/);
  assert.match(feePolicy, /merchant_id: parentAccountId/);
  assert.match(feePolicy, /split_type: "fixed"/);
  assert.match(feePolicy, /if \(!feeCentavos\) return undefined/);
  assert.match(feePolicy, /if \(!parentAccountId\.startsWith\("org_"\)\)/);
  assert.match(feePolicy, /if \(childAccountId === parentAccountId\)/);
  assert.doesNotMatch(paymongoService, /PAYMONGO_HOMEOWNER_WEBHOOK_SECRET/);
  assert.doesNotMatch(paymongoService, /requiredHomeownerPayMongoSecret\("PAYMONGO_SECRET_KEY"/);
});

test("only HOAHub platform roles can change a tenant convenience fee", () => {
  const feeAction = source("lib/actions/platform-homeowner-fee.ts");
  assert.match(feeAction, /actor\.roles\.includes\(Role\.SUPER_ADMIN\)/);
  assert.match(feeAction, /actor\.roles\.includes\(Role\.PLATFORM_ADMIN\)/);
  assert.match(feeAction, /redirect\("\/admin\/dashboard"\)/);
  assert.match(feeAction, /UPDATE_HOMEOWNER_CONVENIENCE_FEE/);
});

test("PayMongo Online activation provisions a child-scoped checkout webhook", () => {
  const settingsAction = source("lib/actions/homeowner-payment-settings.ts");
  const paymongoService = source("lib/services/homeowner-paymongo.ts");
  assert.match(settingsAction, /ensureHomeownerPayMongoWebhook\(paymongoLinkedAccountId\)/);
  assert.match(settingsAction, /paymongoWebhookSecretSettingKey\(paymongoLinkedAccountId\)/);
  assert.match(settingsAction, /isSecret: true/);
  assert.match(paymongoService, /https:\/\/api\.paymongo\.com\/v1\/webhooks/);
  assert.match(paymongoService, /events: \[HOMEOWNER_WEBHOOK_EVENT\]/);
  assert.match(paymongoService, /headers: paymongoHeaders\(accountId\)/);
});

test("child webhook verification is tenant scoped and fails closed", () => {
  const paymongoService = source("lib/services/homeowner-paymongo.ts");
  assert.match(paymongoService, /organizationId/);
  assert.match(paymongoService, /resolveWebhookTenant\(event\.organizationId\)/);
  assert.match(paymongoService, /verifyPayMongoWebhookSignature\(rawBody, signatureHeader, webhookContext\.webhookSecret\)/);
  assert.match(paymongoService, /request\.tenantId !== webhookContext\.tenantId \|\| linkedAccountId !== event\.organizationId/);
  assert.match(paymongoService, /PayMongo child account is mapped to more than one tenant/);
});

test("PayMongo checkouts require a provisioned webhook for the snapshotted child account", () => {
  const paymongoService = source("lib/services/homeowner-paymongo.ts");
  assert.match(paymongoService, /requireTenantWebhookSecret\(request\.tenantId, linkedAccountId\)/);
  assert.match(paymongoService, /paymongoWebhookSecretSettingKey\(accountId\)/);
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
