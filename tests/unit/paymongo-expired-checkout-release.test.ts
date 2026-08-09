import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("expired PayMongo checkout releases pending billing items only when no paid payment exists", () => {
  const expiry = source("lib/services/homeowner-paymongo-expiry.ts");
  assert.match(expiry, /String\(attributes\.status \|\| ""\)/);
  assert.match(expiry, /=== "paid"/);
  assert.match(expiry, /if \(hasPaidPayment\)/);
  assert.match(expiry, /checkoutStatus !== "expired"/);
  assert.match(expiry, /status: PaymentRequestStatus\.REJECTED/);
  assert.match(expiry, /reviewRemarks: PAYMONGO_EXPIRED_REMARK/);
  assert.match(expiry, /status: PaymentRequestStatus\.PENDING_REVIEW/);
  assert.match(expiry, /PAYMONGO_HOMEOWNER_CHECKOUT_EXPIRED/);
  assert.match(expiry, /releasedBillIds/);
});

test("expired checkout validation preserves tenant, homeowner and merchant isolation", () => {
  const expiry = source("lib/services/homeowner-paymongo-expiry.ts");
  assert.match(expiry, /loadLeader\(input\.requestId, input\.tenantId, input\.homeownerId\)/);
  assert.match(expiry, /linkedAccountId\.startsWith\("org_"\)/);
  assert.match(expiry, /item\.tenantId !== leader\.tenantId/);
  assert.match(expiry, /item\.homeownerId !== leader\.homeownerId/);
  assert.match(expiry, /metadata\.tenantId/);
  assert.match(expiry, /metadata\.homeownerId/);
  assert.match(expiry, /metadata\.paymentRequestId/);
  assert.match(expiry, /reference_number/);
});

test("homeowner continue payment releases an expired session instead of silently creating a replacement", () => {
  const resume = source("app/portal/pay/paymongo-resume/route.ts");
  assert.match(resume, /releaseExpiredHomeownerPayMongoCheckout/);
  assert.match(resume, /expiry\.state === "expired"/);
  assert.match(resume, /billing items were released/);
  assert.match(resume, /resumeHomeownerPayMongoCheckout/);
  assert.ok(resume.indexOf("releaseExpiredHomeownerPayMongoCheckout") < resume.indexOf("resumeHomeownerPayMongoCheckout(ownedRequest.id"));
});

test("admin reconciliation also releases expired sessions without manual approval", () => {
  const action = source("lib/actions/homeowner-paymongo-reconciliation.ts");
  assert.match(action, /releaseExpiredHomeownerPayMongoCheckout/);
  assert.match(action, /expiry\.state === "expired"/);
  assert.match(action, /billing%20items%20were%20released/);
  assert.doesNotMatch(action, /approvePaymentRequestAction/);
});

test("PayMongo return path releases expired awaiting sessions", () => {
  const route = source("app/portal/pay/paymongo-confirm/route.ts");
  assert.match(route, /releaseExpiredHomeownerPayMongoCheckout/);
  assert.match(route, /item\.state === "awaiting_payment"/);
  assert.match(route, /online", "expired"/);
  assert.match(route, /billing items were released/);
});

test("released requests no longer lock billing selection", () => {
  const portal = source("app/portal/pay/page.tsx");
  assert.match(portal, /paymentRequests: \{ where: \{ tenantId: profile\.tenantId, status: "PENDING_REVIEW" \}/);
  assert.match(portal, /hasPendingRequest: bill\.paymentRequests\.length > 0/);
});
