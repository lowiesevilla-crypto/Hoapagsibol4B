import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  HOMEOWNER_ADVANCE_DUES_MAX_MONTHS,
  buildHomeownerAdvanceDuesDescription,
  homeownerAdvanceDuesMonths,
  parseHomeownerAdvanceDuesDescription,
} from "@/lib/homeowner-advance-dues";

const form = readFileSync("components/paymongo-homeowner-form-client.tsx", "utf8");
const action = readFileSync("lib/actions/homeowner-paymongo.ts", "utf8");
const quoteRoute = readFileSync("app/api/homeowner-payments/advance-dues-quote/route.ts", "utf8");
const quoteService = readFileSync("lib/services/homeowner-advance-dues.ts", "utf8");
const approvals = readFileSync("lib/services/payment-requests.ts", "utf8");
const credit = readFileSync("lib/services/homeowner-credit.ts", "utf8");
const dailyCron = readFileSync("app/api/cron/daily/route.ts", "utf8");

test("advance dues range is bounded, canonical and round-trippable", () => {
  assert.equal(HOMEOWNER_ADVANCE_DUES_MAX_MONTHS, 24);
  const range = homeownerAdvanceDuesMonths("2026-09", "2026-11");
  assert.deepEqual(range.months.map((item) => item.key), ["2026-09", "2026-10", "2026-11"]);
  const description = buildHomeownerAdvanceDuesDescription("2026-09", "2026-11");
  assert.equal(description, "HOAHUB_ADVANCE_MONTHLY_DUES|v1|2026-09|2026-11");
  const parsed = parseHomeownerAdvanceDuesDescription(description);
  assert.equal(parsed?.from, "2026-09");
  assert.equal(parsed?.to, "2026-11");
  assert.throws(() => homeownerAdvanceDuesMonths("2026-11", "2026-09"), /must not be earlier/i);
  assert.throws(() => homeownerAdvanceDuesMonths("2026-01", "2028-01"), /limited to 24 months/i);
});

test("homeowner UI requests a server quote and never accepts a client-entered advance amount", () => {
  assert.match(form, /Advance Monthly Dues/);
  assert.match(form, /name="advanceFromMonth"/);
  assert.match(form, /name="advanceToMonth"/);
  assert.match(form, /\/api\/homeowner-payments\/advance-dues-quote/);
  assert.match(form, /You cannot type or override the amount/);
  assert.match(quoteRoute, /requireHomeownerProfile\(\)/);
  assert.match(quoteRoute, /quoteHomeownerAdvanceDues/);
  assert.match(quoteService, /recurringChargeType: RecurringChargeType\.MONTHLY_DUES/);
  assert.match(quoteService, /billingMonth: \{ gte: range\.from\.date, lte: range\.to\.date \}/);
  assert.match(quoteService, /No active Monthly Dues rule covers/);
  assert.match(quoteService, /fully exempt/);
});

test("checkout action recalculates authoritative quote and creates a bill-less PayMongo Monthly Dues request", () => {
  assert.match(action, /transactionType === HOMEOWNER_ADVANCE_DUES_TRANSACTION_TYPE/);
  assert.match(action, /quoteHomeownerAdvanceDues\(\{/);
  assert.match(action, /type: PaymentRequestType\.MONTHLY_DUES/);
  assert.match(action, /billId: null/);
  assert.match(action, /description: quote\.description/);
  assert.match(action, /amount: quote\.total/);
  assert.match(action, /CREATE_HOMEOWNER_ADVANCE_DUES_CHECKOUT/);
});

test("only verified PayMongo confirmation can turn a bill-less advance request into unapplied homeowner credit", () => {
  assert.match(approvals, /parseHomeownerAdvanceDuesDescription\(request\.description\)/);
  assert.match(approvals, /Advance Monthly Dues credit requires verified PayMongo gateway confirmation/);
  assert.match(approvals, /action: "RECORD_HOMEOWNER_ADVANCE_DUES_PAYMENT"/);
  assert.match(approvals, /billId: null/);
  assert.match(approvals, /recordedAsUnappliedCredit: true/);
  assert.match(approvals, /idempotencyKey: `payment-request:\$\{request\.id\}`/);
});

test("existing automatic credit allocator remains the future-bill application mechanism", () => {
  assert.match(credit, /applyHomeownerAdvanceCreditToOpenBills/);
  assert.match(credit, /paymentAllocation\.upsert/);
  assert.match(credit, /AUTO_APPLY_HOMEOWNER_CREDIT/);
  assert.match(dailyCron, /runAutomaticBillingForTenant/);
  assert.match(dailyCron, /applyHomeownerAdvanceCreditToOpenBills/);
  assert.ok(dailyCron.indexOf("runAutomaticBillingForTenant") < dailyCron.indexOf("applyHomeownerAdvanceCreditToOpenBills"));
});
