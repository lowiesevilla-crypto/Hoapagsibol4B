import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("prisma/migrations/20260817093000_grievance_foundation_phase1/migration.sql", "utf8");

test("anonymous message session FK never tries to null the non-null tenant column", () => {
  assert.match(
    migration,
    /FOREIGN KEY \(`anonymousSessionId`\) REFERENCES `ComplaintAnonymousSession`\(`id`\) ON DELETE SET NULL/,
  );
  assert.doesNotMatch(
    migration,
    /FOREIGN KEY \(`tenantId`, `anonymousSessionId`\).*ON DELETE SET NULL/,
  );
});

test("anonymous idempotency still binds tenant, complaint, session and client message id", () => {
  assert.match(
    migration,
    /ComplaintMessage_anon_idempotency_key`\(`tenantId`, `complaintId`, `anonymousSessionId`, `clientMessageId`\)/,
  );
});

test("Phase 1 migration remains additive", () => {
  assert.doesNotMatch(migration, /\bDROP\s+(TABLE|COLUMN|DATABASE)\b/i);
});
