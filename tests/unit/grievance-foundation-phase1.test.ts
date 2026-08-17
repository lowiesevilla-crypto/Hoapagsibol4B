import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("prisma/migrations/20260817093000_grievance_foundation_phase1/migration.sql", "utf8");
const anonymousService = readFileSync("lib/services/complaint-anonymous-session.ts", "utf8");
const grievanceService = readFileSync("lib/services/grievance-foundation.ts", "utf8");
const requestSecurity = readFileSync("lib/anonymous-request-security.ts", "utf8");
const sessionRoute = readFileSync("app/api/complaints/anonymous/session/route.ts", "utf8");
const messagesRoute = readFileSync("app/api/complaints/anonymous/messages/route.ts", "utf8");
const tracker = readFileSync("components/complaint-track-form.tsx", "utf8");
const trackerPage = readFileSync("app/complaints/track/page.tsx", "utf8");

function tableBlock(name: string) {
  const start = migration.indexOf(`CREATE TABLE \`${name}\``);
  assert.notEqual(start, -1, `${name} table must exist`);
  const next = migration.indexOf("CREATE TABLE `", start + 1);
  const alter = migration.indexOf("ALTER TABLE `", start + 1);
  const ends = [next, alter].filter((value) => value >= 0);
  const end = ends.length ? Math.min(...ends) : migration.length;
  return migration.slice(start, end);
}

test("Phase 1 persistence is additive and covers the BRD foundation domains", () => {
  for (const table of [
    "GrievanceSetting",
    "ComplaintAnonymousSession",
    "ComplaintSubject",
    "ComplaintVerificationPolicy",
    "ComplaintVerification",
    "GrievanceCase",
    "GrievanceCommitteeMembership",
    "GrievanceDeadline",
    "ComplaintGrievanceActivity",
  ]) {
    const block = tableBlock(table);
    assert.match(block, /tenantId/);
  }
  assert.match(migration, /ADD COLUMN `senderType`/);
  assert.match(migration, /ADD COLUMN `channel`/);
  assert.match(migration, /ADD COLUMN `clientMessageId`/);
  assert.match(migration, /ADD COLUMN `anonymousSessionId`/);
  assert.match(migration, /ComplaintMessage_anon_idempotency_key/);
  assert.match(migration, /ComplaintMessage_anon_cursor_idx/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/);
});

