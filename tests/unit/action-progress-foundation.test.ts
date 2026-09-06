import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createSubmissionLock } from "../../lib/action-progress/submission-lock";
import { isUxActionProgressEnabled, UX_ACTION_PROGRESS_FLAG } from "../../lib/feature-flags/ux-action-progress";

const target = { tenantId: "tenant-a", module: "BILLING", role: "BILLING_MANAGER" };

test("ux_action_progress_v1 preserves the existing default-off fail-closed rollout", () => {
  assert.equal(UX_ACTION_PROGRESS_FLAG, "ux_action_progress_v1");
  assert.equal(isUxActionProgressEnabled(target, {}), false);
  assert.equal(isUxActionProgressEnabled(target, { UX_ACTION_PROGRESS_V1_ENABLED: "true" }), false);
  assert.equal(isUxActionProgressEnabled(target, { UX_ACTION_PROGRESS_V1_ENABLED: "false", UX_ACTION_PROGRESS_V1_TARGETS: '{"global":true}' }), false);
  assert.equal(isUxActionProgressEnabled(target, { UX_ACTION_PROGRESS_V1_ENABLED: "true", UX_ACTION_PROGRESS_V1_TARGETS: "not-json" }), false);
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

test("a rule-only rollout stays closed for unmatched tenants", () => {
  const environment = {
    UX_ACTION_PROGRESS_V1_ENABLED: "true",
    UX_ACTION_PROGRESS_V1_TARGETS: JSON.stringify({ rules: [{ tenantId: "tenant-a", module: "BILLING", enabled: true }] }),
  };
  assert.equal(isUxActionProgressEnabled(target, environment), true);
  assert.equal(isUxActionProgressEnabled({ ...target, tenantId: "tenant-b" }, environment), false);
});

test("submission lock accepts one in-flight entry and releases only explicitly", () => {
  const lock = createSubmissionLock();
  assert.equal(lock.acquire(), true);
  assert.equal(lock.acquire(), false);
  assert.equal(lock.isLocked(), true);
  lock.release();
  assert.equal(lock.acquire(), true);
});

test("shared action progress is immediate even when advanced workflow progress is disabled", () => {
  const component = readFileSync("components/action-progress-button.tsx", "utf8");
  const ui = readFileSync("components/ui.tsx", "utf8");
  const payment = readFileSync("components/record-payment-advance-form.tsx", "utf8");
  const billing = readFileSync("app/admin/billing/page.tsx", "utf8");
  const billingProgress = readFileSync("components/billing-generation-progress-form.tsx", "utf8");
  const jobProgress = readFileSync("components/billing-generation-job-progress.tsx", "utf8");
  const billingActions = readFileSync("lib/actions/billing.ts", "utf8");
  const billingJobs = readFileSync("lib/services/billing-generation-jobs.ts", "utf8");
  const jobRoute = readFileSync("app/api/admin/billing/jobs/[jobId]/route.ts", "utf8");
  const retryRoute = readFileSync("app/api/admin/billing/jobs/[jobId]/retry/route.ts", "utf8");

  assert.match(component, /const advancedProcessing = enabled && confirmedProcessing/);
  assert.match(component, /const completed = enabled && success/);
  assert.match(component, /const processing = accepted \|\| pending \|\| advancedProcessing/);
  assert.match(component, /disabled=\{disabled \|\| accepted \|\| pending \|\| advancedProcessing \|\| completed\}/);
  assert.match(component, /window\.requestAnimationFrame\(\(\) => setAccepted\(true\)\)/);
  assert.match(component, /aria-busy/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /aria-atomic="true"/);
  assert.match(component, /motion-reduce:animate-none/);
  assert.doesNotMatch(component, /percentage/);
  assert.doesNotMatch(component, /100%|75%|50%|25%/);
  assert.match(ui, /actionProgress = true/);
  assert.match(ui, /pendingLabel = "Processing request"/);
  assert.match(payment, /const formAction = actionProgressEnabled \? progressAction : recordHomeownerPaymentAction/);
  assert.match(payment, /actionProgress=\{actionProgressEnabled\}/);
  assert.match(payment, /pendingLabel="Recording payment"/);
  assert.match(billing, /sendRemindersAction/);
  assert.match(billing, /<SubmitButton className="btn-secondary"><BellRing/);
  assert.match(billing, /BillingGenerationProgressForm/);
  assert.match(billing, /key=\{billingGenerationProgressKey\(input\)\}/);

  assert.match(billingProgress, /name="idempotencyKey"/);
  assert.match(billingProgress, /window\.crypto\.randomUUID\(\)/);
  assert.match(billingProgress, /pendingLabel=\{actionProgressEnabled \? "Starting billing job" : "Generating billing"\}/);
  assert.match(billingProgress, /confirmedProcessing=\{actionProgressEnabled && state\.status === "accepted"\}/);
  assert.match(billingProgress, /\/admin\/billing\/jobs\/\$\{encodeURIComponent\(state\.jobId\)\}/);

  assert.match(billingActions, /createBillingGenerationJob/);
  assert.match(billingActions, /processBillingGenerationJob/);
  assert.match(billingActions, /after\(async \(\) =>/);
  assert.match(billingActions, /if \(isNextRedirectError\(error\)\) throw error/);
  assert.match(billingActions, /TenantModule\.BILLING/);

  assert.match(billingJobs, /Math\.floor\(\(safeCompleted \/ total\) \* 100\)/);
  assert.match(billingJobs, /billingJobProcessBatchSize = 250/);
  assert.match(billingJobs, /idempotencyKeyHash/);
  assert.match(billingJobs, /BillingGenerationJobItemStatus\.FAILED/);
  assert.match(billingJobs, /retryFailedOnly/);
  assert.match(jobProgress, /job\.completed\.toLocaleString\(\)[\s\S]*job\.total\.toLocaleString\(\)/);
  assert.match(jobProgress, /No simulated time-based progress is used/);
  assert.match(jobProgress, /Retry creates a new job containing only failed homeowner records/);
  assert.match(jobRoute, /requirePermission\(Permission\.BILLING_GENERATE\)/);
  assert.match(jobRoute, /getBillingGenerationJobView\(jobId, admin\.tenantId\)/);
  assert.match(retryRoute, /createFailedBillingGenerationRetry/);
});

test("global navigation feedback covers internal links and GET queries without touching POST actions", () => {
  const navigation = readFileSync("components/navigation-progress.tsx", "utf8");
  const layout = readFileSync("app/layout.tsx", "utf8");
  const routeLoading = readFileSync("app/loading.tsx", "utf8");

  assert.match(layout, /<NavigationProgress \/>/);
  assert.match(navigation, /document\.addEventListener\("click", onClick, true\)/);
  assert.match(navigation, /document\.addEventListener\("submit", onSubmit, true\)/);
  assert.match(navigation, /toLowerCase\(\) !== "get"/);
  assert.match(navigation, /destination\.origin !== window\.location\.origin/);
  assert.match(navigation, /blockDuplicate\(event\)/);
  assert.match(navigation, /Opening \$\{readableLabel\}…/);
  assert.match(navigation, /Loading results…/);
  assert.match(navigation, /animate-spin/);
  assert.match(navigation, /aria-live="polite"/);
  assert.doesNotMatch(navigation, /%/);
  assert.match(routeLoading, /Loading HOAHub…/);
});
