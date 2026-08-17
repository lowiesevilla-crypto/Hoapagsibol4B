import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const soaPage = readFileSync("app/portal/soa/page.tsx", "utf8");
const printDocument = readFileSync("components/homeowner/payments/homeowner-soa-print-document.tsx", "utf8");
const aiShortcut = readFileSync("components/ai/ai-floating-shortcut.tsx", "utf8");

test("homeowner SOA uses compact progressive disclosure for secondary financial data", () => {
  assert.match(soaPage, /SoaDisclosure title="Receivables aging"/);
  assert.match(soaPage, /SoaDisclosure title="Running ledger"/);
  assert.match(soaPage, /SoaDisclosure title="Payment history"/);
  assert.match(soaPage, /SoaDisclosure title="Billing history"/);
  assert.match(soaPage, /<details className="soa-disclosure/);
  assert.doesNotMatch(soaPage, /defaultOpen/);
  assert.match(soaPage, /soa-primary-summary/);
  assert.doesNotMatch(soaPage, /sm:grid-cols-2 xl:grid-cols-4/);
});

test("homeowner SOA screen includes canonical identity and property information", () => {
  assert.match(soaPage, /soa-account-identity/);
  assert.match(soaPage, /label="Homeowner" value=\{soa\.homeowner\.user\.name\}/);
  assert.match(soaPage, /label="Account number" value=\{soa\.accountNumber\}/);
  assert.match(soaPage, /label="Property" value=\{propertyLabel\} note=\{soa\.homeowner\.address\}/);
  assert.match(soaPage, /label="Statement" value=\{soa\.statementCode\}/);
  assert.match(soaPage, /As of \$\{shortDate\(soa\.statementDate\)\}/);
});

test("print output is a dedicated complete statement independent of disclosure state", () => {
  assert.match(soaPage, /className="print-hidden space-y-4/);
  assert.match(soaPage, /<HomeownerSoaPrintDocument soa=\{soa\}/);
  assert.match(printDocument, /hidden print:block/);
  assert.match(printDocument, /Homeowner Information/);
  assert.match(printDocument, /Property Address/);
  assert.match(printDocument, /Account Summary/);
  assert.match(printDocument, /Receivables Aging/);
  assert.match(printDocument, /Running Ledger/);
  assert.match(printDocument, /Payment History/);
  assert.match(printDocument, /Payment Method/);
  assert.match(printDocument, /Reference Number/);
  assert.match(printDocument, /Collector/);
  assert.match(printDocument, /Billing History/);
  assert.match(aiShortcut, /className="print-hidden group fixed/);
});
