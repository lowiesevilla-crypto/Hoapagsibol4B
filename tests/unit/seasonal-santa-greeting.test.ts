import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isSeasonalSantaWindow, seasonalSantaSessionKey } from "../../lib/seasonal-santa";

test("seasonal Santa runs from September 1 through December 31 every year", () => {
  assert.equal(isSeasonalSantaWindow(new Date(2026, 7, 31, 23, 59)), false);
  assert.equal(isSeasonalSantaWindow(new Date(2026, 8, 1, 0, 0)), true);
  assert.equal(isSeasonalSantaWindow(new Date(2026, 11, 31, 23, 59)), true);
  assert.equal(isSeasonalSantaWindow(new Date(2027, 0, 1, 0, 0)), false);
});

test("seasonal greeting state is tenant-specific", () => {
  assert.notEqual(seasonalSantaSessionKey("tenant-a"), seasonalSantaSessionKey("tenant-b"));
});

test("greeting uses server-provided brand and has session, accessibility, and safe fallback guards", () => {
  const source = readFileSync("components/seasonal-santa-greeting.tsx", "utf8");
  assert.match(source, /seasonalSantaSessionKey\(tenantId\)/);
  assert.match(source, /isSeasonalSantaWindow\(new Date\(\)\)/);
  assert.match(source, /logoUrl\?\.trim\(\) \|\| "\/Hoahub-logo\.png"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-label="Close seasonal greeting"/);
  assert.match(source, /AUTO_DISMISS_MS = 6_500/);
});
