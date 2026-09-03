import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("Platform Admin authentication is not disabled by an inactive control tenant", async () => {
  const [auth, actions] = await Promise.all([
    source("lib/auth.ts"),
    source("lib/actions/auth.ts"),
  ]);

  assert.match(auth, /const platform = isPlatformRoleSet\(effectiveRoles\)/);
  assert.match(auth, /!platform && \(user\.tenant\.status !== "ACTIVE" \|\| user\.tenant\.subscriptionStatus === "CANCELLED"\)/);
  assert.match(auth, /tenant: \{ slug: session\.tenantSlug \}/);
  assert.doesNotMatch(auth, /tenant: \{ slug: session\.tenantSlug, status: "ACTIVE"/);

  assert.match(actions, /const platform = isPlatformRoleSet\(roles\)/);
  assert.match(actions, /!platform && !tenantCanSignIn\(candidate\.tenant\)/);
  assert.match(actions, /!platform && !tenantCanSignIn\(user\.tenant\)/);
  assert.match(actions, /\.\.\.\(tenant \? \{ tenantId: tenant\.id \} : \{\}\)/);
  assert.doesNotMatch(actions, /tenant: \{ status: "ACTIVE", subscriptionStatus: \{ not: "CANCELLED" \} \}/);
});

test("inactive HOA tenant users remain blocked while platform identities stay independent", async () => {
  const actions = await source("lib/actions/auth.ts");

  assert.match(actions, /if \(tenant && !tenantCanSignIn\(tenant\)\) return \{ error:/);
  assert.match(actions, /if \(!platform && !tenantCanSignIn\(candidate\.tenant\)\) return false/);
  assert.match(actions, /if \(!roles\.includes\(Role\.HOMEOWNER\)\) return input\.identifierType === "email"/);
});
