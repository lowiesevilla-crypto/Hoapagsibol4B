import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const detailPage = readFileSync("app/admin/complaints/[id]/page.tsx", "utf8");
const queuePage = readFileSync("app/admin/complaints/page.tsx", "utf8");
const panel = readFileSync("components/grievance-foundation-panel.tsx", "utf8");
const tracker = readFileSync("components/complaint-track-form.tsx", "utf8");
const foundation = readFileSync("lib/services/grievance-foundation.ts", "utf8");
const grievanceAdmin = readFileSync("lib/services/grievance-admin.ts", "utf8");
const anonymousService = readFileSync("lib/services/complaint-anonymous-session.ts", "utf8");
const reporting = readFileSync("lib/services/grievance-reporting.ts", "utf8");
const sessionRoute = readFileSync("app/api/complaints/anonymous/session/route.ts", "utf8");
const messagesRoute = readFileSync("app/api/complaints/anonymous/messages/route.ts", "utf8");

test("committee grievance permissions drive detail UI visibility and controls", () => {
  assert.match(detailPage, /requireGrievancePermission/);
  assert.match(detailPage, /hasGrievancePermission\(user, "VIEW_GRIEVANCE"\)/);
  assert.match(detailPage, /hasGrievancePermission\(user, "TRIAGE_GRIEVANCE"\)/);
  assert.match(detailPage, /hasGrievancePermission\(user, "VERIFY_GRIEVANCE"\)/);
  assert.doesNotMatch(detailPage, /\[Role\.ADMIN, Role\.HOA_ADMIN, Role\.SYSTEM_ADMIN\]/);
  assert.match(panel, /canTriage: boolean/);
  assert.match(panel, /canVerify: boolean/);
  assert.match(panel, /\{canVerify && <form action=\{updateComplaintVerificationAction\}/);
  assert.match(panel, /\{canTriage && <form action=\{addComplaintSubjectAction\}/);
});

test("grievance queue applies formal filters in SQL before its result cap", () => {
  assert.match(queuePage, /getGrievanceComplaintQueue/);
  assert.doesNotMatch(queuePage, /matchingIds/);
  assert.doesNotMatch(queuePage, /baseComplaints\.filter/);
  const queueFunction = reporting.slice(reporting.indexOf("export async function getGrievanceComplaintQueue"));
  const whereIndex = queueFunction.indexOf("WHERE ${where}");
  const limitIndex = queueFunction.indexOf("LIMIT 100");
  assert.ok(whereIndex >= 0 && limitIndex > whereIndex, "formal queue must filter before limiting");
  assert.match(reporting, /COALESCE\(c\.location, ''\) LIKE/);
});

test("vehicle subject cannot be paired with a different homeowner", () => {
  assert.match(foundation, /homeowner\.id !== vehicle\.homeownerId/);
  assert.match(foundation, /selected vehicle does not belong to the selected homeowner\/property/i);
});

test("verification policy blocking is sourced from a policy that also requires verification", () => {
  assert.match(foundation, /policies\.some\(\(policy\) => Boolean\(policy\.verificationRequired\) && Boolean\(policy\.blocksEnforcement\)\)/);
  assert.doesNotMatch(foundation, /required && policies\.some\(\(policy\) => Boolean\(policy\.blocksEnforcement\)\)/);
});

test("verification result, activity, and audit commit atomically with accurate event type", () => {
  const start = foundation.indexOf("export async function recordComplaintVerification");
  const end = foundation.indexOf("export async function assertComplaintEnforcementAllowed", start);
  const block = foundation.slice(start, end);
  assert.match(block, /platformPrisma\.\$transaction\(async \(tx\)/);
  assert.match(block, /await tx\.\$executeRaw/);
  assert.match(block, /await tx\.auditLog\.create/);
  assert.match(block, /input\.status === "IN_PROGRESS" \? "VERIFICATION_STARTED" : "VERIFICATION_COMPLETED"/);
  assert.doesNotMatch(block, /await activity\(/);
  assert.doesNotMatch(block, /await audit\(/);
});

test("VERIFIED grievance status requires a passed independent verification", () => {
  const start = grievanceAdmin.indexOf("export async function updateGrievanceCaseStatus");
  const end = grievanceAdmin.indexOf("export async function updateGrievanceDeadlineStatus", start);
  const block = grievanceAdmin.slice(start, end);
  assert.match(block, /input\.status === "VERIFIED"/);
  assert.match(block, /ComplaintVerification/);
  assert.match(block, /verification\?\.status !== "PASSED"/);
  assert.match(block, /must be Passed before this grievance can be marked Verified/);
});

test("anonymous message sender classification remains authoritative after staff deletion", () => {
  const start = anonymousService.indexOf("function mapMessage");
  const end = anonymousService.indexOf("async function safeAnonymousAudit", start);
  const block = anonymousService.slice(start, end);
  assert.match(block, /row\.senderType === "COMPLAINANT"/);
  assert.doesNotMatch(block, /row\.authorId === null/);
  assert.match(block, /sender: "HOA_STAFF"/);
});

test("anonymous message retries reuse the pending idempotency key until content changes", () => {
  assert.match(tracker, /pendingMessageRef/);
  assert.match(tracker, /existingPending\?\.body === body\s*\?\s*existingPending\.clientMessageId\s*:\s*safeClientMessageId\(\)/);
  assert.match(tracker, /pendingMessageRef\.current = \{ body, clientMessageId \}/);
  assert.match(tracker, /pendingMessageRef\.current && pendingMessageRef\.current\.body !== nextMessage\.trim\(\)/);
  assert.match(tracker, /pendingMessageRef\.current = null/);
});

test("anonymous APIs whitelist expected domain errors and use generic unexpected responses", () => {
  assert.match(sessionRoute, /Anonymous complaint session could not be created/);
  assert.match(sessionRoute, /Anonymous complaint session could not be revoked/);
  assert.match(messagesRoute, /Anonymous complaint conversation could not be loaded/);
  assert.match(messagesRoute, /Message could not be sent/);
  assert.doesNotMatch(sessionRoute, /error instanceof Error \? error\.message : "Anonymous complaint session could not be created\."/);
  assert.doesNotMatch(messagesRoute, /return errorResponse\(message, message\.includes/);
});
