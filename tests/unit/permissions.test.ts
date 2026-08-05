import assert from "node:assert/strict";
import { test } from "node:test";
import { Role } from "@prisma/client";
import {
  canUseAssignedRole,
  effectiveRolesForUser,
  primaryRoleForRoles,
  roleSnapshotForRoles,
} from "@/lib/authorization/effective-access";
import {
  defaultRolePermissions,
  hasPermission,
  Permission,
  permissionsForRoles,
} from "@/lib/authorization/permissions";

test("every role has an explicit default permission matrix entry", () => {
  assert.deepEqual(
    Object.keys(defaultRolePermissions).sort(),
    Object.values(Role).sort(),
  );
});

test("active assignments replace the legacy role as the authority source", () => {
  const roles = effectiveRolesForUser(Role.STAFF, [
    { role: Role.BILLING_MANAGER, active: true },
    { role: Role.PAYROLL_MANAGER, active: true },
    { role: Role.STAFF, active: false },
  ]);
  assert.deepEqual(roles, [Role.BILLING_MANAGER, Role.PAYROLL_MANAGER].sort());
  assert.equal(hasPermission(roles, Permission.BILLING_MANAGE), true);
  assert.equal(hasPermission(roles, Permission.PAYROLL_MANAGE), true);
  assert.equal(hasPermission(roles, Permission.DOCUMENTS_MANAGE), false);
});

test("legacy role remains a compatibility fallback only when assignments are absent", () => {
  assert.deepEqual(effectiveRolesForUser(Role.HOMEOWNER, []), [Role.HOMEOWNER]);
  assert.deepEqual(effectiveRolesForUser(Role.EMPLOYEE, undefined), [Role.EMPLOYEE]);
});

test("multiple roles produce the union of granular permissions", () => {
  const permissions = permissionsForRoles([Role.BILLING_MANAGER, Role.STAFF]);
  assert.equal(permissions.has(Permission.BILLING_MANAGE), true);
  assert.equal(permissions.has(Permission.DOCUMENTS_MANAGE), true);
  assert.equal(permissions.has(Permission.PAYROLL_MANAGE), false);
});

test("content publication and billing reminder permissions remain separated", () => {
  const staffPermissions = permissionsForRoles([Role.STAFF]);
  const billingPermissions = permissionsForRoles([Role.BILLING_MANAGER]);
  const combinedPermissions = permissionsForRoles([Role.STAFF, Role.BILLING_MANAGER]);

  assert.equal(staffPermissions.has(Permission.ANNOUNCEMENTS_PUBLISH), true);
  assert.equal(staffPermissions.has(Permission.COMMUNITY_MANAGE), true);
  assert.equal(staffPermissions.has(Permission.BILLING_MANAGE), false);
  assert.equal(billingPermissions.has(Permission.BILLING_MANAGE), true);
  assert.equal(billingPermissions.has(Permission.ANNOUNCEMENTS_PUBLISH), false);
  assert.equal(billingPermissions.has(Permission.COMMUNITY_MANAGE), false);
  assert.equal(combinedPermissions.has(Permission.ANNOUNCEMENTS_PUBLISH), true);
  assert.equal(combinedPermissions.has(Permission.COMMUNITY_MANAGE), true);
  assert.equal(combinedPermissions.has(Permission.BILLING_MANAGE), true);
});

test("role compatibility checks operate over all assignments", () => {
  assert.equal(canUseAssignedRole([Role.BILLING_MANAGER, Role.HOMEOWNER], Role.ADMIN), true);
  assert.equal(canUseAssignedRole([Role.BILLING_MANAGER, Role.HOMEOWNER], Role.HOMEOWNER), true);
  assert.equal(canUseAssignedRole([Role.BILLING_MANAGER], Role.PAYROLL_MANAGER), false);
});

test("role snapshots are stable regardless of assignment order or duplicates", () => {
  const left = roleSnapshotForRoles([Role.STAFF, Role.BILLING_MANAGER, Role.STAFF]);
  const right = roleSnapshotForRoles([Role.BILLING_MANAGER, Role.STAFF]);
  assert.equal(left, right);
});

test("primary role prefers an assigned legacy role and otherwise uses safe priority", () => {
  assert.equal(
    primaryRoleForRoles([Role.BILLING_MANAGER, Role.PAYROLL_MANAGER], Role.PAYROLL_MANAGER),
    Role.PAYROLL_MANAGER,
  );
  assert.equal(
    primaryRoleForRoles([Role.STAFF, Role.BILLING_MANAGER], Role.HOMEOWNER),
    Role.BILLING_MANAGER,
  );
});
