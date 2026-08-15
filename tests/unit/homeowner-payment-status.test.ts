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

test("homeowner payment mobile surface keeps long payment sections collapsible", () => {
  const page = readFileSync("app/portal/pay/page.tsx", "utf8");
  const payMongoForm = readFileSync("components/paymongo-homeowner-form-client.tsx", "utf8");

  assert.match(page, /<details className="group rounded-3xl[^>]*>[\s\S]*Unpaid Billings/);
  assert.match(page, /<details className="group rounded-3xl[^>]*>[\s\S]*Payment Status/);
  assert.match(page, /group-open:rotate-180/);
  assert.match(payMongoForm, /<details className="group mt-5 rounded-2xl[^>]*>[\s\S]*Online payment fee disclosure/);
  assert.match(payMongoForm, /HOAHub convenience fee[\s\S]*pesoFormatter\.format\(platformFeeAmountPesos\)/);
});
