import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  resolveHomeownerPaymentRequestDisplayStatus,
  resolveHomeownerPaymentStatus,
} from "../../lib/services/homeowner-payment-status";

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

test("settled balance wins even when a stale pending request still exists", () => {
  assert.deepEqual(
    resolveHomeownerPaymentStatus({
      hasBills: true,
      balance: 0,
      collectionStatus: "Current",
      hasPending: true,
      hasRejected: false,
    }),
    { label: "Fully Paid", tone: "success" },
  );
});

test("rejected status remains visible only while an outstanding balance still exists", () => {
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

test("posted PayMongo payment is displayed as paid even if request metadata is stale", () => {
  assert.deepEqual(
    resolveHomeownerPaymentRequestDisplayStatus({
      requestStatus: "REJECTED",
      onlineRequest: true,
      hasPostedPayment: true,
    }),
    { label: "Paid · PayMongo confirmed", tone: "success" },
  );
});

test("homeowner payment page derives each request card from linked posted ledger artifacts", () => {
  const page = readFileSync("app/portal/pay/page.tsx", "utf8");
  assert.match(page, /resolveHomeownerPaymentRequestDisplayStatus/);
  assert.match(page, /hasPostedPayment: Boolean\(request\.payment \|\| request\.collection\)/);
  assert.match(page, /status=\{displayStatus\.label\}/);
  assert.match(page, /statusTone=\{displayStatus\.tone\}/);
});
