import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Canva parity stylesheet locks the approved ecosystem palette", () => {
  const css = source("app/canva-parity.css");
  for (const color of ["#071f31", "#0b2e46", "#0b3a49", "#0b95d8", "#27b6ff", "#6ed64b", "#f3f8fb"]) {
    assert.ok(css.toLowerCase().includes(color), `Expected approved Canva color ${color}`);
  }
  assert.match(css, /width:\s*300px/);
  assert.match(css, /\.canva-platform-shell aside/);
  assert.match(css, /\.canva-tenant-shell aside/);
});

test("tenant command shell contains Canva navigation search and quick create", () => {
  const topbar = source("components/admin-topbar.tsx");
  const search = source("components/shell-command-search.tsx");
  const layout = source("app/admin/layout.tsx");
  assert.match(topbar, /ShellCommandSearch scope="admin"/);
  assert.match(topbar, /Quick create/);
  assert.match(topbar, /Record payment/);
  assert.match(search, /Search residents, payments, documents/);
  assert.match(layout, /canva-tenant-shell/);
  assert.match(layout, /lg:ml-\[300px\]/);
});

test("tenant dashboard follows approved Community Intelligence composition", () => {
  const dashboard = source("app/admin/dashboard/page.tsx");
  assert.match(dashboard, /Community Intelligence/);
  assert.match(dashboard, /Community Pulse/);
  assert.match(dashboard, /Financial pulse/);
  assert.match(dashboard, /HOAHub Intelligence · Live/);
  assert.match(dashboard, /Action Center/);
  assert.match(dashboard, /Today at a glance/);
  assert.match(dashboard, /previousMonthCollected/);
  assert.doesNotMatch(dashboard, /₱428K|₱81\.4K|786\s*active homeowners/);
});

test("platform command center is visually and operationally distinct", () => {
  const layout = source("app/platform/layout.tsx");
  const topbar = source("components/platform-topbar.tsx");
  const dashboard = source("app/platform/dashboard/page.tsx");
  assert.match(layout, /canva-platform-shell/);
  assert.match(layout, /lg:ml-\[300px\]/);
  assert.match(topbar, /bg-\[#071f31\]/);
  assert.match(topbar, /Onboard HOA/);
  assert.match(topbar, /Platform Mode/);
  assert.match(dashboard, /HOAHub Platform Command Center/);
  assert.match(dashboard, /Portfolio intelligence/);
  assert.match(dashboard, /Tenant health matrix/);
  assert.match(dashboard, /Requires attention/);
  assert.doesNotMatch(dashboard, /₱312K|99\.99%|99\.96%/);
});

test("executive metrics use restrained Canva cards rather than colored side strips", () => {
  const card = source("components/ui/metric-card.tsx");
  assert.match(card, /rounded-\[22px\]/);
  assert.match(card, /border-\[#dbe7ee\]/);
  assert.match(card, /shadow-\[0_8px_24px/);
  assert.doesNotMatch(card, /absolute inset-y-4 left-0 w-1/);
});

test("homeowner PWA shell uses the approved blue-teal mobile treatment", () => {
  const routeChrome = source("components/portal-mobile-route-chrome.tsx");
  const layout = source("app/portal/layout.tsx");
  assert.match(routeChrome, /linear-gradient\(150deg,#08324f,#0d6c83_68%,#1bb0d0\)/);
  assert.match(routeChrome, /rounded-\[22px\]/);
  assert.match(routeChrome, /Community Hub · Installed PWA ready/);
  assert.match(layout, /canva-portal-shell/);
  assert.match(layout, /lg:ml-\[300px\]/);
});
