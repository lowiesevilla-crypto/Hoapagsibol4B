import assert from "node:assert/strict";
import test from "node:test";
import { TenantModule } from "@prisma/client";
import { moduleForPath } from "@/lib/module-routing";

test("all exposed tenant finance workspaces remain inside the BILLING plan capability", () => {
  for (const path of [
    "/admin/billing",
    "/admin/settings/billing-rules",
    "/admin/settings/billing-exemptions",
    "/admin/settings/payments",
    "/admin/payments/requests",
    "/admin/receipts",
    "/admin/collections",
    "/admin/rentals",
    "/admin/expenses",
    "/admin/data",
  ]) {
    assert.equal(moduleForPath(path), TenantModule.BILLING, path);
  }
});

test("workforce hub follows the PAYROLL plan capability", () => {
  assert.equal(moduleForPath("/admin/workforce"), TenantModule.PAYROLL);
  assert.equal(moduleForPath("/admin/employees"), TenantModule.PAYROLL);
  assert.equal(moduleForPath("/admin/payroll"), TenantModule.PAYROLL);
});

test("document request workflows remain governed by the DOCUMENTS plan capability", () => {
  assert.equal(moduleForPath("/admin/documents"), TenantModule.DOCUMENTS);
  assert.equal(moduleForPath("/admin/document-templates"), TenantModule.DOCUMENTS);
});
