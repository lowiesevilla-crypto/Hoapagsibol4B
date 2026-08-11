import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("resident and staff AI routes use the grounded reasoning orchestrator without browser tenant authority", async () => {
  const [residentRoute, staffRoute] = await Promise.all([
    readFile("app/api/portal/ai/ask/route.ts", "utf8"),
    readFile("app/api/admin/ai/ask/route.ts", "utf8"),
  ]);
  for (const route of [residentRoute, staffRoute]) {
    assert.match(route, /answerTenantKnowledgeQuestionWithReasoning/);
    assert.doesNotMatch(route, /body\.tenantId/);
    assert.match(route, /private, no-store/);
  }
});

test("grounded reasoning reauthorizes retrieved provider evidence against tenant document state before synthesis", async () => {
  const orchestrator = await readFile("lib/ai-assistance/reasoning-assistant.ts", "utf8");
  assert.match(orchestrator, /requireAiRuntimeAccess/);
  assert.match(orchestrator, /assertKnowledgeQuestionIsMinimized/);
  assert.match(orchestrator, /roleSnapshotForRoles/);
  assert.match(orchestrator, /tenantId:\s*input\.tenantId/);
  assert.match(orchestrator, /vectorStoreId:\s*input\.vectorStoreId/);
  assert.match(orchestrator, /providerFileId:\s*\{\s*in:\s*fileIds/);
  assert.match(orchestrator, /indexStatus:\s*"INDEXED"/);
  assert.match(orchestrator, /aiEnabled:\s*true/);
  assert.match(orchestrator, /status:\s*"PUBLISHED"/);
  assert.match(orchestrator, /binding\.indexedChecksumSha256 !== document\.checksumSha256/);
  assert.match(orchestrator, /NO_AUTHORIZED_REASONING_EVIDENCE/);
});

test("reasoning retrieval combines semantic retrieval, lexical reranking, source diversity, and conflict-safe synthesis", async () => {
  const [orchestrator, provider] = await Promise.all([
    readFile("lib/ai-assistance/reasoning-assistant.ts", "utf8"),
    readFile("lib/ai-assistance/reasoning-provider.ts", "utf8"),
  ]);
  assert.match(provider, /\/vector_stores\/\$\{encodeURIComponent\(input\.vectorStoreId\)\}\/search/);
  assert.match(provider, /filters:\s*\{\s*type:\s*"in",\s*key:\s*"audience"/);
  assert.match(provider, /rewrite_query:\s*true/);
  assert.match(provider, /score_threshold:\s*0\.08/);
  assert.match(orchestrator, /semantic \* 0\.62 \+ lexical \* 0\.28/);
  assert.match(orchestrator, /count >= 2/);
  assert.match(orchestrator, /selected\.length >= 8/);
  assert.match(provider, /If current sources conflict, say that they conflict/);
  assert.match(provider, /Do not invent legal precedence/);
  assert.match(provider, /explicit supersession or replacement statement/);
  assert.match(provider, /store:\s*false/);
});

test("reasoning answers retain evidence-level locators and index metadata needed for future source ranking", async () => {
  const [orchestrator, providerIndex] = await Promise.all([
    readFile("lib/ai-assistance/reasoning-assistant.ts", "utf8"),
    readFile("lib/ai-assistance/provider-index.ts", "utf8"),
  ]);
  assert.match(orchestrator, /locatorFromText/);
  assert.match(orchestrator, /excerpt:\s*item\.text\.slice/);
  assert.match(orchestrator, /confidence:\s*Number/);
  assert.match(providerIndex, /INDEX_METADATA_VERSION = 2/);
  assert.match(providerIndex, /document_id:/);
  assert.match(providerIndex, /document_reference:/);
  assert.match(providerIndex, /category:/);
  assert.match(providerIndex, /effective_at:/);
  assert.match(providerIndex, /authority_priority:/);
  assert.match(providerIndex, /updateProviderFileAttributes/);
});
