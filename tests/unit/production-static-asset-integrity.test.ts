import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync("app/layout.tsx", "utf8");
const browserRecovery = readFileSync("components/browser-cache-recovery.tsx", "utf8");
const manifestWriter = readFileSync("scripts/write-deployment-assets.mjs", "utf8");
const productionVerifier = readFileSync("scripts/verify-production-assets.mjs", "utf8");
const workflow = readFileSync(".github/workflows/ci-deploy.yml", "utf8");

test("root layout installs a pre-runtime capture handler for missing Next static assets", () => {
  assert.match(layout, /strategy="beforeInteractive"/);
  assert.match(layout, /_next\\\/static\\\/(?:chunks\|css)/);
  assert.match(layout, /addEventListener\("error", startRecovery, true\)/);
  assert.match(layout, /hoahub-pwa-shell-/);
  assert.match(layout, /RECOVERY_COOLDOWN_MS/);
});

test("hydrated browser recovery also catches resource loading errors", () => {
  assert.match(browserRecovery, /isFailedSameOriginNextStaticAssetEvent/);
  assert.match(browserRecovery, /NEXT_STATIC_ASSET_PATH_PATTERN/);
  assert.match(browserRecovery, /addEventListener\("error", onError, true\)/);
  assert.match(browserRecovery, /next_static_resource_error/);
});

test("build publishes a release-bound inventory of generated JavaScript and CSS", () => {
  assert.match(manifestWriter, /\.next\/static/);
  assert.match(manifestWriter, /public\/deployment-assets\.json/);
  assert.match(manifestWriter, /public\/release\.txt/);
  assert.match(manifestWriter, /\.js\|css/);
});

test("production verification checks release, deployment query, status, and MIME", () => {
  assert.match(productionVerifier, /deployment-assets\.json/);
  assert.match(productionVerifier, /manifest\?\.release !== expectedRelease/);
  assert.match(productionVerifier, /searchParams\.set\("dpl", expectedRelease\)/);
  assert.match(productionVerifier, /method: "HEAD"/);
  assert.match(productionVerifier, /non-executable MIME type/);
  assert.match(productionVerifier, /non-CSS MIME type/);
});

test("main production gate runs static asset integrity verification before health is accepted", () => {
  const assetGate = workflow.indexOf("Verify production Next.js static asset integrity");
  const healthGate = workflow.indexOf("Verify public production health");
  assert.ok(assetGate > 0, "production asset integrity gate must exist");
  assert.ok(healthGate > assetGate, "asset integrity must be verified before final health acceptance");
  assert.match(workflow, /node scripts\/verify-production-assets\.mjs/);
});
