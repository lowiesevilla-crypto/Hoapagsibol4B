import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const recordPage = readFileSync("app/admin/payments/record/page.tsx", "utf8");
const recordForm = readFileSync("components/record-payment-advance-form.tsx", "utf8");
const optionsRoute = readFileSync("app/api/admin/payments/record-options/route.ts", "utf8");
const action = readFileSync("lib/actions/advance-payments.ts", "utf8");
const recording = readFileSync("lib/services/payment-recording.ts", "utf8");
const credit = readFileSync("lib/services/homeowner-credit.ts", "utf8");
const dailyCron = readFileSync("app/api/cron/daily/route.ts", "utf8");
const ledger = readFileSync("lib/services/payment-ledger.ts", "utf8");

test("record payment is homeowner-first and searchable independent of open bills", () => {
  assert.match(recordPage, /all active homeowners/i);
  assert.match(recordForm, /Search any active homeowner/i);
  assert.match(recordForm, /Zero open balance · Advance payment available/);
  assert.match(optionsRoute, /homeownerSearchWhere/);
  assert.match(optionsRoute, /status: "ACTIVE"/);
  assert.match(optionsRoute, /take: 100/);
});

test("admin can record a pure advance monthly dues payment", () => {
  assert.match(recordForm, /name="homeownerId"/);
  assert.match(action, /homeownerId/);
  assert.match(recording, /RECORD_ADVANCE_MONTHLY_DUES_PAYMENT/);
  assert.match(recording, /Advance Monthly Dues Credit/);
  assert.match(recording, /allocations\.length/);
});

test("advance credit is applied automatically and can be maintained safely", () => {
  assert.match(credit, /applyHomeownerAdvanceCreditToOpenBills/);
  assert.match(credit, /paymentAllocation\.upsert/);
  assert.match(credit, /AUTO_APPLY_HOMEOWNER_CREDIT/);
  assert.match(dailyCron, /applyHomeownerAdvanceCreditToOpenBills/);
  assert.match(ledger, /UPDATE_ADVANCE_PAYMENT_AMOUNT/);
  assert.match(ledger, /VOID_ADVANCE_PAYMENT_TRANSACTION/);
});
