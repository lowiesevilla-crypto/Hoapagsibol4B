import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/profile/photo/route.ts", "utf8");
const service = readFileSync("lib/services/homeowner-profile-photo.ts", "utf8");

test("profile photo API never accepts browser identity or storage authority", () => {
  assert.doesNotMatch(route, /formData\.get\(["']tenant/);
  assert.doesNotMatch(route, /formData\.get\(["']user/);
  assert.doesNotMatch(route, /formData\.get\(["']path/);
  assert.match(route, /requireUser\(Role\.HOMEOWNER\)/);
  assert.match(route, /user\.tenantId/);
  assert.match(route, /user\.tenant\.slug/);
  assert.match(route, /user\.id/);
});

test("profile photo service scopes every metadata operation by tenant and user", () => {
  assert.match(service, /WHERE tenantId = \$\{tenantId\} AND userId = \$\{userId\}/);
  assert.match(service, /WHERE tenantId = \$\{tenantId\} AND userId = \$\{userId\}/g);
  assert.match(service, /tenantId, userId, storedName, contentType, size/);
});
