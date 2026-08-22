import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const lock = readFileSync("components/billing-automation-form-lock.tsx", "utf8");
const scopeFields = readFileSync("components/billing-generation-scope-fields.tsx", "utf8");
const billForm = readFileSync("components/bill-form.tsx", "utf8");
const billingActions = readFileSync("lib/actions/billing.ts", "utf8");
const statusRoute = readFileSync("app/api/admin/billing/automation-status/route.ts", "utf8");

test("automatic billing locks both bulk and individual manual generation controls", () => {
  assert.match(scopeFields, /BillingAutomationFormLock scope="section" updateSectionDescription/);
  assert.match(billForm, /<BillingAutomationFormLock \/>/);
  assert.match(lock, /Automatic billing is ON · Manual generation disabled/);
  assert.match(lock, /Turn Automatic Billing OFF in Billing Rules before using manual generation/);
  assert.match(lock, /lockControls\(\)/);
  assert.match(lock, /blockSubmit/);
});

test("automatic billing status is tenant scoped and uses the effective monthly dues rule", () => {
  assert.match(statusRoute, /requirePermission\(Permission\.BILLING_GENERATE\)/);
  assert.match(statusRoute, /findEffectiveBillingRule\(user\.tenantId, RecurringChargeType\.MONTHLY_DUES/);
  assert.match(statusRoute, /BillingGenerationMode\.AUTOMATIC/);
  assert.match(statusRoute, /Asia\/Manila/);
});

test("server actions reject manual generation even if the disabled UI is bypassed", () => {
  assert.match(billingActions, /assertManualGenerationAllowed\(admin\.tenantId, period\.year, period\.month\)/);
  assert.match(billingActions, /assertManualGenerationAllowed\(admin\.tenantId, input\.coverageYear, input\.coverageMonth\)/);
  assert.match(billingActions, /generationMode !== "AUTOMATIC"/);
  assert.match(billingActions, /Manual billing generation is disabled to prevent duplicate or partial billing/);
});
