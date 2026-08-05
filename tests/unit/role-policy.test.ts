import assert from "node:assert/strict";
import test from "node:test";
import { Role } from "@prisma/client";
import {
  canAssignRole,
  roleLabelMap,
  rolePermissionsForRoles,
  tenantRoleHierarchy,
} from "../../lib/authorization/role-policy";

test("every role has an explicit label and hierarchy entry", () => {
  for (const role of Object.values(Role)) {
    assert.ok(roleLabelMap[role], `Missing label for ${role}`);
    assert.ok(tenantRoleHierarchy[role]?.includes(role), `${role} must include itself`);
  }
});

test("multiple assigned roles produce the union of effective role capabilities", () => {
  const effective = rolePermissionsForRoles([Role.BILLING_MANAGER, Role.HOMEOWNER]);

  assert.ok(effective.has(Role.BILLING_MANAGER));
  assert.ok(effective.has(Role.STAFF));
  assert.ok(effective.has(Role.EMPLOYEE));
  assert.ok(effective.has(Role.HOMEOWNER));
  assert.equal(effective.has(Role.PAYROLL_MANAGER), false);
  assert.equal(effective.has(Role.PLATFORM_ADMIN), false);
});

test("tenant administrators cannot grant platform or super-admin roles", () => {
  for (const actor of [Role.HOA_ADMIN, Role.SYSTEM_ADMIN, Role.ADMIN]) {
    assert.equal(canAssignRole(actor, Role.SUPER_ADMIN), false);
    assert.equal(canAssignRole(actor, Role.PLATFORM_ADMIN), false);
    assert.equal(canAssignRole(actor, Role.BILLING_MANAGER), true);
  }
});

test("platform roles cannot grant super-admin access", () => {
  assert.equal(canAssignRole(Role.PLATFORM_ADMIN, Role.SUPER_ADMIN), false);
  assert.equal(canAssignRole(Role.SUPER_ADMIN, Role.SUPER_ADMIN), false);
  assert.equal(canAssignRole(Role.PLATFORM_ADMIN, Role.HOA_ADMIN), true);
  assert.equal(canAssignRole(Role.SUPER_ADMIN, Role.PLATFORM_ADMIN), true);
});

test("non-administrative roles cannot assign any role", () => {
  for (const actor of [Role.BILLING_MANAGER, Role.PAYROLL_MANAGER, Role.STAFF, Role.HOMEOWNER, Role.EMPLOYEE]) {
    for (const target of Object.values(Role)) {
      assert.equal(canAssignRole(actor, target), false, `${actor} unexpectedly assigned ${target}`);
    }
  }
});
