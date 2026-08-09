import assert from "node:assert/strict";
import test from "node:test";
import {
  isPaymongoCheckoutSessionRemark,
  paymongoBatchDescription,
  paymongoBatchId,
  paymongoCheckoutSessionId,
  paymongoCheckoutSessionRemark,
} from "../../lib/homeowner-paymongo-batch";

test("PayMongo monthly dues batch markers round-trip without exposing browser-controlled state", () => {
  assert.equal(paymongoBatchDescription("request-leader"), "PMB:request-leader");
  assert.equal(paymongoBatchId("PMB:request-leader", "fallback"), "request-leader");
  assert.equal(paymongoBatchId("ordinary description", "fallback"), "fallback");
  assert.throws(() => paymongoBatchDescription(""), /batch ID is required/);
});

test("PayMongo checkout session markers only accept checkout-session identifiers", () => {
  assert.equal(paymongoCheckoutSessionRemark("cs_checkout123"), "PAYMONGO_CHECKOUT_SESSION:cs_checkout123");
  assert.equal(paymongoCheckoutSessionId("PAYMONGO_CHECKOUT_SESSION:cs_checkout123"), "cs_checkout123");
  assert.equal(isPaymongoCheckoutSessionRemark("PAYMONGO_CHECKOUT_SESSION:cs_checkout123"), true);
  assert.equal(paymongoCheckoutSessionId("PayMongo checkout cancelled by homeowner."), "");
  assert.equal(isPaymongoCheckoutSessionRemark(null), false);
  assert.throws(() => paymongoCheckoutSessionRemark("pi_not_checkout"), /checkout session ID is invalid/);
});
