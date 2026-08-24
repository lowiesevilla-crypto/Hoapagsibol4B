import assert from "node:assert/strict";
import { test } from "node:test";
import { Role } from "@prisma/client";
import { canUseTenantRepositoryWhenPlanDisabled } from "@/lib/document-repository/admin-access";

test("tenant administrator roles keep repository governance access", () => {
  assert.equal(canUseTenantRepositoryWhenPlanDisabled([Role.SYSTEM_ADMIN]), true);
  assert.equal(canUseTenantRepositoryWhenPlanDisabled([Role.HOA_ADMIN]), true);
  assert.equal(canUseTenantRepositoryWhenPlanDisabled([Role.ADMIN]), true);
});

test("non-tenant-admin and platform-only roles do not bypass repository entitlement", () => {
  assert.equal(canUseTenantRepositoryWhenPlanDisabled([Role.STAFF]), false);
  assert.equal(canUseTenantRepositoryWhenPlanDisabled([Role.HOMEOWNER]), false);
  assert.equal(canUseTenantRepositoryWhenPlanDisabled([Role.SUPER_ADMIN]), false);
  assert.equal(canUseTenantRepositoryWhenPlanDisabled([Role.PLATFORM_ADMIN]), false);
});

test("an explicitly assigned tenant administrator role enables governance access", () => {
  assert.equal(canUseTenantRepositoryWhenPlanDisabled([Role.SUPER_ADMIN, Role.SYSTEM_ADMIN]), true);
});
