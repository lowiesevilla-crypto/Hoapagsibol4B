import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loginAction = readFileSync("lib/actions/auth.ts", "utf8");
const loginForm = readFileSync("components/login-form.tsx", "utf8");
const choiceCookie = readFileSync("lib/login-choice-cookie.ts", "utf8");

test("multi-account choice uses a short-lived HttpOnly signed proof instead of retaining the password", () => {
  assert.match(choiceCookie, /LOGIN_CHOICE_MAX_AGE_SECONDS = 5 \* 60/);
  assert.match(choiceCookie, /httpOnly: true/);
  assert.match(choiceCookie, /sameSite: "lax"/);
  assert.match(choiceCookie, /new SignJWT\(\{ purpose: LOGIN_CHOICE_PURPOSE, userIds: allowedUserIds \}\)/);
  assert.doesNotMatch(choiceCookie, /password/);
});

test("second-step account selection is authorized by the verified choice cookie and never compares a password again", () => {
  assert.match(loginAction, /if \(selectedUserId\) \{/);
  assert.match(loginAction, /readVerifiedLoginChoices\(\)/);
  assert.match(loginAction, /allowedUserIds\?\.includes\(selectedUserId\)/);
  assert.match(loginAction, /resolveVerifiedLoginChoice\(selectedUserId\)/);
  assert.match(loginAction, /const result = await finishLogin\(resolvedSelection, true\)/);
  assert.match(loginAction, /await clearVerifiedLoginChoices\(\);\s*return result;/);
});

test("credential fields are removed after identity verification so account choice does not request username or password again", () => {
  assert.match(loginForm, /\{!hasChoices && <>/);
  assert.match(loginForm, /Identity verified\./);
  assert.match(loginForm, /You do not need to enter your email or password again\./);
  assert.match(loginForm, /name="selectedUserId"/);
  assert.match(loginForm, /Opening selected account…/);
});

test("login finalization persists the explicitly revalidated tenant session atomically before issuing the session cookie", () => {
  assert.match(loginAction, /const preparedSession = await prepareSession\(\{ userId: user\.id, role, roles, tenantId: tenant\.id, tenantSlug: tenant\.slug \}\)/);
  assert.match(loginAction, /platformPrisma\.\$transaction\(async \(tx\) => \{/);
  assert.match(loginAction, /tx\.user\.updateMany\(\{\s*where: \{ id: user\.id, tenantId: tenant\.id, active: true \}/);
  assert.match(loginAction, /if \(updated\.count !== 1\) throw new Error/);
  assert.match(loginAction, /await tx\.userSession\.create\(\{ data: preparedSession\.data \}\)/);
  assert.match(loginAction, /await setSessionCookie\(preparedSession\)/);
});

test("multi-account selection failures are contained as a retryable login error instead of surfacing a server exception page", () => {
  assert.match(loginAction, /\[auth\] verified multi-account selection failed/);
  assert.match(loginAction, /We could not open the selected HOA account\. Please sign in again and retry\./);
  assert.match(loginAction, /clearVerifiedLoginChoices\(\)\.catch\(\(\) => undefined\)/);
});

test("a session row is revoked if the browser session cookie cannot be issued", () => {
  assert.match(loginAction, /A persisted session that never reached the browser must not remain usable/);
  assert.match(loginAction, /tokenHash: preparedSession\.data\.tokenHash/);
  assert.match(loginAction, /data: \{ revokedAt: new Date\(\) \}/);
});
