import assert from "node:assert/strict";
import { test } from "node:test";
import { Role } from "@prisma/client";
import {
  authorizationSnapshotForAccess,
  customPermissionsForAssignments,
  effectivePermissionsForAccess,
  normalizePermissionSelection,
  tenantAssignablePermissions,
} from "@/lib/authorization/custom-roles";
import { Permission } from "@/lib/authorization/permissions";

const billingRole = {
  active: true,
  role: {
    id: "role-billing",
    key: "billing-clerk",
    name: "Billing Clerk",
    active: true,
    updatedAt: new Date("2026-08-05T00:00:00.000Z"),
    permissions: [
      { permission: Permission.ADMIN_ACCESS },
      { permission: Permission.BILLING_READ },
      { permission: Permission.PAYMENTS_RECORD },
    ],
  },
};

test("custom role permissions are additive to system role permissions", () => {
  const effective = effectivePermissionsForAccess([Role.STAFF], [billingRole]);
  assert.equal(effective.has(Permission.DOCUMENTS_MANAGE), true);
  assert.equal(effective.has(Permission.BILLING_READ), true);
  assert.equal(effective.has(Permission.PAYMENTS_RECORD), true);
  assert.equal(effective.has(Permission.PAYMENTS_VOID), false);
});

test("inactive assignments and inactive custom roles grant no permissions", () => {
  const inactiveAssignment = { ...billingRole, active: false };
  const inactiveRole = { ...billingRole, role: { ...billingRole.role, active: false } };
  assert.deepEqual([...customPermissionsForAssignments([inactiveAssignment])], []);
  assert.deepEqual([...customPermissionsForAssignments([inactiveRole])], []);
});

test("tenant custom roles can never contain platform permissions", () => {
  assert.equal(tenantAssignablePermissions.includes(Permission.PLATFORM_ACCESS), false);
  assert.equal(tenantAssignablePermissions.includes(Permission.PLATFORM_TENANTS_MANAGE), false);
  assert.equal(tenantAssignablePermissions.includes(Permission.PLATFORM_USERS_MANAGE), false);
  assert.deepEqual(
    normalizePermissionSelection([
      Permission.PLATFORM_ACCESS,
      Permission.BILLING_READ,
      Permission.BILLING_READ,
    ]),
    [Permission.BILLING_READ],
  );
});

test("authorization snapshot changes when a custom role definition changes", () => {
  const before = authorizationSnapshotForAccess([Role.STAFF], [billingRole]);
  const after = authorizationSnapshotForAccess([Role.STAFF], [{
    ...billingRole,
    role: {
      ...billingRole.role,
      updatedAt: new Date("2026-08-05T01:00:00.000Z"),
      permissions: [...billingRole.role.permissions, { permission: Permission.PAYMENTS_VOID }],
    },
  }]);
  assert.notEqual(before, after);
});

test("authorization snapshot is stable across assignment and permission ordering", () => {
  const first = authorizationSnapshotForAccess([Role.STAFF], [billingRole]);
  const reordered = authorizationSnapshotForAccess([Role.STAFF], [{
    ...billingRole,
    role: {
      ...billingRole.role,
      permissions: [...billingRole.role.permissions].reverse(),
    },
  }]);
  assert.equal(first, reordered);
});
