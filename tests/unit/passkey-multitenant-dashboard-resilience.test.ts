import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("tenant-branded passkey login binds verification to the selected community", async () => {
  const button = await source("components/passkey-login-button.tsx");
  const verifyRoute = await source("app/api/auth/passkeys/login/verify/route.ts");
  const service = await source("lib/services/passkeys.ts");

  assert.match(button, /JSON\.stringify\(\{ response, tenantSlug \}\)/);
  assert.match(verifyRoute, /expectedTenantSlug:/);
  assert.match(service, /expectedTenantSlug\?: string/);
  assert.match(service, /credentialRecord\.user\.tenant\.slug\.toLowerCase\(\) !== expectedTenantSlug/);
  assert.match(service, /PASSKEY_TENANT_MISMATCH_ERROR/);
});

test("universal passkey discovery remains available while orphaned credentials get safe recovery guidance", async () => {
  const optionsRoute = await source("app/api/auth/passkeys/login/options/route.ts");
  const verifyRoute = await source("app/api/auth/passkeys/login/verify/route.ts");
  const service = await source("lib/services/passkeys.ts");

  assert.match(optionsRoute, /if \(!identifier\) \{/);
  assert.match(optionsRoute, /generatePasskeyDiscoveryAuthenticationOptions\(\)/);
  assert.match(service, /if \(!credentialRecord\) \{/);
  assert.match(service, /CREDENTIAL_NOT_REGISTERED/);
  assert.match(service, /This saved passkey is no longer registered with HOAHub/);
  assert.match(verifyRoute, /error instanceof PasskeyAuthenticationError/);
  assert.match(verifyRoute, /response\.cookies\.delete\(DISCOVERY_CHALLENGE_COOKIE\)/);
});

test("new passkeys are tenant-identifiable without rewriting existing credentials", async () => {
  const registrationRoute = await source("app/api/auth/passkeys/register/options/route.ts");
  const service = await source("lib/services/passkeys.ts");

  assert.match(registrationRoute, /tenantSlug: user\.tenant\.slug/);
  assert.match(service, /userName: tenantLabel \? `\$\{input\.email\} · \$\{tenantLabel\}` : input\.email/);
  assert.match(service, /excludeCredentials: existing\.map/);
  assert.doesNotMatch(registrationRoute, /deleteMany|delete\(/);
});

test("logout all sessions revokes sessions without deleting passkeys", async () => {
  const logout = await source("lib/auth-logout.ts");

  assert.match(logout, /userSession\.updateMany/);
  assert.doesNotMatch(logout, /userPasskeyCredential\.(?:delete|deleteMany|update|updateMany|upsert)/);
});

test("homeowner dashboard retries only known transient billing read failures once and retains safe fallback", async () => {
  const dashboard = await source("app/portal/dashboard/page.tsx");

  assert.match(dashboard, /TRANSIENT_DASHBOARD_READ_CODES = new Set\(\["P1001", "P1002", "P2024"\]\)/);
  assert.match(dashboard, /retryTransientDashboardRead\("statementOfAccount"/);
  assert.match(dashboard, /setTimeout\(resolve, 80\)/);
  assert.match(dashboard, /errorCode: databaseErrorCode\(error\)/);
  assert.match(dashboard, /Some dashboard sections are temporarily unavailable/);
  assert.match(dashboard, /\? "Safe Error"/);
});
