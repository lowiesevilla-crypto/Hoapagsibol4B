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

test("all authenticated role surfaces expose the tenant-isolated My Profile account switcher", async () => {
  const [links, profileView, roleAccess] = await Promise.all([
    source("components/sidebar-links.ts"),
    source("components/my-profile-view.tsx"),
    source("lib/role-access.ts"),
  ]);
  assert.match(links, /href: "\/admin\/profile", label: "My Profile"/);
  assert.match(links, /href: "\/employee\/profile", label: "My Profile"/);
  assert.match(links, /href: "\/platform\/profile", label: "My Profile"/);
  assert.match(profileView, /listLinkedAccounts\(user\.email, user\.id\)/);
  assert.match(profileView, /switchLinkedAccountAction/);
  assert.match(roleAccess, /\["\/admin\/profile", Permission\.ADMIN_ACCESS\]/);
});

test("verified activation pre-fills account credentials through an httpOnly handoff without putting the temporary password in the URL", async () => {
  const [route, form, action, handoffService, activationService] = await Promise.all([
    source("app/activate/verify/route.ts"),
    source("components/homeowner-activation-form.tsx"),
    source("lib/actions/homeowner-activation.ts"),
    source("lib/services/homeowner-activation-handoff.ts"),
    source("lib/services/homeowner-activation.ts"),
  ]);
  assert.match(route, /ACTIVATION_HANDOFF_COOKIE/);
  assert.match(route, /httpOnly: true/);
  assert.match(route, /sameSite: "lax"/);
  assert.match(form, /activationMode/);
  assert.match(form, /handoffDetails\.accountNumber/);
  assert.match(form, /handoffDetails\.temporaryPassword/);
  assert.match(form, /name="email"/);
  assert.match(form, /name="password"/);
  assert.match(form, /name="acceptTerms"/);
  assert.match(form, /!secureHandoff/);
  assert.match(action, /acceptedTerms/);
  assert.match(action, /completeHomeownerActivationFromHandoff\(\{ handoff, email, password \}\)/);
  assert.match(handoffService, /setAudience\("homeowner-activation"\)/);
  assert.match(handoffService, /compare\(candidateTemporaryPassword, credential\.credentialHash\)/);
  assert.match(handoffService, /temporaryPassword/);
  assert.match(handoffService, /expiresAt: \{ gt: new Date\(\) \}/);
  assert.match(activationService, /createHmac\("sha256", secret\)/);
  assert.match(activationService, /temporaryActivationPasswordForVerificationToken/);
  assert.match(activationService, /One-Time Temporary Password/);
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

test("database schema and migration allow duplicate emails without relaxing account-number identity", async () => {
  const [schema, migration] = await Promise.all([
    source("prisma/schema.prisma"),
    source("prisma/migrations/20260806203000_homeowner_multi_account_email/migration.sql"),
  ]);
  assert.match(schema, /@@index\(\[tenantId, email, active\]\)/);
  assert.doesNotMatch(schema, /@@unique\(\[tenantId, email\]\)/);
  assert.match(migration, /DROP INDEX `User_tenantId_email_key`/);
  assert.match(migration, /CREATE INDEX `User_tenantId_email_active_idx`/);
  assert.doesNotMatch(migration, /HomeownerProfile_accountNumber_key/);
});
