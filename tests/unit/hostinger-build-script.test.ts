import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
};

const nextConfig = readFileSync("next.config.ts", "utf8");

test("Hostinger uses pinned Next and React runtime versions", () => {
  assert.equal(packageJson.dependencies.next, "15.5.19");
  assert.equal(packageJson.dependencies.react, "19.2.7");
  assert.equal(packageJson.dependencies["react-dom"], "19.2.7");
});

test("Hostinger runtime bundle preserves React DOM and generated Prisma files", () => {
  assert.match(nextConfig, /output:\s*["']standalone["']/);
  assert.match(nextConfig, /node_modules\/react-dom\/\*\*\/\*/);
  assert.match(nextConfig, /node_modules\/\.prisma\/client\/\*\*\/\*/);
  assert.match(nextConfig, /node_modules\/@prisma\/client\/\*\*\/\*/);
});

for (const scriptName of ["build", "hostinger:build", "hostinger:build:backfill"] as const) {
  test(`${scriptName} stamps releases without invoking nested pnpm`, () => {
    const command = packageJson.scripts[scriptName];
    assert.ok(command, `${scriptName} must exist`);
    assert.match(command, /node scripts\/write-release-id\.mjs/);
    assert.match(command, /next build && node scripts\/prepare-hostinger-standalone\.mjs/);
    assert.doesNotMatch(command, /(^|\s|&&|;)pnpm(\s|$)/);
  });
}
