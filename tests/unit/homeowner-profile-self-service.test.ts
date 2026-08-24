import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/portal/profile/page.tsx", "utf8");
const actions = readFileSync("lib/actions/homeowner-profile.ts", "utf8");

test("homeowner profile exposes self-service profile and household maintenance", () => {
  assert.match(page, /Edit my profile/);
  assert.match(page, /saveHomeownerProfileAction/);
  assert.match(page, /\+ Add household member/);
  assert.match(page, /saveHomeownerHouseholdMemberAction/);
  assert.match(page, /toggleHomeownerHouseholdMemberAction/);
  assert.match(page, /Remove from active household/);
  assert.match(page, /Reactivate household member/);
});

test("account number and monthly dues are visible but never editable by homeowner self-service", () => {
  assert.match(page, /Account number/);
  assert.match(page, /Monthly dues/);
  assert.match(page, /Read only/);
  assert.doesNotMatch(page, /<input[^>]+name="accountNumber"/);
  assert.doesNotMatch(page, /<input[^>]+name="monthlyDuesAmount"/);
  assert.doesNotMatch(actions, /formData\.get\(["']accountNumber["']\)/);
  assert.doesNotMatch(actions, /formData\.get\(["']monthlyDuesAmount["']\)/);
  assert.match(actions, /protectedFields: \["accountNumber", "monthlyDuesAmount"/);
});

test("homeowner self-service derives authority from the authenticated homeowner and tenant", () => {
  assert.match(actions, /requireUser\(Role\.HOMEOWNER\)/);
  assert.match(actions, /id: homeownerId, tenantId: user\.tenantId, userId: user\.id/);
  assert.match(actions, /where: \{ id: data\.id, tenantId: user\.tenantId, homeownerId: profile\.id \}/);
  assert.match(actions, /where: \{ id, tenantId: user\.tenantId, homeownerId \}/);
  assert.doesNotMatch(actions, /formData\.get\(["']tenantId["']\)/);
  assert.doesNotMatch(actions, /formData\.get\(["']homeownerId["']\)/);
});

test("profile update uses an explicit allowlist and household edits reset validation", () => {
  assert.match(actions, /phone: data\.phone/);
  assert.match(actions, /address: data\.address/);
  assert.match(actions, /block: data\.block/);
  assert.match(actions, /lot: data\.lot/);
  assert.doesNotMatch(actions, /monthlyDuesAmount: data/);
  assert.doesNotMatch(actions, /accountNumber: data/);
  assert.match(actions, /validatedAt: null/);
  assert.match(actions, /validatedById: null/);
  assert.match(actions, /action: "UPDATE_OWN_PROFILE"/);
  assert.match(actions, /action: "CREATE_OWN_HOUSEHOLD_MEMBER"/);
});