test("anonymous complaint sessions cannot recreate resident identity linkage", () => {
  const block = tableBlock("ComplaintAnonymousSession");
  assert.match(block, /tokenHash/);
  assert.match(block, /expiresAt/);
  assert.match(block, /lastSeenAt/);
  assert.match(block, /revokedAt/);
  assert.doesNotMatch(block, /userId|homeownerId|accountNumber|email|ipHash|userAgent/i);
  assert.match(anonymousService, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(anonymousService, /createHash\("sha256"\)\.update\(token\)\.digest\("hex"\)/);
  assert.match(anonymousService, /compare\(normalizedPin, credential\.pinHash\)/);
});

test("anonymous authentication and message abuse controls are separate", () => {
  assert.match(anonymousService, /complaint-anonymous-session-auth/);
  assert.match(anonymousService, /8, 15 \* 60 \* 1000/);
  assert.match(anonymousService, /complaint-anonymous-message/);
  assert.match(anonymousService, /20, 5 \* 60 \* 1000/);
  assert.match(anonymousService, /safeClientMessageId/);
  assert.match(anonymousService, /INSERT IGNORE INTO ComplaintMessage/);
  assert.match(anonymousService, /anonymousSessionId = \$\{session\.id\}/);
  assert.match(anonymousService, /clientMessageId = \$\{clientMessageId\}/);
});

test("anonymous tracker APIs expose PUBLIC complaint conversation content only", () => {
  assert.match(anonymousService, /visibility = 'PUBLIC'/);
  assert.doesNotMatch(anonymousService, /visibility != 'CONFIDENTIAL'/);
  assert.doesNotMatch(anonymousService, /visibility != 'INTERNAL'/);
  assert.match(anonymousService, /authorDisplayName: "Anonymous complainant"/);
  assert.match(anonymousService, /authorDisplayName: "HOA Staff"/);
  assert.match(anonymousService, /authorDisplayName: "HOAHub"/);
  assert.doesNotMatch(anonymousService, /select id, body, createdAt, senderType, authorId, email/i);
  assert.match(anonymousService, /ANONYMOUS_MESSAGE_MAX_LENGTH = 2000/);
});

test("anonymous session cookie is HttpOnly and state-changing routes enforce same origin with no-store", () => {
  assert.match(sessionRoute, /httpOnly: true/);
  assert.match(sessionRoute, /secure: process\.env\.NODE_ENV === "production"/);
  assert.match(sessionRoute, /sameSite: "lax"/);
  assert.match(sessionRoute, /assertSameOrigin\(request\)/);
  assert.match(messagesRoute, /assertSameOrigin\(request\)/);
  assert.match(requestSecurity, /request\.headers\.get\("origin"\)/);
  assert.match(requestSecurity, /request\.headers\.get\("referer"\)/);
  assert.match(requestSecurity, /private, no-store/);
  assert.match(messagesRoute, /cache:|privateNoStoreHeaders/);
});

test("anonymous tracker is mobile/PWA safe, text-only, and uses incremental polling", () => {
  assert.match(trackerPage, /Back to Home/);
  assert.match(tracker, /ACTIVE_POLL_MS = 5_000/);
  assert.match(tracker, /IDLE_POLL_MS = 12_000/);
  assert.match(tracker, /document\.hidden/);
  assert.match(tracker, /visibilitychange/);
  assert.match(tracker, /\?after=/);
  assert.match(tracker, /MAX_MESSAGE_LENGTH = 2_000/);
  assert.match(tracker, /Text only/);
  assert.doesNotMatch(tracker, /type=["']file["']/);
  assert.match(tracker, /safe-area-inset-bottom/);
  assert.match(tracker, /min-w-0/);
});

test("complaint subject and verification foundations enforce tenant and evidence boundaries", () => {
  assert.match(grievanceService, /tenantId: user\.tenantId, id: input\.homeownerId/);
  assert.match(grievanceService, /tenantId: user\.tenantId, id: input\.vehicleId/);
  assert.match(grievanceService, /phaseSnapshot/);
  assert.match(grievanceService, /blockSnapshot/);
  assert.match(grievanceService, /lotSnapshot/);
  assert.match(grievanceService, /evaluateComplaintVerificationRequirement/);
  assert.match(grievanceService, /assertComplaintEnforcementAllowed/);
  assert.match(grievanceService, /Independent verification is required before this enforcement action can proceed/);
  assert.doesNotMatch(grievanceService, /confidentialIdentity/);
});

test("grievance cases remain separate from ComplaintStatus and board review is metadata only", () => {
  const caseBlock = tableBlock("GrievanceCase");
  for (const status of ["ASSESSMENT", "VERIFICATION_REQUIRED", "VERIFIED", "READY_FOR_FORMAL_PROCESS", "CLOSED_NO_ACTION", "CLOSED_UNSUBSTANTIATED"]) {
    assert.ok(caseBlock.includes(status));
  }
  assert.match(caseBlock, /boardReviewRequired/);
  assert.match(grievanceService, /promoteComplaintToGrievance/);
  assert.doesNotMatch(grievanceService, /ComplaintStatus\./);
  assert.doesNotMatch(grievanceService, /BOARD_APPROVED|board vote completed/i);
});

test("committee authority is tenant scoped, granular, and effective-role aware", () => {
  const committeeBlock = tableBlock("GrievanceCommitteeMembership");
  for (const position of ["CHAIR", "MEMBER", "SECRETARY", "MEDIATOR"]) assert.ok(committeeBlock.includes(position));
  assert.match(committeeBlock, /permissions` JSON/);
  assert.match(grievanceService, /normalizedRoles/);
  assert.match(grievanceService, /user\.roles/);
  assert.match(grievanceService, /getActiveGrievancePermissions/);
  assert.match(grievanceService, /REVEAL_CONFIDENTIAL_IDENTITY/);
  assert.match(grievanceService, /APPROVE_ENFORCEMENT/);
  assert.doesNotMatch(grievanceService, /Role\.STAFF.*REVEAL_CONFIDENTIAL_IDENTITY/);
});

test("grievance deadlines are separate from complaint dueAt and require explicit policy dates", () => {
  const deadlineBlock = tableBlock("GrievanceDeadline");
  assert.match(deadlineBlock, /startsAt/);
  assert.match(deadlineBlock, /dueAt/);
  assert.match(deadlineBlock, /completedAt/);
  assert.match(deadlineBlock, /pausedAt/);
  assert.match(deadlineBlock, /pauseReason/);
  assert.match(deadlineBlock, /policySource/);
  assert.match(grievanceService, /input\.dueAt <= input\.startsAt/);
  assert.match(grievanceService, /policySource/);
  assert.match(grievanceService, /operationalSlaPausedAt/);
  assert.doesNotMatch(grievanceService, /complaint\.dueAt|Complaint\.dueAt/);
  assert.doesNotMatch(grievanceService, /addDays\([^)]*,\s*[57]\)|\+\s*[57]\s*\*\s*24/);
});

test("anonymous audit metadata does not persist PINs, raw session tokens, or message bodies", () => {
  assert.doesNotMatch(anonymousService, /metadata:\s*\{[^}]*\bpin\b/i);
  assert.doesNotMatch(anonymousService, /metadata:\s*\{[^}]*\btoken\b/i);
  assert.doesNotMatch(anonymousService, /metadata:\s*\{[^}]*\bbody\b/i);
  assert.match(anonymousService, /metadata: \{ messageId, source: "ANONYMOUS_TRACKER" \}/);
});
