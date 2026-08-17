import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const soaPage = readFileSync("app/portal/soa/page.tsx", "utf8");
const aiShortcut = readFileSync("components/ai/ai-floating-shortcut.tsx", "utf8");

test("homeowner SOA uses compact progressive disclosure for secondary financial data", () => {
  assert.match(soaPage, /SoaDisclosure title="Receivables aging"/);
  assert.match(soaPage, /SoaDisclosure title="Running ledger"/);
  assert.match(soaPage, /SoaDisclosure title="Payment history"/);
  assert.match(soaPage, /SoaDisclosure title="Billing history"/);
  assert.match(soaPage, /defaultOpen/);
  assert.match(soaPage, /soa-primary-summary/);
  assert.doesNotMatch(soaPage, /sm:grid-cols-2 xl:grid-cols-4/);
});

test("printed homeowner SOA includes canonical identity and property information", () => {
  assert.match(soaPage, /soa-account-identity/);
  assert.match(soaPage, /label="Homeowner" value=\{soa\.homeowner\.user\.name\}/);
  assert.match(soaPage, /label="Account number" value=\{soa\.accountNumber\}/);
  assert.match(soaPage, /label="Property" value=\{propertyLabel\} note=\{soa\.homeowner\.address\}/);
  assert.match(soaPage, /label="Statement" value=\{soa\.statementCode\}/);
  assert.match(soaPage, /As of \$\{shortDate\(soa\.statementDate\)\}/);
});

test("print output is independent of disclosure state and excludes interactive controls", () => {
  assert.match(soaPage, /details\.soa-disclosure > \.soa-disclosure-content \{ display: block !important; \}/);
  assert.match(soaPage, /details\.soa-disclosure > summary \{ display: none !important; \}/);
  assert.match(soaPage, /className="print-hidden/);
  assert.match(soaPage, /homeowner-soa-print-table/);
  assert.match(aiShortcut, /className="print-hidden group fixed/);
});
