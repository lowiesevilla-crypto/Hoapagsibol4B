import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("semantic HOAHub UI tokens extend the existing brand palette", () => {
  const tailwind = source("tailwind.config.ts");
  assert.match(tailwind, /surface:\s*\{/);
  assert.match(tailwind, /status:\s*\{/);
  assert.match(tailwind, /platform:\s*\{/);
  assert.match(tailwind, /workspace:/);
  assert.match(tailwind, /pine:\s*\{/);
  assert.match(tailwind, /leaf:\s*\{/);
});

test("platform shell is branded as the HOAHub control plane, not a tenant", () => {
  const layout = source("app/platform/layout.tsx");
  const topbar = source("components/platform-topbar.tsx");

  assert.match(layout, /logoUrl: "\/Hoahub-logo\.png"/);
  assert.doesNotMatch(layout, /pagsibol-logo\.png/);
  assert.match(layout, /PlatformTopbar/);
  assert.match(topbar, /Platform Mode/);
  assert.match(topbar, /HOAHub SaaS Control Plane/);
});

test("platform navigation exposes the command center with separated taxonomy", () => {
  const links = source("components/sidebar-links.ts");
  assert.match(links, /href: "\/platform\/dashboard"/);
  assert.match(links, /section: "Customers"/);
  assert.match(links, /section: "Commercial"/);
  assert.match(links, /section: "Operations"/);
  assert.match(links, /section: "Governance"/);
});

test("platform dashboard uses the approved Canva command hero plus shared system primitives", () => {
  const dashboard = source("app/platform/dashboard/page.tsx");
  assert.match(dashboard, /canva-platform-hero/);
  assert.match(dashboard, /HOAHub Platform Command Center/);
  assert.match(dashboard, /MetricCard/);
  assert.match(dashboard, /WorkspaceCard/);
  assert.match(dashboard, /StatusBadge/);
  assert.doesNotMatch(dashboard, /PageHeader/);
});
