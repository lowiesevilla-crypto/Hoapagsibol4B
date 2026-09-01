import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const automaticBillingPath = new URL("../../lib/services/automatic-billing.ts", import.meta.url);
const billingRulesPath = new URL("../../lib/services/billing-rules.ts", import.meta.url);

test("automatic billing and downstream writes use explicit bounded batch sizes", async () => {
  const [automaticBilling, billingRules] = await Promise.all([
    readFile(automaticBillingPath, "utf8"),
    readFile(billingRulesPath, "utf8"),
  ]);
  assert.match(automaticBilling, /HOMEOWNER_BATCH_SIZE = 250/);
  assert.match(automaticBilling, /take: HOMEOWNER_BATCH_SIZE/);
  assert.match(automaticBilling, /cursor: \{ id: cursor \}, skip: 1/);
  assert.match(billingRules, /billingWriteBatchSize = 250/);
  assert.match(billingRules, /billingAuditBatchSize = 50/);
  assert.match(billingRules, /billingNotificationBatchSize = 50/);
});

test("one billing-row or notification failure is isolated and counted without undoing persisted bills", async () => {
  const billingRules = await readFile(billingRulesPath, "utf8");
  assert.match(billingRules, /createMany\([\s\S]*?skipDuplicates: true/);
  assert.match(billingRules, /persistBillingRowWithIsolation/);
  assert.match(billingRules, /catch \(error\) \{[\s\S]*?row\.action = "ERROR"/);
  assert.match(billingRules, /failedCount: rows\.filter\(\(row\) => row\.action === "ERROR"\)\.length/);
  assert.match(billingRules, /Billing persistence must not fail because an email provider is unavailable/);
});

test("automatic billing retry safety reconciles eligible homeowners and relies on tenant-period duplicate checks", async () => {
  const [automaticBilling, billingRules] = await Promise.all([
    readFile(automaticBillingPath, "utf8"),
    readFile(billingRulesPath, "utf8"),
  ]);
  assert.match(automaticBilling, /reconciliation: true/);
  assert.doesNotMatch(automaticBilling, /hasCompletedMonthlyDuesRun|already completed for this billing month/);
  assert.match(automaticBilling, /AUTOMATIC_MONTHLY_DUES_COMPLETED/);
  assert.match(billingRules, /tenantId: input\.actor\.tenantId, homeownerId: row\.homeownerId, recurringChargeType: RecurringChargeType\.MONTHLY_DUES, coverageYear: input\.coverageYear, coverageMonth: input\.coverageMonth/);
  assert.match(billingRules, /row\.action = "SKIP_DUPLICATE"/);
});
