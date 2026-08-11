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
  assert.match(links, /export const adminShellLinks/);
  assert.match(links, /label: "Payments"/);
  assert.match(links, /label: "Documents"/);
  assert.match(links, /section: "Insights & Data"/);
  assert.match(topbar, /Active tenant/);
  assert.match(topbar, /associationName/);
});

test("admin dashboard prioritizes actionable metrics without placeholder KPIs", async () => {
  const dashboard = await readFile("app/admin/dashboard/page.tsx", "utf8");

  assert.match(dashboard, /Executive snapshot/);
  assert.match(dashboard, /Finance overview/);
  assert.match(dashboard, /Needs attention/);
  assert.match(dashboard, /Quick actions/);
  assert.match(dashboard, /pendingPaymentRequests/);
  assert.match(dashboard, /pendingDocumentRequests/);
  assert.match(dashboard, /overdueHomeowners/);
  assert.doesNotMatch(dashboard, /Complaints workflow placeholder/);
  assert.doesNotMatch(dashboard, /Visitor module placeholder/);
});
