import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("admin household member UI remains Admin-gated and tenant-scoped", async () => {
  const page = await source("app/admin/homeowners/[id]/household-members/page.tsx");

  assert.match(page, /requireUser\(Role\.ADMIN\)/);
  assert.match(page, /where: \{ id: homeownerId, tenantId: admin\.tenantId \}/);
  assert.match(page, /action=\{saveAdminHouseholdMemberAction\}/);
  assert.match(page, />Add Household Member<\/button>/);
});

test("admin household member mutation preserves tenant ownership and validation authority", async () => {
  const action = await source("lib/actions/admin-household-members.ts");

  assert.match(action, /requireUser\(Role\.ADMIN\)/);
  assert.match(action, /where: \{ id: homeownerId, tenantId: admin\.tenantId \}/);
  assert.match(action, /where: \{ id, tenantId: admin\.tenantId, homeownerId \}/);
  assert.match(action, /canValidateHouseholdMembers\(admin\.role\)/);
  assert.match(action, /requestedValidationStatus === "REJECTED" && validationRemarks\.length < 10/);
  assert.match(action, /Validation remarks are required when rejecting a household member\./);
});

test("admin household member create and update operations remain audited", async () => {
  const action = await source("lib/actions/admin-household-members.ts");

  assert.match(action, /tenantId: admin\.tenantId,[\s\S]*action: "CREATE_HOUSEHOLD_MEMBER"/);
  assert.match(action, /tenantId: admin\.tenantId,[\s\S]*action: "UPDATE_HOUSEHOLD_MEMBER"/);
  assert.match(action, /tenantId: admin\.tenantId,[\s\S]*action: "UPDATE_HOUSEHOLD_MEMBER_VALIDATION"/);
  assert.match(action, /entityType: "HouseholdMember"/);
});
