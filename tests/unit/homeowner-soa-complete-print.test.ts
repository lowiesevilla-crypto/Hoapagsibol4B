import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const soaPage = fs.readFileSync(path.join(root, "app/portal/soa/page.tsx"), "utf8");
const printDocument = fs.readFileSync(path.join(root, "components/homeowner/payments/homeowner-soa-print-document.tsx"), "utf8");

test("homeowner SOA keeps all requested financial histories collapsible and closed by default", () => {
  for (const title of ["Receivables aging", "Running ledger", "Payment history", "Billing history"]) {
    assert.ok(soaPage.includes(`title=\"${title}\"`), `${title} must remain a collapsible SOA section`);
  }
  assert.match(soaPage, /<details className=/);
  assert.match(soaPage, /group-open:rotate-180/);
  assert.doesNotMatch(soaPage, /defaultOpen/);
  assert.doesNotMatch(soaPage, /<details[^>]+\sopen[=\s>]/);
  assert.match(soaPage, /Net account balance/);
  assert.match(soaPage, /currentOutstandingBalance/);
  assert.match(soaPage, /availableCredit/);
  assert.doesNotMatch(soaPage, /A tenant-scoped summary of your balances/);
});

test("Print SOA uses a dedicated complete statement independent of collapsed screen state", () => {
  assert.match(soaPage, /print-hidden space-y-4/);
  assert.match(soaPage, /<HomeownerSoaPrintDocument soa=\{soa\}/);
  assert.match(soaPage, /<SoaPrintButton \/>/);
  assert.match(printDocument, /hidden print:block/);
  assert.match(printDocument, /Homeowner Information/);
  assert.match(printDocument, /Property Address/);
  assert.match(printDocument, /Contact Number/);
  assert.match(printDocument, /Email/);
  assert.match(printDocument, /Monthly Dues/);
  assert.match(printDocument, /Account Summary/);
  assert.match(printDocument, /Total Amount Billed/);
  assert.match(printDocument, /Total Payments/);
  assert.match(printDocument, /Total Credits/);
  assert.match(printDocument, /Total Penalties/);
  assert.match(printDocument, /Receivables Aging/);
  assert.match(printDocument, /Running Ledger/);
  assert.match(printDocument, /Payment History/);
  assert.match(printDocument, /Official Receipt No\./);
  assert.match(printDocument, /Payment Method/);
  assert.match(printDocument, /Reference Number/);
  assert.match(printDocument, /Coverage/);
  assert.match(printDocument, /Collector/);
  assert.match(printDocument, /Billing History/);
  assert.match(printDocument, /Treasurer \/ Authorized HOA Representative/);
});

test("homeowner SOA remains server-authorized and tenant scoped", () => {
  assert.match(soaPage, /requireHomeownerProfile/);
  assert.match(soaPage, /getStatementOfAccount\(profile\.id, profile\.tenantId/);
  assert.doesNotMatch(soaPage, /searchParams.*tenantId/);
  assert.doesNotMatch(printDocument, /soa\.verifyUrl/);
});
