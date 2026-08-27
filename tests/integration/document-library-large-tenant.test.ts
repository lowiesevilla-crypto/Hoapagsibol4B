import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  AiPrivacyClassification,
  Prisma,
  RepositoryDocumentRevisionPolicy,
  RepositoryDocumentStatus,
  RepositoryDocumentVisibility,
  RepositoryMalwareScanStatus,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { repositoryDocumentWhere } from "@/lib/document-repository/repository";

const runId = `document-library-scale-it-${process.pid}`;
const tenantAId = `${runId}-tenant-a`;
const tenantBId = `${runId}-tenant-b`;
const categoryAId = `${runId}-category-a`;
const categoryBId = `${runId}-category-b`;
const fixtureCount = 5_001;
const pageSize = 25;

function documentId(index: number) { return `${runId}-document-${String(index).padStart(4, "0")}`; }

async function cleanFixtures() {
  await platformPrisma.repositoryDocument.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await platformPrisma.repositoryDocumentCategory.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
}

before(async () => {
  await cleanFixtures();
  await platformPrisma.tenant.createMany({ data: [
    { id: tenantAId, name: "Document Library Scale HOA A", shortName: "DLS-A", slug: `${runId}-a` },
    { id: tenantBId, name: "Document Library Scale HOA B", shortName: "DLS-B", slug: `${runId}-b` },
  ] });
  await platformPrisma.repositoryDocumentCategory.createMany({ data: [
    { id: categoryAId, tenantId: tenantAId, code: "POLICY", name: "Policies", categoryGroup: "GOVERNANCE" },
    { id: categoryBId, tenantId: tenantBId, code: "POLICY", name: "Policies", categoryGroup: "GOVERNANCE" },
  ] });

  const documents: Prisma.RepositoryDocumentCreateManyInput[] = Array.from({ length: fixtureCount }, (_, offset) => {
    const index = offset + 1;
    const value = String(index).padStart(4, "0");
    return {
      id: documentId(index), tenantId: tenantAId, categoryId: categoryAId,
      title: `Scale Policy ${value}`, description: index === fixtureCount ? "Beyond First N governed policy" : "Scale policy fixture",
      documentReference: `POL-${value}`, visibility: RepositoryDocumentVisibility.INTERNAL,
      status: RepositoryDocumentStatus.DRAFT, currentRevision: 1,
      revisionPolicy: RepositoryDocumentRevisionPolicy.REPLACE_CURRENT,
      originalFileName: `scale-policy-${value}.pdf`, storageKey: `${runId}/scale-policy-${value}.pdf`,
      contentType: "application/pdf", fileExtension: ".pdf", fileSizeBytes: BigInt(1024),
      checksumSha256: index.toString(16).padStart(64, "0"), malwareScanStatus: RepositoryMalwareScanStatus.PASSED,
      aiEnabled: false, privacyClassification: AiPrivacyClassification.INTERNAL,
      searchableKeywords: index === fixtureCount ? "beyond-first-n" : "scale-policy",
      uploadedById: `${runId}-fixture-actor`, updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
    };
  });
  for (let offset = 0; offset < fixtureCount; offset += 500) await platformPrisma.repositoryDocument.createMany({ data: documents.slice(offset, offset + 500) });
});

after(async () => { await cleanFixtures(); await platformPrisma.$disconnect(); });

test("5,001-document repository keeps last-page queries bounded", async () => {
  const startedAt = performance.now();
  const rows = await platformPrisma.repositoryDocument.findMany({
    where: repositoryDocumentWhere(tenantAId), orderBy: [{ updatedAt: "asc" }, { title: "asc" }],
    skip: 5_000, take: pageSize, select: { id: true, tenantId: true },
  });
  assert.deepEqual(rows, [{ id: documentId(5_001), tenantId: tenantAId }]);
  assert.ok(performance.now() - startedAt < 15_000, "Bounded document-library last-page query exceeded 15 seconds in CI.");
});

test("document search finds record 5,001 and denies a forged tenant scope", async () => {
  const [allowed, denied] = await Promise.all([
    platformPrisma.repositoryDocument.findMany({ where: repositoryDocumentWhere(tenantAId, { search: "beyond-first-n" }), take: pageSize, select: { id: true } }),
    platformPrisma.repositoryDocument.findMany({ where: repositoryDocumentWhere(tenantBId, { search: "beyond-first-n" }), take: pageSize, select: { id: true } }),
  ]);
  assert.deepEqual(allowed, [{ id: documentId(5_001) }]);
  assert.deepEqual(denied, []);
});

test("document filters remain bounded and tenant scoped at scale", async () => {
  const [total, page, otherTenantTotal] = await Promise.all([
    platformPrisma.repositoryDocument.count({ where: repositoryDocumentWhere(tenantAId, { categoryId: categoryAId, status: RepositoryDocumentStatus.DRAFT, visibility: RepositoryDocumentVisibility.INTERNAL }) }),
    platformPrisma.repositoryDocument.findMany({ where: repositoryDocumentWhere(tenantAId, { categoryId: categoryAId }), take: pageSize, select: { id: true } }),
    platformPrisma.repositoryDocument.count({ where: repositoryDocumentWhere(tenantBId, { categoryId: categoryAId }) }),
  ]);
  assert.equal(total, fixtureCount);
  assert.equal(page.length, pageSize);
  assert.equal(otherTenantTotal, 0);
});
