import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/ci-deploy.yml", "utf8");
const productionSmoke = readFileSync("tests/e2e/production-login-motion.mjs", "utf8");

function indexOfOrThrow(source: string, needle: string) {
  const index = source.indexOf(needle);
  assert.notEqual(index, -1, `Expected to find ${needle}`);
  return index;
}

test("production login motion verification runs only after release and health checks", () => {
  const releaseIndex = indexOfOrThrow(workflow, "Wait for Hostinger GitHub auto-deployment");
  const healthIndex = indexOfOrThrow(workflow, "Verify public production health");
  const loginIndex = indexOfOrThrow(workflow, "Verify production login motion");

  assert.ok(releaseIndex < healthIndex, "release marker verification must precede health verification");
  assert.ok(healthIndex < loginIndex, "production login smoke must run only after public health passes");
});

test("workflow maps the configured production Environment secret names without logging values", () => {
  assert.match(workflow, /PROD_E2E_LOGIN:\s*\$\{\{ secrets\.E2E_PROD_LOGIN \}\}/);
  assert.match(workflow, /PROD_E2E_PASSWORD:\s*\$\{\{ secrets\.E2E_PROD_PASSWORD \}\}/);
  assert.equal(workflow.includes("echo \"$PROD_E2E_LOGIN\""), false);
  assert.equal(workflow.includes("echo \"$PROD_E2E_PASSWORD\""), false);
});

test("production login motion verification requires dedicated production credentials and checks both viewports", () => {
  for (const required of [
    "PROD_E2E_LOGIN",
    "PROD_E2E_PASSWORD",
    "desktop/web",
    "mobile/PWA viewport",
    "Verifying access…",
    "Access verified",
    "Opening your HOAHub dashboard…",
    'data-login-handoff="active"',
  ]) {
    assert.match(productionSmoke, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("production login verifier uses the shared safe default-context isolation runtime", () => {
  assert.match(productionSmoke, /import "\.\/safe-browser-context-cleanup\.mjs";/);
});

test("production login verifier uses the supported chrome-headless-shell launch contract", () => {
  assert.match(productionSmoke, /const headlessMode = "shell"/);
  assert.match(productionSmoke, /headless: headlessMode/);
  assert.match(
    productionSmoke,
    /args: await puppeteer\.defaultArgs\(\{ args: chromium\.args, headless: headlessMode \}\)/,
  );
  assert.doesNotMatch(productionSmoke, /headless: true/);
});

test("production login motion smoke does not navigate to business-operation routes", () => {
  for (const forbidden of [
    "/admin/payments",
    "/admin/billing",
    "/portal/pay",
    "/portal/documents",
    "/portal/complaints",
    "/api/",
  ]) {
    assert.equal(productionSmoke.includes(forbidden), false, `production login smoke must not access ${forbidden}`);
  }
});
