import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { rentalCollectionAccounting, summarizeRentalAllocations } from "../../lib/rental-accounting";

const workflow = readFileSync("lib/actions/rental-workflow.ts", "utf8");
const controls = readFileSync("components/rental-payment-workflow.tsx", "utf8");
const financialReport = readFileSync("lib/services/financial-report.ts", "utf8");

test("a 3000 rental payment recognizes 1000 rent and keeps 2000 as advance credit", () => {
  const accounting = rentalCollectionAccounting({ amount: 3000, rentAllocated: 1000, isRentalPayment: true });
  assert.equal(accounting.rentalIncome, 1000);
  assert.equal(accounting.advanceCredit, 2000);
  assert.equal(accounting.securityDeposit, 0);
  assert.equal(accounting.genericIncome, 0);
});

test("rental allocation summary keeps rent and security deposits separated", () => {
  const summary = summarizeRentalAllocations([
    { collectionId: "rent-receipt", amount: 1000, chargeType: "RENT" },
    { collectionId: "deposit-receipt", amount: 500, chargeType: "SECURITY_DEPOSIT" },
  ]);
  assert.equal(summary.rentTotal, 1000);
  assert.equal(summary.securityDepositTotal, 500);
  assert.equal(summary.rentByCollection.get("rent-receipt"), 1000);
  assert.equal(summary.securityDepositByCollection.get("deposit-receipt"), 500);
});

test("direct rental payments issue official collection receipts and preserve advance credit", () => {
  assert.match(workflow, /allocateReceiptNumber/);
  assert.match(workflow, /description: "Rental payment"/);
  assert.match(workflow, /allocationMode === "ADVANCE"/);
  assert.match(workflow, /strategy: "OLDEST_DUE_FIRST"/);
  assert.match(workflow, /i\.chargeType='RENT'/);
  assert.match(workflow, /collection\.refundable/);
  assert.match(controls, /Apply automatically/);
  assert.match(controls, /Record as advance payment/);
  assert.match(controls, /Auto reconcile credits/);
});

test("financial reporting treats rental advances and security deposits as liabilities, not revenue", () => {
  assert.match(financialReport, /rentalAdvanceCreditsReceived/);
  assert.match(financialReport, /rentalAdvanceCreditsHeld/);
  assert.match(financialReport, /rentalSecurityDepositsHeld/);
  assert.match(financialReport, /rentalIncome/);
  assert.match(financialReport, /description === "Rental payment"/);
});
