import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("universal login searches the complete authorized identity set without a hidden account cap", async () => {
  const [auth, loginPage, loginForm] = await Promise.all([
    source("lib/actions/auth.ts"),
    source("app/login/page.tsx"),
    source("components/login-form.tsx"),
  ]);

  const resolverStart = auth.indexOf("async function resolveLoginUser");
  const resolverEnd = auth.indexOf("async function resolveVerifiedLoginChoice");
  assert.notEqual(resolverStart, -1, "resolveLoginUser must exist");
  assert.notEqual(resolverEnd, -1, "resolveVerifiedLoginChoice must exist");
  const resolver = auth.slice(resolverStart, resolverEnd);

  assert.doesNotMatch(resolver, /\btake:\s*50\b/, "universal identity discovery must not silently cap matching accounts");
  assert.match(resolver, /tenant:\s*\{\s*status:\s*"ACTIVE",\s*subscriptionStatus:\s*\{\s*not:\s*"CANCELLED"\s*\}\s*\}/);
  assert.match(resolver, /candidate\.homeownerProfile\.status === "ACTIVE"/);
  assert.match(resolver, /candidate\.homeownerProfile\.emailStatus === "VERIFIED"/);
  assert.match(resolver, /candidate\.homeownerProfile\.activationStatus === HomeownerActivationStatus\.ACTIVE/);
  assert.match(resolver, /const selectable = input\.identifierType === "email" \? authorized : passwordMatches/);

  assert.match(loginPage, /TenantLoginScreen[\s\S]*universal/);
  assert.match(loginForm, /Email address or 11-digit account number/);
  assert.match(loginForm, /Choose the HOA account to open/);
  assert.match(loginForm, /Only the selected tenant\/account is loaded into the authenticated session/);
});

test("tenant administrators can discover HOAHub Subscription and Agreement from the visible sidebar", async () => {
  const [links, agreementPage] = await Promise.all([
    source("components/sidebar-links.ts"),
    source("app/admin/agreement/page.tsx"),
  ]);

  const shellStart = links.indexOf("export const adminShellLinks");
  const shellEnd = links.indexOf("export const systemAdminLinks");
  assert.notEqual(shellStart, -1, "adminShellLinks must exist");
  assert.notEqual(shellEnd, -1, "systemAdminLinks must exist");
  const shell = links.slice(shellStart, shellEnd);

  assert.match(shell, /href: "\/admin\/profile", label: "My Profile"[\s\S]*section: "Account"/);
  assert.match(shell, /href: "\/admin\/subscription", label: "HOAHub Subscription"[\s\S]*section: "Account"/);
  assert.match(shell, /href: "\/admin\/agreement", label: "HOAHub Agreement"[\s\S]*section: "Account"/);
  assert.match(agreementPage, /tenantAgreementAdminRoleAllowed/);
  assert.match(agreementPage, /Agreement history/);
  assert.match(agreementPage, /Download PDF/);
});
