import { Permission } from "@/lib/authorization/permissions";
import { requireDocumentManagementEntitlement, requireRepositoryPermission } from "@/lib/document-repository/access";
import { evaluateRepositoryQuota } from "@/lib/document-repository/quota";
import { prisma } from "@/lib/db";

export type RepositoryStorageUsage = {
  currentDocumentBytes: bigint;
  retainedRevisionBytes: bigint;
  totalBytes: bigint;
  documentCount: number;
};

async function calculateActiveTenantRepositoryUsage(): Promise<RepositoryStorageUsage> {
  const { context } = await requireDocumentManagementEntitlement();

  const [documents, revisions] = await Promise.all([
    prisma.repositoryDocument.aggregate({
      where: { tenantId: context.tenantId },
      _sum: { fileSizeBytes: true },
      _count: { _all: true },
    }),
    prisma.repositoryDocumentRevision.aggregate({
      where: { tenantId: context.tenantId, storageKey: { not: null } },
      _sum: { fileSizeBytes: true },
    }),
  ]);

  const currentDocumentBytes = documents._sum.fileSizeBytes ?? BigInt(0);
  const retainedRevisionBytes = revisions._sum.fileSizeBytes ?? BigInt(0);

  return {
    currentDocumentBytes,
    retainedRevisionBytes,
    totalBytes: currentDocumentBytes + retainedRevisionBytes,
    documentCount: documents._count._all,
  };
}

/** Internal write-path helper. Entitlement is required, but storage-read UI permission is not. */
export async function repositoryUsageForWriteGuard() {
  return calculateActiveTenantRepositoryUsage();
}

/** Administrative usage view for dashboards and quota UI. */
export async function getRepositoryStorageUsage() {
  const { entitlement } = await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_STORAGE_READ);
  const usage = await calculateActiveTenantRepositoryUsage();
  return {
    ...usage,
    quota: evaluateRepositoryQuota({
      usedBytes: usage.totalBytes,
      maximumStorageMb: entitlement.storageLimitMb,
    }),
  };
}
