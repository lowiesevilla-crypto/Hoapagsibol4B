import assert from "node:assert/strict";
import test from "node:test";
import { resolveHomeownerPaymentStatus } from "../../lib/services/homeowner-payment-status";

test("successful retry wins over an earlier rejected payment attempt once the balance is settled", () => {
  assert.deepEqual(
    resolveHomeownerPaymentStatus({
      hasBills: true,
      balance: 0,
      collectionStatus: "Current",
      hasPending: false,
      hasRejected: true,
    }),
    { label: "Fully Paid", tone: "success" },
  );
});

test("rejected status remains visible while an outstanding balance still exists", () => {
  assert.deepEqual(
    resolveHomeownerPaymentStatus({
      hasBills: true,
      balance: 100,
      collectionStatus: "Current",
      hasPending: false,
      hasRejected: true,
    }),
    { label: "Payment Rejected", tone: "danger" },
  );
});

test("pending status remains visible while an outstanding balance still exists", () => {
  assert.deepEqual(
    resolveHomeownerPaymentStatus({
      hasBills: true,
      balance: 100,
      collectionStatus: "Current",
      hasPending: true,
      hasRejected: false,
    }),
    { label: "Payment Pending", tone: "warning" },
  );
});
