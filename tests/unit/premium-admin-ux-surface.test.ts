import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin shell uses consolidated navigation and explicit tenant context", async () => {
  const [layout, links, topbar] = await Promise.all([
    readFile("app/admin/layout.tsx", "utf8"),
    readFile("components/sidebar-links.ts", "utf8"),
    readFile("components/admin-topbar.tsx", "utf8"),
  ]);

  assert.match(layout, /adminShellLinks/);
  assert.match(layout, /systemAdminShellLinks/);
  assert.match(layout, /<AdminTopbar/);
  assert.match(layout, /requestBadgeHref = "\/admin\/documents"/);
  assert.match(layout, /canva-tenant-shell/);
  assert.match(links, /export const adminShellLinks/);
  assert.match(links, /label: "Payments"/);
  assert.match(links, /label: "Documents"/);
  assert.match(links, /section: "Insights & Data"/);
  assert.match(topbar, /Active tenant/);
  assert.match(topbar, /associationName/);
  assert.match(topbar, /ShellCommandSearch scope="admin"/);
  assert.match(topbar, /Quick create/);
});

test("admin dashboard follows the approved Canva operational composition without placeholder KPIs", async () => {
  const dashboard = await readFile("app/admin/dashboard/page.tsx", "utf8");

  assert.match(dashboard, /Executive snapshot/);
  assert.match(dashboard, /Financial pulse/);
  assert.match(dashboard, /HOAHub Intelligence · Live/);
  assert.match(dashboard, /Action Center/);
  assert.match(dashboard, /Today at a glance/);
  assert.match(dashboard, /pendingPaymentRequests/);
  assert.match(dashboard, /pendingDocumentRequests/);
  assert.match(dashboard, /overdueHomeowners/);
  assert.match(dashboard, /previousMonthCollected/);
  assert.doesNotMatch(dashboard, /Complaints workflow placeholder/);
  assert.doesNotMatch(dashboard, /Visitor module placeholder/);
  assert.doesNotMatch(dashboard, /₱428K|₱81\.4K|786\s*active homeowners/);
});
