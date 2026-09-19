import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isSeasonalSantaWindow, seasonalSantaSessionKey, wasSeasonalSantaShownForLogin } from "../../lib/seasonal-santa";

test("seasonal Santa runs from September 1 through December 31 every year", () => {
  assert.equal(isSeasonalSantaWindow(new Date(2026, 7, 31, 23, 59)), false);
  assert.equal(isSeasonalSantaWindow(new Date(2026, 8, 1, 0, 0)), true);
  assert.equal(isSeasonalSantaWindow(new Date(2026, 11, 31, 23, 59)), true);
  assert.equal(isSeasonalSantaWindow(new Date(2027, 0, 1, 0, 0)), false);
});

test("seasonal greeting state is tenant-specific", () => {
  assert.notEqual(seasonalSantaSessionKey("tenant-a"), seasonalSantaSessionKey("tenant-b"));
});

test("shown state applies only to the exact login event", () => {
  assert.equal(wasSeasonalSantaShownForLogin("100", 100), true);
  assert.equal(wasSeasonalSantaShownForLogin("100", 101), false);
});

test("greeting uses server-provided brand and has session, accessibility, and safe fallback guards", () => {
  const source = readFileSync("components/seasonal-santa-greeting.tsx", "utf8");
  assert.match(source, /seasonalSantaSessionKey\(tenantId\)/);
  assert.match(source, /isSeasonalSantaWindow\(new Date\(\)\)/);
  assert.match(source, /const requestedLogo = logoUrl\?\.trim\(\) \|\| DEFAULT_LOGO/);
  assert.match(source, /const displayedLogo = logoFailed \? DEFAULT_LOGO : requestedLogo/);
  assert.match(source, /onError=\{\(\) =>/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-label="Close seasonal greeting"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /AUTO_DISMISS_MS = 6_500/);
  assert.match(source, /SEASONAL_SANTA_LOGIN_KEY/);
  assert.match(source, /SEASONAL_SANTA_LOGIN_COOKIE/);
  assert.match(source, /cookieLoginAt\(tenantId\)/);
  assert.match(source, /signalTenantId === tenantId/);
  assert.match(source, /handleDialogKeyDown/);
  assert.match(source, /closeButtonRef\.current\?\.focus\(\)/);

  const css = readFileSync("components/seasonal-santa-greeting.module.css", "utf8");
  assert.match(css, /width: min\(92vw, 24rem\)/);
  assert.match(css, /max-height: calc\(100dvh - 2rem\)/);
  assert.match(css, /font-size: clamp\(1\.4rem, 4\.8vw, 2rem\)/);
  assert.match(css, /text-wrap: balance/);
  assert.match(css, /@keyframes santaWalk/);
  assert.match(css, /@keyframes legLeft/);
  assert.match(css, /@keyframes legRight/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media print/);
});

test("animated Santa carries the authenticated tenant logo in a dedicated sack", () => {
  const source = readFileSync("components/seasonal-santa-greeting.tsx", "utf8");
  assert.match(source, /className=\{styles\.sack\}/);
  assert.match(source, /className=\{styles\.logoPlate\}/);
  assert.match(source, /src=\{displayedLogo\}/);
  assert.match(source, /className=\{styles\.legLeft\}/);
  assert.match(source, /className=\{styles\.legRight\}/);
});

test("homeowner and admin authenticated shells mount the tenant-scoped greeting", () => {
  const homeownerLayout = readFileSync("app/portal/layout.tsx", "utf8");
  const adminLayout = readFileSync("app/admin/layout.tsx", "utf8");
  for (const layout of [homeownerLayout, adminLayout]) {
    assert.match(layout, /<SeasonalSantaGreetingLoader tenantId=\{user\.tenantId\} associationName=\{association\.name\} logoUrl=\{association\.logoUrl\}/);
  }
});
