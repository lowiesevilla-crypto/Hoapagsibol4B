import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Role } from "@prisma/client";
import { Permission } from "@/lib/authorization/permissions";
import { requireRepositoryPermission } from "@/lib/document-repository/access";
import { DOCUMENT_MANAGEMENT_FEATURE_CODE } from "@/lib/document-repository/constants";
import { resolveDocumentManagementEntitlement } from "@/lib/document-repository/entitlement";
import { platformPrisma, prisma } from "@/lib/db";
import { runWithTenant } from "@/lib/tenant-context";

const runId = `document-repository-it-${process.pid}`;
const tenantAId = `${runId}-tenant-a`;
const tenantBId = `${runId}-tenant-b`;
const planId = `${runId}-plan`;
const planCode = `${runId}-PLAN`;
const categoryAId = `${runId}-category-a`;
const categoryBId = `${runId}-category-b`;
const documentAId = `${runId}-document-a`;
const documentBId = `${runId}-document-b`;
const tagAId = `${runId}-tag-a`;
const tagBId = `${runId}-tag-b`;
const tenantIds = [tenantAId, tenantBId];

function inTenant<T>(
  tenantId: string,
  callback: () => T,
  permissions?: ReadonlySet<Permission>,
  role: Role = Role.HOA_ADMIN,
) {
  return runWithTenant(tenantId, callback, { role, permissions });
}

