import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("large onboarding import hashes the non-authenticating placeholder once per batch", () => {
  const source = readFileSync("lib/onboarding/import.ts", "utf8");
  assert.match(source, /const batchPlaceholderPasswordHash = await hash\(`/);
  assert.match(source, /passwordHash: batchPlaceholderPasswordHash/);
  assert.doesNotMatch(source, /for \(const row of validation\.rows\)[\s\S]*passwordHash: await hash\(/);
});

test("client-scale imports defer synchronous activation work instead of timing out the apply request", () => {
  const source = readFileSync("lib/onboarding/import.ts", "utf8");
  assert.match(source, /ONBOARDING_INLINE_ACTIVATION_MAX_ROWS = 25/);
  assert.match(source, /const deferActivationInvitations = validation\.rows\.length > ONBOARDING_INLINE_ACTIVATION_MAX_ROWS/);
  assert.match(source, /applyClientScaleRows/);
  assert.match(source, /activationStatus: HomeownerActivationStatus\.NOT_INVITED/);
  assert.match(source, /activationInvitationsDeferred/);
});

test("client-scale apply uses bounded createMany database writes and an explicit transaction timeout", () => {
  const source = readFileSync("lib/onboarding/import.ts", "utf8");
  assert.match(source, /ONBOARDING_IMPORT_TRANSACTION_TIMEOUT_MS = 300_000/);
  assert.match(source, /timeout: ONBOARDING_IMPORT_TRANSACTION_TIMEOUT_MS/);
  assert.match(source, /tx\.user\.createMany/);
  assert.match(source, /tx\.homeownerProfile\.createMany/);
  assert.match(source, /tx\.userRoleAssignment\.createMany/);
  assert.match(source, /tx\.homeownerAccountNumberReservation\.createMany/);
  assert.match(source, /tx\.auditLog\.createMany/);
  assert.match(source, /allocateUniqueHomeownerAccountNumbers/);
  assert.doesNotMatch(source, /generateUniqueHomeownerAccountNumber/);
});

test("small imports retain immediate unique activation credentials and delivery", () => {
  const source = readFileSync("lib/onboarding/import.ts", "utf8");
  assert.match(source, /async function applyInlineRows/);
  assert.match(source, /\? await createHomeownerActivationCredential\(/);
  assert.match(source, /sendHomeownerActivationEmail/);
});
