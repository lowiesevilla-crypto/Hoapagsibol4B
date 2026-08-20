import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin shell uses consolidated navigation, tenant context, and authorized full-route search", async () => {
  const [layout, links, topbar, commandSearch] = await Promise.all([
    readFile("app/admin/layout.tsx", "utf8"),
    readFile("components/sidebar-links.ts", "utf8"),
    readFile("components/admin-topbar.tsx", "utf8"),
    readFile("components/shell-command-search.tsx", "utf8"),
  ]);

  assert.match(layout, /adminShellLinks/);
  assert.match(layout, /systemAdminShellLinks/);
  assert.match(layout, /commandBaseLinks = isSystemAdmin \? systemAdminLinks : adminLinks/);
  assert.match(layout, /authorizedAdminLinks\(commandLinksWithPlatform\)/);
  assert.match(layout, /searchLinks=\{searchLinks\}/);
  assert.match(layout, /premium-admin-workspace/);
  assert.match(layout, /requestBadgeHref = "\/admin\/documents"/);
  assert.match(layout, /canva-tenant-shell/);
  assert.match(links, /export const adminShellLinks/);
  assert.match(links, /label: "Payments"/);
  assert.match(links, /label: "Documents"/);
  assert.match(links, /section: "Insights & Data"/);
  assert.match(topbar, /Active tenant/);
  assert.match(topbar, /associationName/);
  assert.match(topbar, /ShellCommandSearch scope="admin" destinations=\{searchLinks\}/);
  assert.match(topbar, /Quick create/);
  assert.match(commandSearch, /role="combobox"/);
  assert.match(commandSearch, /ArrowDown/);
  assert.match(commandSearch, /ArrowUp/);
  assert.match(commandSearch, /event\.key === "Enter"/);
  assert.match(commandSearch, /event\.key === "Escape"/);
  assert.match(commandSearch, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(commandSearch, /uniqueDestinations/);
});

test("legacy and new PageHeader imports resolve to one premium implementation", async () => {
  const [canonical, uiHeader] = await Promise.all([
    readFile("components/page-header.tsx", "utf8"),
    readFile("components/ui/page-header.tsx", "utf8"),
  ]);

  assert.match(canonical, /export type PageHeaderProps/);
  assert.match(canonical, /action\?: ReactNode/);
  assert.match(canonical, /actions\?: ReactNode/);
  assert.match(canonical, /context\?: ReactNode/);
  assert.match(canonical, /ui-page-header/);
  assert.match(uiHeader, /export \{ PageHeader \} from "@\/components\/page-header"/);
  assert.doesNotMatch(uiHeader, /<section/);
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
