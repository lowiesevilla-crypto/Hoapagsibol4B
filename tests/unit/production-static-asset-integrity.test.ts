import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync("app/layout.tsx", "utf8");
const browserRecovery = readFileSync("components/browser-cache-recovery.tsx", "utf8");
const manifestWriter = readFileSync("scripts/write-deployment-assets.mjs", "utf8");
const productionVerifier = readFileSync("scripts/verify-production-assets.mjs", "utf8");
const workflow = readFileSync(".github/workflows/ci-deploy.yml", "utf8");

test("root layout installs a pre-runtime capture handler for missing Next static assets", () => {
  assert.ok(layout.includes('strategy="beforeInteractive"'));
  assert.ok(layout.includes("_next\\/static\\/(?:chunks|css)"));
  assert.ok(layout.includes('addEventListener("error", startRecovery, true)'));
  assert.ok(layout.includes("hoahub-pwa-shell-"));
  assert.ok(layout.includes("RECOVERY_COOLDOWN_MS"));
});

test("hydrated browser recovery also catches resource loading errors", () => {
  assert.ok(browserRecovery.includes("isFailedSameOriginNextStaticAssetEvent"));
  assert.ok(browserRecovery.includes("NEXT_STATIC_ASSET_PATH_PATTERN"));
  assert.ok(browserRecovery.includes('addEventListener("error", onError, true)'));
  assert.ok(browserRecovery.includes("next_static_resource_error"));
});

test("build publishes a release-bound inventory of generated JavaScript and CSS", () => {
  assert.ok(manifestWriter.includes(".next/static"));
  assert.ok(manifestWriter.includes("public/deployment-assets.json"));
  assert.ok(manifestWriter.includes("public/release.txt"));
  assert.ok(manifestWriter.includes("(?:js|css)"));
});

test("production verification checks release, deployment query, status, and MIME", () => {
  assert.ok(productionVerifier.includes("deployment-assets.json"));
  assert.ok(productionVerifier.includes("manifest?.release !== expectedRelease"));
  assert.ok(productionVerifier.includes('searchParams.set("dpl", expectedRelease)'));
  assert.ok(productionVerifier.includes('method: "HEAD"'));
  assert.ok(productionVerifier.includes("non-executable MIME type"));
  assert.ok(productionVerifier.includes("non-CSS MIME type"));
});

test("main production gate runs static asset integrity verification before health is accepted", () => {
  const assetGate = workflow.indexOf("Verify production Next.js static asset integrity");
  const healthGate = workflow.indexOf("Verify public production health");
  assert.ok(assetGate > 0, "production asset integrity gate must exist");
  assert.ok(healthGate > assetGate, "asset integrity must be verified before final health acceptance");
  assert.ok(workflow.includes("node scripts/verify-production-assets.mjs"));
});
