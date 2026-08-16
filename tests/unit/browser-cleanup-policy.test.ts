import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};
const cleanupSource = readFileSync(
  "tests/e2e/safe-browser-context-cleanup.mjs",
  "utf8",
);
const criticalPathSource = readFileSync("tests/e2e/critical-path.mjs", "utf8");
const criticalPathRunnerSource = readFileSync(
  "tests/e2e/run-critical-path.mjs",
  "utf8",
);
const documentWorkflowSource = readFileSync(
  "tests/e2e/document-workflow.mjs",
  "utf8",
);
const workflowSource = readFileSync(".github/workflows/ci-deploy.yml", "utf8");
const homeownerDashboardSource = readFileSync(
  "app/portal/dashboard/page.tsx",
  "utf8",
);

test("all browser E2E entry points use bounded safe browser isolation", () => {
  const command = packageJson.scripts["test:e2e"] || "";
  assert.match(command, /^node tests\/e2e\/run-critical-path\.mjs/);
  for (const script of [
    "onboarding-workflow.mjs",
    "document-workflow.mjs",
    "document-management.mjs",
    "rbac-stale-session.mjs",
    "ai-assistant.mjs",
  ]) {
    assert.match(
      command,
      new RegExp(`node --import \\.\\/tests\\/e2e\\/safe-browser-context-cleanup\\.mjs tests\\/e2e\\/${script.replace(".", "\\.")}`),
    );
  }
  assert.match(
    criticalPathRunnerSource,
    /"--import", "\.\/tests\/e2e\/safe-browser-context-cleanup\.mjs", "tests\/e2e\/critical-path\.mjs"/,
  );
});

test("controlled Chromium uses headless-shell launch and process-level context isolation", () => {
  assert.match(criticalPathSource, /const headlessMode = "shell"/);
  assert.match(criticalPathSource, /puppeteer\.defaultArgs\(\{ args: chromium\.args, headless: headlessMode \}\)/);
  assert.match(cleanupSource, /const isolatedBrowsers = new Set\(\)/);
  assert.match(cleanupSource, /const isolatedBrowser = await originalLaunch\(\.\.\.launchArguments\)/);
  assert.match(cleanupSource, /isolatedBrowser\.defaultBrowserContext\(\)/);
  assert.doesNotMatch(cleanupSource, /originalCreateBrowserContext/);
  assert.match(cleanupSource, /context\.pages\(\)/);
  assert.match(cleanupSource, /page\.close\(\{ runBeforeUnload: false \}\)/);
  assert.match(cleanupSource, /browser\.process\(\)\?\.kill\("SIGKILL"\)/);
});

test("CI prepares the repository-controlled Chromium executable without changing production deployment activation", () => {
  assert.match(workflowSource, /Prepare controlled Chromium for browser suites/);
  assert.match(workflowSource, /chromium\.executablePath\(\)/);
  assert.match(workflowSource, /PUPPETEER_EXECUTABLE_PATH=\$CHROMIUM_PATH/);
  assert.match(workflowSource, /Wait for Hostinger GitHub auto-deployment/);
  assert.match(workflowSource, /Verify public production health/);
  assert.doesNotMatch(workflowSource, /Verify production login motion/);
});

test("critical browser startup retry is bounded and does not retry business assertion failures", () => {
  assert.match(criticalPathRunnerSource, /const maxAttempts = 3/);
  assert.match(criticalPathRunnerSource, /const retryMarker = "Target\.setDiscoverTargets"/);
  assert.match(criticalPathRunnerSource, /const targetClosedMarker = "Target closed"/);
  assert.match(
    criticalPathRunnerSource,
    /result\.output\.includes\(retryMarker\) && result\.output\.includes\(targetClosedMarker\)/,
  );
  assert.match(
    criticalPathRunnerSource,
    /if \(!transientStartupClosure \|\| attempt === maxAttempts\)/,
  );
});

test("browser cleanup limits do not change business assertion timeouts", () => {
  assert.match(cleanupSource, /const pageCloseTimeout = 5_000/);
  assert.match(cleanupSource, /const browserCloseTimeout = 15_000/);
  assert.doesNotMatch(cleanupSource, /setDefaultTimeout|waitForFunction|waitForNavigation/);
});

test("document workflow waits for the client submission handoff before clicking", () => {
  assert.match(documentWorkflowSource, /input\[name=['"]submissionKey['"]\]/);
  assert.match(documentWorkflowSource, /submissionKey\.value/);
  assert.match(documentWorkflowSource, /button\.matches\(["']:disabled["']\)/);
  assert.match(documentWorkflowSource, /\[role=['"]status['"]\], \[role=['"]alert['"]\]/);
  assert.match(documentWorkflowSource, /Document request submitted/);
  assert.match(documentWorkflowSource, /const timeout = 45_000/);
});

test("homeowner dashboard render remains read-only", () => {
  assert.match(homeownerDashboardSource, /requireHomeownerProfile/);
  assert.match(homeownerDashboardSource, /getStatementOfAccount/);
  assert.doesNotMatch(homeownerDashboardSource, /refreshOverdueBills/);
  assert.doesNotMatch(homeownerDashboardSource, /prisma\.(bill|payment|collection)\.(update|updateMany|create|delete)/);
});