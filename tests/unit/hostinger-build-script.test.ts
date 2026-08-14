import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

for (const scriptName of ["build", "hostinger:build", "hostinger:build:backfill"] as const) {
  test(`${scriptName} stamps releases without invoking nested pnpm`, () => {
    const command = packageJson.scripts[scriptName];
    assert.ok(command, `${scriptName} must exist`);
    assert.match(command, /node scripts\/write-release-id\.mjs/);
    assert.doesNotMatch(command, /(^|\s|&&|;)pnpm(\s|$)/);
  });
}