async function cleanFixtures() {
  await platformPrisma.repositoryDocumentTagAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.repositoryDocumentRevision.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.repositoryDocument.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.repositoryDocumentTag.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.repositoryDocumentCategory.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenantFeatureEntitlement.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.subscriptionPlanFeatureEntitlement.deleteMany({ where: { planId } });
  await platformPrisma.subscriptionPlan.deleteMany({ where: { id: planId } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

before(async () => {
  await cleanFixtures();

  await platformPrisma.subscriptionPlan.create({
    data: {
      id: planId,
      code: planCode,
      name: "Document Repository Integration Plan",
      active: true,
      maximumStorageMb: 1024,
    },
  });

  await platformPrisma.tenant.createMany({
    data: [
      { id: tenantAId, name: "Document Repository Tenant A", shortName: "DR-A", slug: `${runId}-a`, subscriptionPlan: planCode },
      { id: tenantBId, name: "Document Repository Tenant B", shortName: "DR-B", slug: `${runId}-b`, subscriptionPlan: planCode },
    ],
  });

  await platformPrisma.tenantSubscription.createMany({
    data: tenantIds.map((tenantId) => ({ tenantId, planId, status: "ACTIVE" })),
  });

  await platformPrisma.subscriptionPlanFeatureEntitlement.create({
    data: {
      planId,
      featureCode: DOCUMENT_MANAGEMENT_FEATURE_CODE,
      enabled: true,
      storageLimitMb: 512,
      maxFileSizeMb: 25,
      retainRevisionBinaries: true,
      maxRevisionBinaries: 5,
    },
  });

  await platformPrisma.tenantFeatureEntitlement.create({
    data: {
      tenantId: tenantBId,
      featureCode: DOCUMENT_MANAGEMENT_FEATURE_CODE,
      enabledOverride: false,
    },
  });

  await platformPrisma.repositoryDocumentCategory.createMany({
    data: [
      { id: categoryAId, tenantId: tenantAId, code: "BYLAWS", name: "Bylaws A", categoryGroup: "GOVERNANCE", active: true },
      { id: categoryBId, tenantId: tenantBId, code: "BYLAWS", name: "Bylaws B", categoryGroup: "GOVERNANCE", active: true },
    ],
  });

  await platformPrisma.repositoryDocument.createMany({
    data: [
      {
        id: documentAId,
        tenantId: tenantAId,
        categoryId: categoryAId,
        title: "Tenant A Bylaws",
        originalFileName: "tenant-a-bylaws.pdf",
        storageKey: `tenants/${runId}-a/documents/repository/2026/08/a.pdf`,
        contentType: "application/pdf",
        fileExtension: ".pdf",
        fileSizeBytes: BigInt(100),
        checksumSha256: "a".repeat(64),
        uploadedById: `${runId}-actor-a`,
      },
      {
        id: documentBId,
        tenantId: tenantBId,
        categoryId: categoryBId,
        title: "Tenant B Bylaws",
        originalFileName: "tenant-b-bylaws.pdf",
        storageKey: `tenants/${runId}-b/documents/repository/2026/08/b.pdf`,
        contentType: "application/pdf",
        fileExtension: ".pdf",
        fileSizeBytes: BigInt(200),
        checksumSha256: "b".repeat(64),
        uploadedById: `${runId}-actor-b`,
      },
    ],
  });

  await platformPrisma.repositoryDocumentTag.createMany({
    data: [
      { id: tagAId, tenantId: tenantAId, name: "Governance A" },
      { id: tagBId, tenantId: tenantBId, name: "Governance B" },
    ],
  });
});

after(async () => {
  await cleanFixtures();
});

test("repository queries automatically remain inside the active tenant boundary", async () => {
  await inTenant(tenantAId, async () => {
    const documents = await prisma.repositoryDocument.findMany({ orderBy: { title: "asc" } });
    assert.deepEqual(documents.map((document) => document.id), [documentAId]);

    const knownTenantBId = await prisma.repositoryDocument.findFirst({ where: { id: documentBId } });
    assert.equal(knownTenantBId, null);
  });
});

test("known cross-tenant repository IDs cannot be updated or deleted", async () => {
  await inTenant(tenantAId, async () => {
    await assert.rejects(
      () => prisma.repositoryDocument.update({ where: { id: documentBId }, data: { title: "Attacker overwrite" } }),
      /record|tenant|found|update/i,
    );
    await assert.rejects(
      () => prisma.repositoryDocument.delete({ where: { id: documentBId } }),
      /record|tenant|found|delete/i,
    );
  });

  const untouched = await platformPrisma.repositoryDocument.findUnique({ where: { id: documentBId }, select: { title: true } });
  assert.equal(untouched?.title, "Tenant B Bylaws");
});

test("cross-tenant category and tag relationships are rejected", async () => {
  await inTenant(tenantAId, async () => {
    await assert.rejects(
      () => prisma.repositoryDocument.create({
        data: {
          tenantId: tenantAId,
          categoryId: categoryBId,
          title: "Invalid Cross Tenant Category",
          originalFileName: "invalid.pdf",
          storageKey: `tenants/${runId}-a/documents/repository/2026/08/invalid.pdf`,
          contentType: "application/pdf",
          fileExtension: ".pdf",
          fileSizeBytes: BigInt(10),
          checksumSha256: "c".repeat(64),
          uploadedById: `${runId}-actor-a`,
        },
      }),
      /Cross-tenant|foreign key|relation/i,
    );

    await assert.rejects(
      () => prisma.repositoryDocumentTagAssignment.create({
        data: { tenantId: tenantAId, documentId: documentAId, tagId: tagBId },
      }),
      /Cross-tenant|foreign key|relation/i,
    );
  });
});

test("plan entitlement is inherited and tenant restriction can disable Document Management", async () => {
  await inTenant(tenantAId, async () => {
    const entitlement = await resolveDocumentManagementEntitlement();
    assert.equal(entitlement.enabled, true);
    assert.equal(entitlement.enabledSource, "PLAN");
    assert.equal(entitlement.storageLimitMb, 512);
    assert.equal(entitlement.maxFileSizeMb, 25);
    assert.equal(entitlement.retainRevisionBinaries, true);
    assert.equal(entitlement.maxRevisionBinaries, 5);
  });

  await inTenant(tenantBId, async () => {
    const entitlement = await resolveDocumentManagementEntitlement();
    assert.equal(entitlement.enabled, false);
    assert.equal(entitlement.enabledSource, "TENANT_OVERRIDE");
  });
});

test("tenant administrators cannot bypass a Platform Admin commercial restriction", async () => {
  await inTenant(
    tenantBId,
    async () => {
      await assert.rejects(
        () => requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_READ),
        /not included in this tenant subscription/i,
      );
    },
    new Set([Permission.DOCUMENT_REPOSITORY_READ]),
  );
});

test("staff repository permission cannot bypass a disabled tenant feature", async () => {
  await inTenant(
    tenantBId,
    async () => {
      await assert.rejects(
        () => requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_READ),
        /not included in this tenant subscription/i,
      );
    },
    new Set([Permission.DOCUMENT_REPOSITORY_READ]),
    Role.STAFF,
  );
});

test("non-platform entitlement lookup cannot switch to another tenant", async () => {
  await inTenant(tenantAId, async () => {
    await assert.rejects(() => resolveDocumentManagementEntitlement(tenantBId), /Cross-tenant entitlement lookup blocked/i);
  });
});
