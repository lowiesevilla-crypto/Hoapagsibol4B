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
const criticalPathRunnerSource = readFileSync(
  "tests/e2e/run-critical-path.mjs",
  "utf8",
);
const ciWorkflowSource = readFileSync(
  ".github/workflows/ci-deploy.yml",
  "utf8",
);
const homeownerDashboardSource = readFileSync(
  "app/portal/dashboard/page.tsx",
  "utf8",
);

test("critical browser suite preloads bounded context cleanup", () => {
  assert.match(
    packageJson.scripts["test:e2e"] || "",
    /^node tests\/e2e\/run-critical-path\.mjs/,
  );
  assert.match(
    criticalPathRunnerSource,
    /"--import", "\.\/tests\/e2e\/safe-browser-context-cleanup\.mjs", "tests\/e2e\/critical-path\.mjs"/,
  );
  assert.match(cleanupSource, /context\.pages\(\)/);
  assert.match(cleanupSource, /page\.close\(\{ runBeforeUnload: false \}\)/);
  assert.match(cleanupSource, /browser\.process\(\)\?\.kill\("SIGKILL"\)/);
  assert.doesNotMatch(cleanupSource, /Target\.disposeBrowserContext|originalContextClose/);
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

test("CI pins browser verification to the repository-controlled Chromium executable", () => {
  const prepareIndex = ciWorkflowSource.indexOf("Prepare controlled Chromium for browser suites");
  const browserIndex = ciWorkflowSource.indexOf("Production smoke and critical browser suite");

  assert.ok(prepareIndex >= 0, "CI must prepare the repository-controlled Chromium runtime");
  assert.ok(browserIndex > prepareIndex, "controlled Chromium must be exported before the browser suite starts");
  assert.match(ciWorkflowSource, /import chromium from "@sparticuz\/chromium"/);
  assert.match(ciWorkflowSource, /PUPPETEER_EXECUTABLE_PATH=\$CHROMIUM_PATH/);
  assert.match(ciWorkflowSource, />> "\$GITHUB_ENV"/);
});

test("browser cleanup limits do not change business assertion timeouts", () => {
  assert.match(cleanupSource, /const pageCloseTimeout = 5_000/);
  assert.match(cleanupSource, /const browserCloseTimeout = 15_000/);
  assert.doesNotMatch(cleanupSource, /setDefaultTimeout|waitForFunction|waitForNavigation/);
});

test("homeowner dashboard render remains read-only", () => {
  assert.match(homeownerDashboardSource, /requireHomeownerProfile/);
  assert.match(homeownerDashboardSource, /getStatementOfAccount/);
  assert.doesNotMatch(homeownerDashboardSource, /refreshOverdueBills/);
  assert.doesNotMatch(homeownerDashboardSource, /prisma\.(bill|payment|collection)\.(update|updateMany|create|delete)/);
});
