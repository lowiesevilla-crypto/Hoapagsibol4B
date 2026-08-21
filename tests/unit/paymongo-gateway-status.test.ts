import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPayMongoGatewayState,
  paymongoGatewayPresentation,
  paymongoGatewayRemark,
  paymongoGatewayStateFromRemark,
} from "../../lib/paymongo-gateway-status";

test("PayMongo paid evidence always resolves to reconciled success", () => {
  assert.equal(classifyPayMongoGatewayState({ localStatus: "PENDING_REVIEW", hasPaidPayment: true }), "PAID");
  assert.equal(classifyPayMongoGatewayState({ localStatus: "APPROVED" }), "PAID");
  assert.equal(paymongoGatewayPresentation("PAID").label, "Paid & Reconciled");
});

test("PayMongo processing and customer-action states remain open and non-financial", () => {
  assert.equal(classifyPayMongoGatewayState({ checkoutStatus: "active", paymentIntentStatus: "processing" }), "PROCESSING");
  assert.equal(classifyPayMongoGatewayState({ checkoutStatus: "active", paymentIntentStatus: "awaiting_next_action" }), "AWAITING_ACTION");
  assert.equal(paymongoGatewayPresentation("PROCESSING").terminal, false);
  assert.equal(paymongoGatewayPresentation("AWAITING_ACTION").canResume, true);
});

test("a failed PayMongo attempt remains retryable while checkout stays active", () => {
  const state = classifyPayMongoGatewayState({
    checkoutStatus: "active",
    paymentIntentStatus: "awaiting_payment_method",
    lastPaymentError: { failed_message: "declined" },
  });
  assert.equal(state, "FAILED_RETRYABLE");
  assert.equal(paymongoGatewayPresentation(state).canResume, true);
  assert.equal(paymongoGatewayPresentation(state).terminal, false);
});

test("expired and cancelled checkouts are terminal but never paid", () => {
  assert.equal(classifyPayMongoGatewayState({ checkoutStatus: "expired" }), "EXPIRED");
  assert.equal(classifyPayMongoGatewayState({ localStatus: "REJECTED", reviewRemarks: "PayMongo checkout cancelled by homeowner." }), "CANCELLED");
  assert.equal(paymongoGatewayPresentation("EXPIRED").terminal, true);
  assert.equal(paymongoGatewayPresentation("CANCELLED").terminal, true);
});

test("stored gateway states round-trip safely through review remarks", () => {
  const remark = paymongoGatewayRemark("FAILED_RETRYABLE");
  assert.equal(paymongoGatewayStateFromRemark(remark), "FAILED_RETRYABLE");
  assert.equal(paymongoGatewayStateFromRemark("unrelated remark"), null);
});
