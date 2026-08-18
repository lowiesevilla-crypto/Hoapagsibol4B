import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssPath = new URL("../../app/canva-parity.css", import.meta.url);

test("Canva shell styling is scoped to the real application sidebar", async () => {
  const css = await readFile(cssPath, "utf8");

  assert.match(css, /\.canva-tenant-shell aside\.lg\\:fixed/);
  assert.match(css, /\.canva-platform-shell aside\.lg\\:fixed/);
  assert.match(css, /\.canva-portal-shell aside\.lg\\:fixed/);

  assert.doesNotMatch(css, /\.canva-tenant-shell aside\s*[,\{]/);
  assert.doesNotMatch(css, /\.canva-platform-shell aside\s*[,\{]/);
  assert.doesNotMatch(css, /\.canva-portal-shell aside\s*[,\{]/);
});

test("Only the navigation sidebar receives the forced 300px desktop width", async () => {
  const css = await readFile(cssPath, "utf8");
  const widthRule = css.match(/@media \(min-width: 1024px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.match(widthRule, /aside\.lg\\:fixed/);
  assert.doesNotMatch(widthRule, /\.canva-(?:tenant|platform|portal)-shell aside\s*[,\{]/);
});
