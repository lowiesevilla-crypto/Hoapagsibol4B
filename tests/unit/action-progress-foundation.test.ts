import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createSubmissionLock } from "../../lib/action-progress/submission-lock";
import { isUxActionProgressEnabled, UX_ACTION_PROGRESS_FLAG } from "../../lib/feature-flags/ux-action-progress";

const target = { tenantId: "tenant-a", module: "BILLING", role: "BILLING_MANAGER" };

test("ux_action_progress_v1 is default-off and fails closed", () => {
  assert.equal(UX_ACTION_PROGRESS_FLAG, "ux_action_progress_v1");
  assert.equal(isUxActionProgressEnabled(target, {}), false);
  assert.equal(isUxActionProgressEnabled(target, { UX_ACTION_PROGRESS_V1_ENABLED: "true", UX_ACTION_PROGRESS_V1_TARGETS: "not-json" }), false);
  assert.equal(isUxActionProgressEnabled(target, { UX_ACTION_PROGRESS_V1_ENABLED: "false", UX_ACTION_PROGRESS_V1_TARGETS: '{"global":true}' }), false);
});

test("rollout targeting requires every configured tenant/module/role selector", () => {
  const environment = {
    UX_ACTION_PROGRESS_V1_ENABLED: "true",
    UX_ACTION_PROGRESS_V1_TARGETS: JSON.stringify({ tenantIds: ["tenant-a"], modules: ["BILLING"], roles: ["BILLING_MANAGER"] }),
  };
  assert.equal(isUxActionProgressEnabled(target, environment), true);
  assert.equal(isUxActionProgressEnabled({ ...target, tenantId: "tenant-b" }, environment), false);
  assert.equal(isUxActionProgressEnabled({ ...target, module: "DOCUMENTS" }, environment), false);
  assert.equal(isUxActionProgressEnabled({ ...target, role: "HOMEOWNER" }, environment), false);
});

test("a narrow ordered rule can disable a target while global rollout is active", () => {
  const environment = {
    UX_ACTION_PROGRESS_V1_ENABLED: "true",
    UX_ACTION_PROGRESS_V1_TARGETS: JSON.stringify({ global: true, rules: [{ tenantId: "tenant-a", module: "BILLING", enabled: false }] }),
  };
  assert.equal(isUxActionProgressEnabled(target, environment), false);
  assert.equal(isUxActionProgressEnabled({ ...target, tenantId: "tenant-b" }, environment), true);
});

test("submission lock accepts one in-flight entry and releases only explicitly", () => {
  const lock = createSubmissionLock();
  assert.equal(lock.acquire(), true);
  assert.equal(lock.acquire(), false);
  assert.equal(lock.isLocked(), true);
  lock.release();
  assert.equal(lock.acquire(), true);
});

test("shared component exposes truthful verified stages and accessibility behavior", () => {
  const component = readFileSync("components/action-progress-button.tsx", "utf8");
  const payment = readFileSync("components/record-payment-advance-form.tsx", "utf8");
  const billing = readFileSync("app/admin/billing/page.tsx", "utf8");
  const billingProgress = readFileSync("components/billing-generation-progress-form.tsx", "utf8");
  const billingActions = readFileSync("lib/actions/billing.ts", "utf8");
  assert.match(component, /pending \? 50 : accepted \? 25 : 0/);
  assert.match(component, /confirmedProcessing \? 75/);
  assert.match(component, /success \? 100/);
  assert.match(component, /aria-busy/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /motion-reduce:animate-none/);
  assert.match(payment, /pendingLabel="Recording payment"/);
  assert.match(billing, /BillingGenerationProgressForm/);
  assert.match(billing, /key=\{billingGenerationProgressKey\(input\)\}/);
  assert.match(billingProgress, /pendingLabel="Generating billing"/);
  assert.match(billingProgress, /success=\{actionProgressEnabled && state\.status === "success"\}/);
  assert.match(billingActions, /generateBillingFromPreviewProgressAction/);
  assert.match(billingActions, /requireActionProgressFlag/);
  assert.match(billingActions, /if \(isNextRedirectError\(error\)\) throw error/);
  assert.match(billingActions, /TenantModule\.BILLING/);
  assert.match(billingActions, /duplicateCount: result\.duplicateCount/);
});
