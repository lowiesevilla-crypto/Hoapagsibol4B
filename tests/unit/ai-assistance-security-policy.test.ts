import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { evaluateAiGovernance } from "@/lib/ai-assistance/governance-policy";
import { assertKnowledgeQuestionIsMinimized, normalizeAiQuestion, redactAiContentForAudit } from "@/lib/ai-assistance/privacy";

const approved = new Date("2026-08-10T00:00:00.000Z");
const readyGovernance = {
  runtimeEnabled: true,
  residentAssistantEnabled: true,
  staffCopilotEnabled: true,
  boardApprovedAt: approved,
  piaApprovedAt: approved,
  dpoApprovedAt: approved,
  providerApprovedAt: approved,
  crossBorderReviewApprovedAt: approved,
  privacyNoticeVersion: "AI-PRIVACY-v1",
  privacyNoticePublishedAt: approved,
  lawfulBasis: "Approved lawful-basis reference",
  retentionDays: 30,
};

test("AI runtime fails closed unless every commercial, privacy and governance gate is present", () => {
  assert.equal(evaluateAiGovernance({ globalRuntimeEnabled: true, commerciallyEnabled: true, experience: "RESIDENT", governance: readyGovernance }).allowed, true);
  assert.equal(evaluateAiGovernance({ globalRuntimeEnabled: false, commerciallyEnabled: true, experience: "RESIDENT", governance: readyGovernance }).reason, "GLOBAL_AI_KILL_SWITCH");
  assert.equal(evaluateAiGovernance({ globalRuntimeEnabled: true, commerciallyEnabled: false, experience: "RESIDENT", governance: readyGovernance }).reason, "AI_NOT_ENTITLED");
  for (const [field, reason] of [
    ["boardApprovedAt", "BOARD_APPROVAL_REQUIRED"],
    ["piaApprovedAt", "PIA_APPROVAL_REQUIRED"],
    ["dpoApprovedAt", "DPO_APPROVAL_REQUIRED"],
    ["providerApprovedAt", "PROVIDER_APPROVAL_REQUIRED"],
    ["crossBorderReviewApprovedAt", "CROSS_BORDER_REVIEW_REQUIRED"],
    ["privacyNoticePublishedAt", "PRIVACY_NOTICE_REQUIRED"],
    ["lawfulBasis", "LAWFUL_BASIS_REQUIRED"],
  ] as const) {
    const governance = { ...readyGovernance, [field]: null };
    assert.equal(evaluateAiGovernance({ globalRuntimeEnabled: true, commerciallyEnabled: true, experience: "RESIDENT", governance }).reason, reason);
  }
});

test("resident knowledge questions reject unnecessary personal identifiers and secrets before provider use", () => {
  assert.equal(assertKnowledgeQuestionIsMinimized(normalizeAiQuestion("What is our parking policy?")), "What is our parking policy?");
  assert.throws(() => assertKnowledgeQuestionIsMinimized("My email is resident@example.com; what is the policy?"), /personal identifiers/i);
  assert.throws(() => assertKnowledgeQuestionIsMinimized("My phone is 09171234567; what is the policy?"), /personal identifiers/i);
  assert.throws(() => assertKnowledgeQuestionIsMinimized("api_key=sk-this-is-a-secret-token-value"), /passwords, API keys, or secrets/i);
  assert.match(redactAiContentForAudit("resident@example.com 09171234567"), /REDACTED_EMAIL/);
  assert.doesNotMatch(redactAiContentForAudit("resident@example.com 09171234567"), /resident@example\.com|09171234567/);
});

test("OpenAI gateway uses server-only Responses file search, no provider storage, and pre-model audience filtering", async () => {
  const provider = await readFile("lib/ai-assistance/provider.ts", "utf8");
  assert.match(provider, /import "server-only"/);
  assert.match(provider, /process\.env\.OPENAI_API_KEY/);
  assert.match(provider, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(provider, /store:\s*false/);
  assert.match(provider, /type:\s*"file_search"/);
  assert.match(provider, /filters:\s*\{\s*type:\s*"in",\s*key:\s*"audience"/);
  assert.doesNotMatch(provider, /NEXT_PUBLIC_OPENAI/);
});

test("resident ask route never accepts browser tenant authority and disables caching", async () => {
  const route = await readFile("app/api/portal/ai/ask/route.ts", "utf8");
  assert.match(route, /answerTenantKnowledgeQuestion/);
  assert.doesNotMatch(route, /body\.tenantId/);
  assert.match(route, /private, no-store/);
  assert.match(route, /X-Content-Type-Options/);
});

test("AI knowledge management is delegated separately from tenant AI governance", async () => {
  const [knowledgeActions, knowledgePage, roleAccess, adminLayout] = await Promise.all([
    readFile("lib/actions/ai-knowledge.ts", "utf8"),
    readFile("app/admin/ai-assistance/knowledge/page.tsx", "utf8"),
    readFile("lib/role-access.ts", "utf8"),
    readFile("app/admin/layout.tsx", "utf8"),
  ]);
  assert.match(knowledgeActions, /requireAiKnowledgeManager\(\);\s*const documentId = clean\(formData\.get\("documentId"\)\);/);
  assert.match(knowledgePage, /Permission\.AI_KNOWLEDGE_MANAGE/);
  assert.match(roleAccess, /\["\/admin\/ai-assistance\/knowledge", Permission\.AI_KNOWLEDGE_MANAGE\]/);
  assert.match(roleAccess, /\["\/admin\/ai-assistance", Permission\.AI_ASSISTANCE_MANAGE\]/);
  assert.ok(roleAccess.indexOf("/admin/ai-assistance/knowledge") < roleAccess.indexOf("/admin/ai-assistance\", Permission.AI_ASSISTANCE_MANAGE"));
  assert.match(adminLayout, /canManageAiKnowledge/);
  assert.match(adminLayout, /pathname\.startsWith\("\/admin\/ai-assistance\/knowledge"\)/);
});

test("AI answers expose feedback capture, out-of-scope human-authority guard, and receipt deep links", async () => {
  const [assistant, feedbackAction, knowledgeAssistant] = await Promise.all([
    readFile("components/ai/resident-ai-assistant.tsx", "utf8"),
    readFile("lib/actions/ai-feedback.ts", "utf8"),
    readFile("lib/ai-assistance/knowledge-assistant.ts", "utf8"),
  ]);
  assert.match(assistant, /submitAiFeedbackAction/);
  assert.match(assistant, /Was this helpful\?/);
  assert.match(assistant, /directions outside HOAHub/);
  assert.match(feedbackAction, /prisma\.aiFeedback\.create/);
  assert.match(feedbackAction, /requestId, actorId: user\.id/);
  assert.match(knowledgeAssistant, /\/receipts\/payment\/\$\{payment\.id\}/);
  assert.match(knowledgeAssistant, /\/receipts\/collection\/\$\{item\.id\}/);
});

test("repository lifecycle purges provider knowledge before replace, access-boundary changes and permanent delete", async () => {
  const [replace, update, remove] = await Promise.all([
    readFile("lib/document-repository/replace.ts", "utf8"),
    readFile("lib/document-repository/update.ts", "utf8"),
    readFile("lib/document-repository/delete.ts", "utf8"),
  ]);
  assert.match(replace, /purgeAiKnowledgeBindingForTenant/);
  assert.match(update, /purgeAiKnowledgeBindingForTenant/);
  assert.match(remove, /purgeAiKnowledgeBindingForTenant/);
});
