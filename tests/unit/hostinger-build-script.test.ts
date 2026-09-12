import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
};

test("Hostinger uses a hoisted dependency layout with pinned Next and React runtime versions", () => {
  assert.match(readFileSync(".npmrc", "utf8"), /^node-linker=hoisted\s*$/);
  assert.equal(packageJson.dependencies.next, "15.5.19");
  assert.equal(packageJson.dependencies.react, "19.2.7");
  assert.equal(packageJson.dependencies["react-dom"], "19.2.7");
});

for (const scriptName of ["build", "hostinger:build", "hostinger:build:backfill"] as const) {
  test(`${scriptName} stamps releases without invoking nested pnpm`, () => {
    const command = packageJson.scripts[scriptName];
    assert.ok(command, `${scriptName} must exist`);
    assert.match(command, /node scripts\/write-release-id\.mjs/);
    assert.doesNotMatch(command, /(^|\s|&&|;)pnpm(\s|$)/);
  });
}
