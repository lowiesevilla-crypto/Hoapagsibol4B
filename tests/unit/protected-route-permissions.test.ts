import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canAccessProtectedPath,
  protectedPathRedirect,
} from "@/lib/authorization/protected-route-policy";

test("custom permission snapshots can enter the admin area without an admin enum role", () => {
  const access = { roles: ["EMPLOYEE"], permissions: ["admin.access", "billing.read"] };
  assert.equal(canAccessProtectedPath(access, "/admin/billing"), true);
});

test("platform area remains denied without platform access", () => {
  const access = { roles: ["STAFF"], permissions: ["admin.access"] };
  assert.equal(protectedPathRedirect(access, "/platform/tenants"), "/admin/dashboard");
});

test("homeowner and employee portal access can be derived from permissions", () => {
  assert.equal(canAccessProtectedPath({ roles: [], permissions: ["homeowner.portal.access"] }, "/portal/dashboard"), true);
  assert.equal(canAccessProtectedPath({ roles: [], permissions: ["employee.portal.access"] }, "/employee/attendance"), true);
});

test("unknown protected access fails closed", () => {
  assert.equal(protectedPathRedirect({ roles: [], permissions: [] }, "/admin/dashboard"), "/login");
});
