import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync("app/api/homeowner-payments/paymongo/status/route.ts", "utf8");
const componentSource = readFileSync("components/paymongo-payment-status-sync.tsx", "utf8");

test("homeowner PayMongo history hide remains tenant/homeowner scoped and non-destructive", () => {
  assert.match(routeSource, /requireUser\(Role\.HOMEOWNER\)/);
  assert.match(routeSource, /tenantId: user\.tenantId/);
  assert.match(routeSource, /homeownerId: user\.homeownerProfile\.id/);
  assert.match(routeSource, /if \(!payment\.terminal\)/);
  assert.match(routeSource, /HOMEOWNER_HIDE_PAYMONGO_HISTORY/);
  assert.match(routeSource, /semantics: "HOMEOWNER_VISIBILITY_ONLY"/);
  assert.match(routeSource, /retainedEvidence: true/);
  assert.doesNotMatch(routeSource, /prisma\.payment\.delete/);
  assert.doesNotMatch(routeSource, /prisma\.paymentRequest\.delete/);
});

test("hidden PayMongo status items are filtered only from the homeowner-visible status response", () => {
  assert.match(routeSource, /actorId: user\.id/);
  assert.match(routeSource, /correlationId: user\.homeownerProfile\.id/);
  assert.match(routeSource, /payments\.filter\(\(payment\) => !hiddenIds\.has\(payment\.requestId\)\)/);
});

test("homeowner status stays collapsible and exposes hide only for terminal activity", () => {
  assert.match(componentSource, /<details[^>]*open[^>]*aria-live="polite"/);
  assert.match(componentSource, /payment\.terminal && <button/);
  assert.match(componentSource, /Remove from my history/);
  assert.match(componentSource, /Official payment, receipt, reconciliation, and audit records will be retained/);
});
