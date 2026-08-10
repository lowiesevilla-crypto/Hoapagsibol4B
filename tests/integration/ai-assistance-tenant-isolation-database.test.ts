import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Role } from "@prisma/client";
import { platformPrisma, prisma } from "@/lib/db";
import { runWithTenant } from "@/lib/tenant-context";

const runId = `ai-isolation-it-${process.pid}`;
const tenantAId = `${runId}-tenant-a`;
const tenantBId = `${runId}-tenant-b`;
const actorAId = `${runId}-actor-a`;
const actorBId = `${runId}-actor-b`;
const conversationAId = `${runId}-conversation-a`;
const conversationBId = `${runId}-conversation-b`;
const documentAId = `${runId}-document-a`;
const documentBId = `${runId}-document-b`;
const categoryAId = `${runId}-category-a`;
const categoryBId = `${runId}-category-b`;

function inTenant<T>(tenantId: string, callback: () => T) {
  return runWithTenant(tenantId, callback, { role: Role.HOA_ADMIN });
}

async function cleanup() {
  await platformPrisma.aiMessage.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await platformPrisma.aiConversation.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await platformPrisma.aiUsageLedger.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await platformPrisma.aiKnowledgeBinding.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await platformPrisma.tenantAiProviderIndex.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await platformPrisma.repositoryDocument.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await platformPrisma.repositoryDocumentCategory.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await platformPrisma.user.deleteMany({ where: { id: { in: [actorAId, actorBId] } } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
}

before(async () => {
  await cleanup();
  await platformPrisma.tenant.createMany({ data: [
    { id: tenantAId, name: "AI Isolation Tenant A", shortName: "AI-A", slug: `${runId}-a`, subscriptionPlan: "E2E" },
    { id: tenantBId, name: "AI Isolation Tenant B", shortName: "AI-B", slug: `${runId}-b`, subscriptionPlan: "E2E" },
  ] });
  await platformPrisma.user.createMany({ data: [
    { id: actorAId, tenantId: tenantAId, email: `${runId}-a@example.invalid`, name: "Tenant A Actor", passwordHash: "not-used", role: Role.HOMEOWNER, active: true },
    { id: actorBId, tenantId: tenantBId, email: `${runId}-b@example.invalid`, name: "Tenant B Actor", passwordHash: "not-used", role: Role.HOMEOWNER, active: true },
  ] });
  await platformPrisma.repositoryDocumentCategory.createMany({ data: [
    { id: categoryAId, tenantId: tenantAId, code: "AI_POLICY_A", name: "AI Policy A", categoryGroup: "POLICIES" },
    { id: categoryBId, tenantId: tenantBId, code: "AI_POLICY_B", name: "AI Policy B", categoryGroup: "POLICIES" },
  ] });
  await platformPrisma.repositoryDocument.createMany({ data: [
    { id: documentAId, tenantId: tenantAId, categoryId: categoryAId, title: "Tenant A Policy", visibility: "TENANT_PUBLIC", status: "PUBLISHED", originalFileName: "a.txt", storageKey: `tenants/${runId}-a/documents/a.txt`, contentType: "text/plain", fileExtension: "txt", fileSizeBytes: 10, checksumSha256: "a".repeat(64), aiEnabled: true, privacyClassification: "PUBLIC", uploadedById: actorAId },
    { id: documentBId, tenantId: tenantBId, categoryId: categoryBId, title: "Tenant B Secret Policy", visibility: "TENANT_PUBLIC", status: "PUBLISHED", originalFileName: "b.txt", storageKey: `tenants/${runId}-b/documents/b.txt`, contentType: "text/plain", fileExtension: "txt", fileSizeBytes: 10, checksumSha256: "b".repeat(64), aiEnabled: true, privacyClassification: "PUBLIC", uploadedById: actorBId },
  ] });
  await platformPrisma.tenantAiProviderIndex.createMany({ data: [
    { tenantId: tenantAId, vectorStoreId: `${runId}-vs-a` },
    { tenantId: tenantBId, vectorStoreId: `${runId}-vs-b` },
  ] });
  await platformPrisma.aiKnowledgeBinding.createMany({ data: [
    { tenantId: tenantAId, documentId: documentAId, revision: 1, providerFileId: `${runId}-file-a`, vectorStoreId: `${runId}-vs-a`, indexStatus: "INDEXED", indexedChecksumSha256: "a".repeat(64) },
    { tenantId: tenantBId, documentId: documentBId, revision: 1, providerFileId: `${runId}-file-b`, vectorStoreId: `${runId}-vs-b`, indexStatus: "INDEXED", indexedChecksumSha256: "b".repeat(64) },
  ] });
  await platformPrisma.aiConversation.createMany({ data: [
    { id: conversationAId, tenantId: tenantAId, actorId: actorAId, actorRole: "HOMEOWNER", expiresAt: new Date(Date.now() + 60_000) },
    { id: conversationBId, tenantId: tenantBId, actorId: actorBId, actorRole: "HOMEOWNER", expiresAt: new Date(Date.now() + 60_000) },
  ] });
  await platformPrisma.aiUsageLedger.createMany({ data: [
    { tenantId: tenantAId, actorId: actorAId, requestId: `${runId}-request-a`, outcome: "SUCCEEDED", inputTokens: 10, outputTokens: 20 },
    { tenantId: tenantBId, actorId: actorBId, requestId: `${runId}-request-b`, outcome: "SUCCEEDED", inputTokens: 30, outputTokens: 40 },
  ] });
});

after(cleanup);

test("known foreign AI conversation ID is invisible inside the active tenant", async () => {
  await inTenant(tenantAId, async () => {
    assert.equal(await prisma.aiConversation.findFirst({ where: { tenantId: tenantAId, id: conversationBId } }), null);
    assert.equal(await prisma.aiConversation.count({ where: { id: conversationBId } }), 0);
  });
});

test("AI knowledge binding and source-document reads cannot cross tenant context", async () => {
  await inTenant(tenantAId, async () => {
    assert.equal(await prisma.aiKnowledgeBinding.count({ where: { documentId: documentBId } }), 0);
    assert.equal(await prisma.repositoryDocument.count({ where: { id: documentBId } }), 0);
    const own = await prisma.aiKnowledgeBinding.findFirst({ where: { tenantId: tenantAId, documentId: documentAId } });
    assert.equal(own?.vectorStoreId, `${runId}-vs-a`);
  });
});

test("database composite relation rejects a tenant A AI binding to tenant B document", async () => {
  await assert.rejects(
    () => platformPrisma.aiKnowledgeBinding.create({
      data: {
        tenantId: tenantAId,
        documentId: documentBId,
        revision: 1,
        providerFileId: `${runId}-cross-file`,
        vectorStoreId: `${runId}-vs-a`,
        indexStatus: "INDEXED",
        indexedChecksumSha256: "b".repeat(64),
      },
    }),
    /foreign key|constraint/i,
  );
});

test("tenant B usage cannot be aggregated into tenant A commercial quota", async () => {
  await inTenant(tenantAId, async () => {
    const usage = await prisma.aiUsageLedger.aggregate({ where: { tenantId: tenantAId }, _sum: { inputTokens: true, outputTokens: true }, _count: { _all: true } });
    assert.equal(usage._count._all, 1);
    assert.equal(usage._sum.inputTokens, 10);
    assert.equal(usage._sum.outputTokens, 20);
  });
});

test("provider retrieval namespace cannot be reused across tenants", async () => {
  await assert.rejects(
    () => platformPrisma.tenantAiProviderIndex.create({ data: { tenantId: `${runId}-tenant-c`, vectorStoreId: `${runId}-vs-a` } }),
    /unique|constraint/i,
  );
});

test("expired AI conversation retention purge remains tenant-scoped", async () => {
  const expiredAId = `${runId}-expired-a`;
  const expiredBId = `${runId}-expired-b`;
  const expiredAt = new Date(Date.now() - 60_000);
  await platformPrisma.aiConversation.createMany({ data: [
    { id: expiredAId, tenantId: tenantAId, actorId: actorAId, actorRole: "HOMEOWNER", expiresAt: expiredAt },
    { id: expiredBId, tenantId: tenantBId, actorId: actorBId, actorRole: "HOMEOWNER", expiresAt: expiredAt },
  ] });

  await inTenant(tenantAId, async () => {
    const purged = await prisma.aiConversation.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    assert.equal(purged.count, 1);
  });
  assert.equal(await platformPrisma.aiConversation.count({ where: { tenantId: tenantAId, id: expiredAId } }), 0);
  assert.equal(await platformPrisma.aiConversation.count({ where: { tenantId: tenantBId, id: expiredBId } }), 1);
});
