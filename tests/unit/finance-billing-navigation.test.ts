import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { Role } from "@prisma/client";
import { adminHomeForRole, canAccessAdminPath } from "@/lib/role-access";

test("finance navigation exposes billing management as a Finance-owned view", () => {
  const links = readFileSync(resolve(process.cwd(), "components/sidebar-links.ts"), "utf8");
  const financeBillingEntries = links.match(/href: "\/admin\/finance\/billing", label: "Billing Management", icon: "billing", section: "Finance"/g) ?? [];

  assert.equal(financeBillingEntries.length, 2);
});

test("billing managers keep their existing landing route and can access the Finance billing management view", () => {
  assert.equal(adminHomeForRole(Role.BILLING_MANAGER), "/admin/billing");
  assert.equal(canAccessAdminPath(Role.BILLING_MANAGER, "/admin/finance/billing"), true);
  assert.equal(canAccessAdminPath(Role.STAFF, "/admin/finance/billing"), false);
});

test("legacy billing route remains available while the Finance route reuses the same page", () => {
  const financeBillingPage = readFileSync(resolve(process.cwd(), "app/admin/finance/billing/page.tsx"), "utf8");

  assert.match(financeBillingPage, /export \{ default \} from "\.\.\/\.\.\/billing\/page";/);
  assert.equal(canAccessAdminPath(Role.BILLING_MANAGER, "/admin/billing"), true);
});
