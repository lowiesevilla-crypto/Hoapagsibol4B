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
  assert.match(loginAction, /clearVerifiedLoginChoices\(\)/);
});

test("credential fields are removed after identity verification so account choice does not request username or password again", () => {
  assert.match(loginForm, /\{!hasChoices && <>/);
  assert.match(loginForm, /Identity verified\./);
  assert.match(loginForm, /You do not need to enter your email or password again\./);
  assert.match(loginForm, /name="selectedUserId"/);
  assert.match(loginForm, /Opening selected account…/);
});
