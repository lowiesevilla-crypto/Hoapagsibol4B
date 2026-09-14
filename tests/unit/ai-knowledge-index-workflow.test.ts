import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AI knowledge setup exposes a safe tenant-scoped validation-to-index path", async () => {
  const [actions, knowledgePage, governancePage, replace] = await Promise.all([
    readFile("lib/actions/ai-knowledge.ts", "utf8"),
    readFile("app/admin/ai-assistance/knowledge/page.tsx", "utf8"),
    readFile("app/admin/ai-assistance/page.tsx", "utf8"),
    readFile("lib/document-repository/replace.ts", "utf8"),
  ]);

  assert.match(actions, /recordDocumentMalwareValidationAction/);
  assert.match(actions, /validationConfirmed/);
  assert.match(actions, /evidenceReference/);
  assert.match(actions, /RepositoryMalwareScanStatus\.PASSED/);
  assert.match(actions, /where:\s*\{ tenantId: user\.tenantId, id: documentId \}/);
  assert.match(actions, /tenantId_id:\s*\{ tenantId: user\.tenantId, id: document\.id \}/);
  assert.match(actions, /AI_DOCUMENT_MALWARE_VALIDATION_RECORDED/);
  assert.match(actions, /if \(result !== RepositoryMalwareScanStatus\.PASSED\) await purgeRepositoryDocumentFromAi/);

  assert.match(knowledgePage, /How a document becomes AI knowledge/);
  assert.match(knowledgePage, /recordDocumentMalwareValidationAction/);
  assert.match(knowledgePage, /Index blocked/);
  assert.match(knowledgePage, /Record malware-validation evidence/);
  assert.match(knowledgePage, /does not pretend that HOAHub performed an antivirus scan/);
  assert.match(knowledgePage, /Current state:/);

  assert.match(governancePage, /const runtimeReady = entitlement\.enabled && globalRuntimeEnabled && providerConfigured && Boolean\(configuration\?\.runtimeEnabled\) && tenantGovernanceReady;/);
  assert.match(governancePage, /const knowledgeReady = indexedCount > 0;/);
  assert.match(governancePage, /Runtime readiness is separate from tenant knowledge indexing/);
  assert.match(governancePage, /No validated indexed knowledge yet/);
  assert.doesNotMatch(governancePage, /const runtimeReady[^;]*indexedCount/);

  assert.match(replace, /malwareScanStatus:\s*"NOT_CONFIGURED"/);
});
