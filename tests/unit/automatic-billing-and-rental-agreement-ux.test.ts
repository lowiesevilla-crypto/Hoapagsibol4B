import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const servicePath = new URL("../../lib/services/automatic-billing.ts", import.meta.url);
const monthlyCronPath = new URL("../../app/api/cron/monthly-dues/route.ts", import.meta.url);
const dailyCronPath = new URL("../../app/api/cron/daily/route.ts", import.meta.url);
const billingSettingsPath = new URL("../../app/admin/settings/billing-rules/page.tsx", import.meta.url);
const automationTogglePath = new URL("../../components/billing-automation-toggle.tsx", import.meta.url);
const rentalActionsPath = new URL("../../components/rental-record-actions.tsx", import.meta.url);
const agreementViewPath = new URL("../../app/admin/rentals/agreements/[id]/page.tsx", import.meta.url);

test("automatic billing is tenant scheduled, bounded for large homeowner populations, idempotent, reconciling, and Manila-calendar based", async () => {
  const [service, monthlyCron, dailyCron] = await Promise.all([
    readFile(servicePath, "utf8"),
    readFile(monthlyCronPath, "utf8"),
    readFile(dailyCronPath, "utf8"),
  ]);
  assert.match(service, /HOMEOWNER_BATCH_SIZE = 250/);
  assert.match(service, /generationMode === BillingGenerationMode\.AUTOMATIC/);
  assert.match(service, /clock\.day >= rule\.billingDay/);
  assert.match(service, /timeZone: "Asia\/Manila"/);
  assert.match(service, /scope: "SELECTED", homeownerIds/);
  assert.match(service, /AUTOMATIC_MONTHLY_DUES_COMPLETED/);
  assert.match(service, /reconciliation: true/);
  assert.doesNotMatch(service, /hasCompletedMonthlyDuesRun|already completed for this billing month/);
  assert.match(service, /INSERT IGNORE INTO RentalInvoice/);
  assert.match(service, /a\.billingDay<=\$\{currentDay\}/);
  assert.match(service, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(service, /description='Rental payment'/);
  assert.match(monthlyCron, /runAutomaticBillingForTenant/);
  assert.match(dailyCron, /runAutomaticBillingForTenant/);
});

test("tenant billing settings use the Manila period and keep the automatic editor synchronized", async () => {
  const [page, toggle] = await Promise.all([readFile(billingSettingsPath, "utf8"), readFile(automationTogglePath, "utf8")]);
  assert.match(page, /BillingAutomationToggle/);
  assert.match(page, /getManilaClock\(\)/);
  assert.match(page, /currentPeriod\.year, currentPeriod\.month/);
  assert.match(page, /key=\{editRule\?\.id \?\? "new"\}/);
  assert.doesNotMatch(page, /today\.getUTCFullYear|today\.getUTCMonth/);
  assert.doesNotMatch(page, /scheduler deferred|Phase 2\.2B/i);
  assert.match(toggle, /role="switch"/);
  assert.match(toggle, /name="generationMode"/);
  assert.match(toggle, /name="billingDay"/);
  assert.match(toggle, /useEffect/);
  assert.match(toggle, /setAutomatic\(defaultAutomatic\)/);
  assert.match(toggle, /setBillingDay\(String\(defaultBillingDay\)\)/);
  assert.match(toggle, /value=\{billingDay\}/);
  assert.match(toggle, /Active rental agreements are also billed automatically/);
});

test("rental agreement list uses a focused detail view instead of inline table editing", async () => {
  const [actions, detail] = await Promise.all([readFile(rentalActionsPath, "utf8"), readFile(agreementViewPath, "utf8")]);
  const agreementActions = actions.slice(actions.indexOf("export function RentalAgreementActions"));
  assert.match(agreementActions, /\/admin\/rentals\/agreements\/\$\{agreement\.id\}/);
  assert.doesNotMatch(agreementActions, /<details>|updateRentalAgreementAction|endRentalAgreementAction/);
  assert.match(detail, /Edit agreement/);
  assert.match(detail, /updateRentalAgreementAction/);
  assert.match(detail, /endRentalAgreementAction/);
  assert.match(detail, /deleteRentalAgreementAction/);
  assert.match(detail, /Automatic rent billing uses this day each month/);
});
