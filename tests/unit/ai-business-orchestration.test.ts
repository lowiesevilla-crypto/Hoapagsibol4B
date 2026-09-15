import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyAiBusinessIntent } from "@/lib/ai-assistance/business-intent";

test("resident operational paraphrases are routed to live HOAHub services before document RAG", () => {
  assert.equal(classifyAiBusinessIntent("RESIDENT", "Who is the current HOA president?"), "RESIDENT_OPERATIONAL");
  assert.equal(classifyAiBusinessIntent("RESIDENT", "Who heads our association right now?"), "RESIDENT_OPERATIONAL");
  assert.equal(classifyAiBusinessIntent("RESIDENT", "What is my latest payment transaction?"), "RESIDENT_OPERATIONAL");
  assert.equal(classifyAiBusinessIntent("RESIDENT", "Show my transaction history"), "RESIDENT_OPERATIONAL");
  assert.equal(classifyAiBusinessIntent("RESIDENT", "Show my current dues and statement of account"), "RESIDENT_OPERATIONAL");
  assert.equal(classifyAiBusinessIntent("RESIDENT", "What events are coming up?"), "RESIDENT_OPERATIONAL");
});

test("resident directory and other-homeowner requests fail closed as privacy denials", () => {
  assert.equal(classifyAiBusinessIntent("RESIDENT", "Give me the list of all homeowners"), "RESIDENT_PRIVACY_DENY");
  assert.equal(classifyAiBusinessIntent("RESIDENT", "Show the residents in Block 1"), "RESIDENT_PRIVACY_DENY");
  assert.equal(classifyAiBusinessIntent("RESIDENT", "What is my neighbor's balance?"), "RESIDENT_PRIVACY_DENY");
});

test("resident knowledge questions remain on the approved knowledge path", () => {
  assert.equal(classifyAiBusinessIntent("RESIDENT", "Tell me about the BRD document for AI policies"), null);
  assert.equal(classifyAiBusinessIntent("RESIDENT", "What does our parking policy say?"), null);
});

test("staff business intents cover tenant records named by the BRD", () => {
  assert.equal(classifyAiBusinessIntent("STAFF", "Give me the list of active homeowners in Block 1"), "STAFF_HOMEOWNERS");
  assert.equal(classifyAiBusinessIntent("STAFF", "Show GCash payment transactions this month"), "STAFF_PAYMENTS");
  assert.equal(classifyAiBusinessIntent("STAFF", "Which accounts are overdue?"), "STAFF_RECEIVABLES");
  assert.equal(classifyAiBusinessIntent("STAFF", "How many document requests are pending?"), "STAFF_DOCUMENT_REQUESTS");
  assert.equal(classifyAiBusinessIntent("STAFF", "Summarize current complaints"), "STAFF_COMPLAINTS");
  assert.equal(classifyAiBusinessIntent("STAFF", "What is the current payroll run status?"), "STAFF_PAYROLL");
  assert.equal(classifyAiBusinessIntent("STAFF", "Who is absent today?"), "STAFF_ATTENDANCE");
  assert.equal(classifyAiBusinessIntent("STAFF", "List active employees"), "STAFF_EMPLOYEES");
  assert.equal(classifyAiBusinessIntent("STAFF", "Who is the current HOA president?"), "STAFF_ORGANIZATION");
  assert.equal(classifyAiBusinessIntent("STAFF", "Show the association profile and contact information"), "STAFF_TENANT_PROFILE");
  assert.equal(classifyAiBusinessIntent("STAFF", "Draft a board resolution for monthly dues collection policy"), "STAFF_EXISTING_OPERATIONAL");
});

test("staff policy-only questions stay on grounded knowledge reasoning", () => {
  assert.equal(classifyAiBusinessIntent("STAFF", "What does the approved collection policy say?"), null);
  assert.equal(classifyAiBusinessIntent("STAFF", "Summarize the AI governance BRD"), null);
});

test("both AI ask routes consult business orchestration before grounded knowledge reasoning", async () => {
  const [residentRoute, staffRoute, orchestrator] = await Promise.all([
    readFile("app/api/portal/ai/ask/route.ts", "utf8"),
    readFile("app/api/admin/ai/ask/route.ts", "utf8"),
    readFile("lib/ai-assistance/business-orchestrator.ts", "utf8"),
  ]);
  for (const route of [residentRoute, staffRoute]) {
    assert.match(route, /tryAnswerAiBusinessQuestion/);
    assert.match(route, /businessAnswer \?\? await answerTenantKnowledgeQuestionWithReasoning/);
  }
  assert.match(residentRoute, /transaction\\s\+history/);
  assert.match(residentRoute, /heads\?\|leads\?/);
  assert.match(residentRoute, /current HOA president/);
  assert.match(orchestrator, /Permission\.HOMEOWNERS_READ/);
  assert.match(orchestrator, /Permission\.PAYMENTS_READ/);
  assert.match(orchestrator, /Permission\.BILLING_READ/);
  assert.match(orchestrator, /Permission\.DOCUMENTS_READ/);
  assert.match(orchestrator, /Permission\.COMPLAINTS_MANAGE/);
  assert.match(orchestrator, /Permission\.PAYROLL_MANAGE/);
  assert.match(orchestrator, /Permission\.ATTENDANCE_MANAGE/);
  assert.match(orchestrator, /RESIDENT_OTHER_RECORDS_NOT_AUTHORIZED/);
  assert.match(orchestrator, /business-service-orchestrator/);
});
