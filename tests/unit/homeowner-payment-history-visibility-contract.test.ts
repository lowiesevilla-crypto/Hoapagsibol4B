import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("homeowner online payment history archive is tenant-owned, audited, reversible, and non-destructive", () => {
  const route = read("app/api/homeowner-payments/history-visibility/route.ts");
  const statusRoute = read("app/api/homeowner-payments/paymongo/status/route.ts");
  const service = read("lib/services/homeowner-payment-history-visibility.ts");
  const component = read("components/paymongo-payment-status-sync.tsx");

  assert.match(route, /requireUser\(Role\.HOMEOWNER\)/);
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(route, /tenantId: user\.tenantId/);
  assert.match(route, /homeownerId: user\.homeownerProfile\.id/);
  assert.match(route, /actorId: user\.id/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function DELETE/);

  assert.match(service, /tenantId: input\.tenantId/);
  assert.match(service, /homeownerId: input\.homeownerId/);
  assert.match(service, /proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER/);
  assert.match(service, /PaymentRequestStatus\.APPROVED/);
  assert.match(service, /PaymentRequestStatus\.REJECTED/);
  assert.match(service, /prisma\.auditLog\.create/);
  assert.match(service, /PAYMENT_REQUEST_AND_ACCOUNTING_EVIDENCE_UNCHANGED/);
  assert.doesNotMatch(service, /paymentRequest\.(delete|deleteMany)/);
  assert.doesNotMatch(service, /prisma\.payment\.(delete|deleteMany|update|updateMany)/);

  const reconcileIndex = statusRoute.indexOf("reconcilePendingHomeownerPayMongoPayments");
  const visibilityIndex = statusRoute.indexOf("hiddenHomeownerPaymentRequestIds");
  assert.ok(reconcileIndex >= 0 && visibilityIndex >= 0);
  assert.match(statusRoute, /hiddenRequestIds: \[\.\.\.hiddenIds\]/);

  assert.match(component, /Archive from this view/);
  assert.match(component, /Archived from this view/);
  assert.match(component, /Restore/);
  assert.match(component, /Official HOA payment, receipt, reconciliation, gateway and audit records/);
  assert.match(component, /\/api\/homeowner-payments\/history-visibility/);
  assert.match(component, /method: hidden \? "POST" : "DELETE"/);
});
