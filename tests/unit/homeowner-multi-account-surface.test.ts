import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("shared-email login returns an explicit tenant and account choice", async () => {
  const [action, form] = await Promise.all([
    source("lib/actions/auth.ts"),
    source("components/login-form.tsx"),
  ]);
  assert.match(action, /choices\?: LoginChoice\[\]/);
  assert.match(action, /selectedUserId/);
  assert.match(action, /tenantName:/);
  assert.match(action, /accountNumber:/);
  assert.match(form, /Choose the HOA account to open/);
  assert.match(form, /name="selectedUserId"/);
  assert.match(form, /Only the selected tenant is loaded into the session/);
});

test("homeowner profile exposes linked accounts through a tenant-isolated switch action", async () => {
  const [profile, action, resolver] = await Promise.all([
    source("app/portal/profile/page.tsx"),
    source("lib/actions/linked-accounts.ts"),
    source("lib/linked-accounts.ts"),
  ]);
  assert.match(profile, /My HOA accounts/);
  assert.match(profile, /switchLinkedAccountAction/);
  assert.match(action, /listLinkedAccounts\(currentUser\.email/);
  assert.match(action, /setTenantContext\(/);
  assert.match(action, /createSession\(/);
  assert.match(resolver, /email: normalizedEmail/);
  assert.match(resolver, /tenant: \{ status: "ACTIVE"/);
});

test("verified activation uses an httpOnly handoff and does not expose the one-time credential", async () => {
  const [route, form, action, service] = await Promise.all([
    source("app/activate/verify/route.ts"),
    source("components/homeowner-activation-form.tsx"),
    source("lib/actions/homeowner-activation.ts"),
    source("lib/services/homeowner-activation-handoff.ts"),
  ]);
  assert.match(route, /ACTIVATION_HANDOFF_COOKIE/);
  assert.match(route, /httpOnly: true/);
  assert.match(route, /sameSite: "lax"/);
  assert.match(form, /activationMode/);
  assert.match(form, /one-time temporary credential is attached to this verified link/);
  assert.match(action, /completeHomeownerActivationFromHandoff/);
  assert.match(service, /setAudience\("homeowner-activation"\)/);
  assert.match(service, /expiresAt: \{ gt: new Date\(\) \}/);
  assert.doesNotMatch(route, /temporaryPassword/);
});

test("dashboard only queries optional module data when entitled and degrades individual sections", async () => {
  const dashboard = await source("app/portal/dashboard/page.tsx");
  assert.match(dashboard, /optionalDashboardOperation/);
  assert.match(dashboard, /documentsEnabled/);
  assert.match(dashboard, /complaintsEnabled/);
  assert.match(dashboard, /announcementsEnabled/);
  assert.match(dashboard, /eventsEnabled/);
  assert.match(dashboard, /Some dashboard sections are temporarily unavailable/);
});

test("database migration allows duplicate emails within a tenant without relaxing account-number identity", async () => {
  const migration = await source("prisma/migrations/20260806203000_homeowner_multi_account_email/migration.sql");
  assert.match(migration, /DROP INDEX `User_tenantId_email_key`/);
  assert.match(migration, /CREATE INDEX `User_tenantId_email_active_idx`/);
  assert.doesNotMatch(migration, /HomeownerProfile_accountNumber_key/);
});
