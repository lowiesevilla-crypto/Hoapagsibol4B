import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync("app/admin/rentals/page.tsx", "utf8");
const paymentControls = readFileSync("components/rental-payment-workflow.tsx", "utf8");

test("rental management is organized around the approved operational workflow", () => {
  for (const section of ["Overview", "Assets", "Renters", "Agreements", "Billing", "Payments", "Reconciliation"]) {
    assert.ok(page.includes(`label: "${section}"`), `missing Rental Management section: ${section}`);
  }
  assert.match(page, /Step 1/);
  assert.match(page, /Step 6/);
  assert.match(page, /One workspace for rental assets, renters, agreements, billing, payments and reconciliation/);
});

test("asset and renter masters remain searchable and operationally clear", () => {
  assert.match(page, /Search asset code, name, type or location/);
  assert.match(page, /Search renter, homeowner, asset or status/);
  assert.match(page, /Homeowner link \(optional\)/);
  assert.match(page, /Homeowner/);
  assert.match(page, /External/);
  assert.match(page, /Current asset/);
  assert.match(page, /Outstanding/);
  assert.match(page, /Advance credit/);
});

test("agreement workflow explicitly supports fixed and open contracts", () => {
  assert.match(page, /Create rental agreement/);
  assert.match(page, /Open Contract/);
  assert.match(page, /Leave End date blank/);
  assert.match(page, /Fixed term/);
  assert.match(page, /One active agreement may occupy an asset at a time/);
});

test("billing payments and reconciliation are separated without duplicating cash", () => {
  assert.match(page, /Generate monthly rent/);
  assert.match(page, /Rental billing register/);
  assert.match(page, /Record rental payment/);
  assert.match(page, /Unapplied rental receipt balances/);
  assert.match(page, /Invoices & payment reconciliation/);
  assert.match(page, /Apply existing receipt/);
  assert.match(page, /Matched · reconciled/);
  assert.match(paymentControls, /official HOAHub receipt/);
  assert.match(paymentControls, /Record as advance payment/);
  assert.match(paymentControls, /Auto reconcile credits/);
});
