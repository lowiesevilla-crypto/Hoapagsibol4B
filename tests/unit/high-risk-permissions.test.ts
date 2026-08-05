import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Role } from "@prisma/client";
import {
  hasEveryPermission,
  hasPermission,
  Permission,
  permissionsForRoles,
} from "@/lib/authorization/permissions";

test("billing managers receive finance operations without tenant administration", () => {
  const roles = [Role.BILLING_MANAGER];
  assert.equal(hasEveryPermission(roles, [
    Permission.BILLING_CONFIGURE,
    Permission.BILLING_GENERATE,
    Permission.BILLING_ADJUST,
    Permission.PAYMENTS_RECORD,
    Permission.PAYMENTS_ALLOCATE,
    Permission.PAYMENTS_VOID,
    Permission.PAYMENTS_REFUND,
    Permission.COLLECTIONS_RECORD,
    Permission.COLLECTIONS_REFUND,
    Permission.COLLECTIONS_FORFEIT,
    Permission.RECEIPTS_ISSUE,
    Permission.REPORTS_FINANCIAL,
  ]), true);
  assert.equal(hasPermission(roles, Permission.SETTINGS_MANAGE), false);
  assert.equal(hasPermission(roles, Permission.USERS_MANAGE), false);
  assert.equal(hasPermission(roles, Permission.ROLES_MANAGE), false);
  assert.equal(hasPermission(roles, Permission.DOCUMENTS_APPROVE), false);
});

test("homeowner and staff assignments form an additive non-finance permission union", () => {
  const permissions = permissionsForRoles([Role.HOMEOWNER, Role.STAFF]);
  assert.equal(permissions.has(Permission.HOMEOWNER_PORTAL_ACCESS), true);
  assert.equal(permissions.has(Permission.DOCUMENTS_REQUEST), true);
  assert.equal(permissions.has(Permission.DOCUMENTS_APPROVE), true);
  assert.equal(permissions.has(Permission.ANNOUNCEMENTS_PUBLISH), true);
  assert.equal(permissions.has(Permission.BILLING_GENERATE), false);
  assert.equal(permissions.has(Permission.PAYMENTS_VOID), false);
  assert.equal(permissions.has(Permission.SETTINGS_MANAGE), false);
});

test("tenant administrators receive user, role, and audit authority without settings expansion", () => {
  for (const role of [Role.SYSTEM_ADMIN, Role.HOA_ADMIN, Role.ADMIN]) {
    assert.equal(hasEveryPermission([role], [
      Permission.USERS_MANAGE,
      Permission.ROLES_MANAGE,
      Permission.AUDIT_READ,
    ]), true, `${role} is missing a tenant administration permission`);
  }
  assert.equal(hasPermission([Role.SYSTEM_ADMIN], Permission.SETTINGS_MANAGE), true);
  assert.equal(hasPermission([Role.HOA_ADMIN], Permission.SETTINGS_MANAGE), false);
  assert.equal(hasPermission([Role.ADMIN], Permission.SETTINGS_MANAGE), false);
});

test("unrelated role combinations do not acquire high-risk finance authority", () => {
  const roles = [Role.PAYROLL_MANAGER, Role.HOMEOWNER];
  assert.equal(hasPermission(roles, Permission.PAYROLL_MANAGE), true);
  assert.equal(hasPermission(roles, Permission.HOMEOWNER_PORTAL_ACCESS), true);
  assert.equal(hasPermission(roles, Permission.BILLING_ADJUST), false);
  assert.equal(hasPermission(roles, Permission.PAYMENTS_RECORD), false);
  assert.equal(hasPermission(roles, Permission.COLLECTIONS_REFUND), false);
  assert.equal(hasPermission(roles, Permission.RECEIPTS_ISSUE), false);
});

test("billing generation uses its operation permission directly", () => {
  const source = readFileSync("lib/actions/billing.ts", "utf8");
  assert.match(
    source,
    /generateMonthlyBillsAction[\s\S]*?requirePermission\(Permission\.BILLING_GENERATE\)/,
  );
  assert.match(
    source,
    /generateBillingFromPreviewAction[\s\S]*?requirePermission\(Permission\.BILLING_GENERATE\)/,
  );
  assert.doesNotMatch(
    source,
    /requireBillingSettingsAccess\(Permission\.BILLING_GENERATE\)/,
  );
});

test("migrated sensitive actions no longer authorize through legacy administrator roles", () => {
  const migratedFiles = [
    "lib/actions/billing.ts",
    "lib/actions/collections.ts",
    "lib/actions/payment-requests.ts",
    "lib/actions/payments.ts",
    "lib/actions/settings.ts",
    "lib/actions/user-role-assignments.ts",
    "lib/billing-access.ts",
  ];
  for (const path of migratedFiles) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(
      source,
      /requireUser\(Role\.(ADMIN|SYSTEM_ADMIN)\)/,
      `${path} still contains a legacy high-risk role guard`,
    );
  }
});
