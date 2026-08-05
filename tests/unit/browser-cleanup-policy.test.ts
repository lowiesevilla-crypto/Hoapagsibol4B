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

test("critical browser suite preloads bounded context cleanup", () => {
  assert.match(
    packageJson.scripts["test:e2e"] || "",
    /^node --import \.\/tests\/e2e\/safe-browser-context-cleanup\.mjs tests\/e2e\/critical-path\.mjs/,
  );
  assert.match(cleanupSource, /context\.pages\(\)/);
  assert.match(cleanupSource, /page\.close\(\{ runBeforeUnload: false \}\)/);
  assert.match(cleanupSource, /browser\.process\(\)\?\.kill\("SIGKILL"\)/);
  assert.doesNotMatch(cleanupSource, /Target\.disposeBrowserContext|originalContextClose/);
});

test("browser cleanup limits do not change business assertion timeouts", () => {
  assert.match(cleanupSource, /const pageCloseTimeout = 5_000/);
  assert.match(cleanupSource, /const browserCloseTimeout = 15_000/);
  assert.doesNotMatch(cleanupSource, /setDefaultTimeout|waitForFunction|waitForNavigation/);
});
