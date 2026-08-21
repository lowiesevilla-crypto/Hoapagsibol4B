import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("large onboarding import hashes the non-authenticating placeholder once per batch", () => {
  const source = readFileSync("lib/onboarding/import.ts", "utf8");
  assert.match(source, /const batchPlaceholderPasswordHash = await hash\(`/);
  assert.match(source, /passwordHash: batchPlaceholderPasswordHash/);
  assert.doesNotMatch(source, /for \(const row of validation\.rows\)[\s\S]*passwordHash: await hash\(/);
});

test("real homeowner activation credentials remain independently created for emailed rows", () => {
  const source = readFileSync("lib/onboarding/import.ts", "utf8");
  assert.match(source, /emailProvided\s*\? await createHomeownerActivationCredential\(/);
  assert.match(source, /sendHomeownerActivationEmail/);
});
