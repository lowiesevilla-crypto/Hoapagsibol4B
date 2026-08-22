import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { recognizedCollectionAmount, summarizeRentalSecurityDeposits } from "../../lib/rental-accounting";

const actions = readFileSync("lib/actions/rentals.ts", "utf8");
const page = readFileSync("app/admin/rentals/page.tsx", "utf8");
const migration = readFileSync("prisma/migrations/20260822071500_rental_management_mvp/migration.sql", "utf8");
const navigation = readFileSync("components/sidebar-links.ts", "utf8");
const exportRoute = readFileSync("app/admin/reports/export/route.ts", "utf8");
const financialReport = readFileSync("lib/services/financial-report.ts", "utf8");
const reportPage = readFileSync("app/admin/reports/page.tsx", "utf8");

test("rental domain keeps outsider renters separate from homeowner accounts", () => {
  assert.match(migration, /CREATE TABLE `Renter`/);
  assert.match(migration, /`homeownerId` VARCHAR\(191\) NULL/);
  assert.match(page, /Homeowner link \(optional\)/);
  assert.doesNotMatch(actions, /user\.create|homeownerProfile\.create/);
});

test("rental collections reconcile to invoices without duplicating cash", () => {
  assert.match(migration, /CREATE TABLE `RentalPaymentAllocation`/);
  assert.match(actions, /Only Other collection receipts can settle rental invoices/);
  assert.match(actions, /Allocation exceeds the rental invoice balance/);
  assert.match(actions, /Allocation exceeds the unallocated amount on this collection receipt/);
  assert.match(actions, /collection\.payerType === PayerType\.RENTER/);
  assert.match(actions, /collection\.payerType === PayerType\.HOMEOWNER/);
  assert.match(actions, /invoice\.chargeType === "SECURITY_DEPOSIT"/);
  assert.match(actions, /A refunded or forfeited receipt cannot be applied to a rental security deposit/);
  assert.match(actions, /Allocate the receipt's full unused amount when applying an income receipt to a rental security deposit/);
  assert.match(actions, /refundable=TRUE,refundStatus='HELD',description='Rental security deposit'/);
  assert.match(actions, /A refundable rental security deposit receipt cannot be applied to rent income/);
  assert.match(exportRoute, /Refundable rental deposit liability/);
  assert.match(exportRoute, /Rental income/);
});

test("monthly invoice generation is idempotent and rental workspace is discoverable", () => {
  assert.match(migration, /RentalInvoice_tenantId_agreementId_chargeType_periodStart_key/);
  assert.match(actions, /INSERT IGNORE INTO RentalInvoice/);
  assert.match(actions, /GENERATE_RENTAL_INVOICES/);
  assert.match(navigation, /href: "\/admin\/rentals"/);
  assert.match(page, /Rental Management/);
  assert.match(page, /Generate monthly rent/);
  assert.match(page, /Invoices & payment reconciliation/);
});

test("rental finance writes remain explicitly tenant scoped and audited", () => {
  assert.match(actions, /requirePermission\(Permission\.BILLING_MANAGE\)/);
  assert.match(actions, /tenantId=\$\{admin\.tenantId\}/);
  assert.match(actions, /module: "RENTALS"/);
  assert.match(actions, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(migration, /UNIQUE INDEX `RentalAsset_tenantId_code_key`/);
});

test("rental deposits stay out of recognized income while remaining cash receipts", () => {
  const summary = summarizeRentalSecurityDeposits([
    { collectionId: "receipt-1", amount: 200, chargeType: "SECURITY_DEPOSIT" },
    { collectionId: "receipt-1", amount: 300, chargeType: "RENT" },
    { collectionId: "receipt-2", amount: 50, chargeType: "SECURITY_DEPOSIT" },
  ]);
  assert.equal(summary.total, 250);
  assert.equal(summary.byCollection.get("receipt-1"), 200);
  assert.equal(recognizedCollectionAmount(500, summary.byCollection.get("receipt-1") ?? 0), 300);
  assert.equal(recognizedCollectionAmount(200, 200), 0);
  assert.match(financialReport, /rentalSecurityDepositsReceived/);
  assert.match(reportPage, /Rental security deposits received \(liability\)/);
});

test("rental homeowner and receipt selectors are searchable at client scale", () => {
  assert.match(page, /SearchableHomeownerSelect name="homeownerId"/);
  assert.match(page, /searchEndpoint="\/api\/admin\/homeowners\/search"/);
  assert.match(page, /Search homeowner name, block, lot, account, or email/);
  assert.match(page, /SearchableSelect name="collectionId"/);
  assert.match(page, /Search receipt number, renter or amount/);
  assert.match(page, /LIMIT 5000/);
  assert.match(page, /collection\.payerType === "RENTER"/);
  assert.match(page, /collection\.payerType !== "HOMEOWNER"/);
});
