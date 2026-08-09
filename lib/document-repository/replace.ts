import "server-only";

import { Permission } from "@/lib/authorization/permissions";
import { requireUser } from "@/lib/auth";
import { requireRepositoryPermission } from "@/lib/document-repository/access";
import { REPOSITORY_AUDIT_MODULE, RepositoryAuditAction } from "@/lib/document-repository/constants";
import { entitlementMaxFileBytes } from "@/lib/document-repository/entitlement";
import { assertRepositoryQuota } from "@/lib/document-repository/quota";
import { repositoryStorage } from "@/lib/document-repository/storage";
import { repositoryUsageForWriteGuard } from "@/lib/document-repository/usage";
import { validateRepositoryUpload } from "@/lib/document-repository/validation";
import { prisma } from "@/lib/db";

export type ReplaceRepositoryDocumentInput = {
  documentId: string;
  reason?: string | null;
  revisionLabel?: string | null;
  file: {
    originalFileName: string;
    contentType: string;
    data: Uint8Array;
  };
};

function required(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) throw new Error(`${label} must not exceed ${maxLength} characters.`);
  return normalized;
}

function optional(value: string | null | undefined, maxLength: number) {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new Error(`Revision metadata must not exceed ${maxLength} characters.`);
  return normalized;
}

async function enforceHistoricalBinaryLimit(input: {
  tenantId: string;
  tenantSlug: string;
  documentId: string;
  maximum: number | null;
  actorId: string;
}) {
  if (input.maximum == null) return;
  const retained = await prisma.repositoryDocumentRevision.findMany({
    where: { tenantId: input.tenantId, documentId: input.documentId, storageKey: { not: null } },
    orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
    select: { id: true, revision: true, storageKey: true, fileSizeBytes: true },
  });
  const excess = retained.slice(input.maximum);
  for (const revision of excess) {
    if (!revision.storageKey) continue;
    try {
      await repositoryStorage.delete({ tenantSlug: input.tenantSlug, storageKey: revision.storageKey });
    } catch (error) {
      // Keep the database pointer intact so cleanup remains retryable and the
      // repository usage calculation continues counting the retained binary.
      console.error("[document-repository] Failed to purge excess retained revision binary.", {
        tenantId: input.tenantId,
        documentId: input.documentId,
        revision: revision.revision,
        error,
      });
      continue;
    }
    await prisma.repositoryDocumentRevision.update({
      where: { tenantId_id: { tenantId: input.tenantId, id: revision.id } },
      data: { storageKey: null },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        module: REPOSITORY_AUDIT_MODULE,
        action: RepositoryAuditAction.REVISION_BINARY_PURGED,
        entityType: "RepositoryDocument",
        entityId: input.documentId,
        metadata: {
          revision: revision.revision,
          fileSizeBytes: revision.fileSizeBytes.toString(),
          reason: "PLAN_REVISION_RETENTION_LIMIT",
        },
        aiAction: false,
      },
    });
  }
}

/**
 * Replaces the current binary while preserving document identity and controlled
 * revision lineage. The authenticated tenant is authoritative; documentId is
 * reloaded inside that tenant before any storage operation.
 */
export async function replaceRepositoryDocument(input: ReplaceRepositoryDocumentInput) {
  const actor = await requireUser();
  const { context, entitlement } = await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_REPLACE);
  const documentId = required(input.documentId, "Document ID", 191);

  const document = await prisma.repositoryDocument.findFirst({
    where: { tenantId: context.tenantId, id: documentId },
    include: { category: { select: { code: true, name: true, governanceControlled: true } } },
  });
  if (!document) throw new Error("Repository document not found in the active tenant.");
  if (document.status === "PUBLISHED") {
    await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_PUBLISH);
  }

  const reason = optional(input.reason, 1000);
  if ((document.category.governanceControlled || document.revisionPolicy === "KEEP_HISTORY") && !reason) {
    throw new Error("A revision reason is required for governed documents.");
  }
  const revisionLabel = optional(input.revisionLabel, 60);

  const validation = validateRepositoryUpload({
    originalFileName: input.file.originalFileName,
    contentType: input.file.contentType,
    size: input.file.data.byteLength,
    data: input.file.data,
    maxFileBytes: entitlementMaxFileBytes(entitlement),
  });
  if (!validation.checksumSha256) throw new Error("Document checksum could not be generated.");
  if (validation.checksumSha256 === document.checksumSha256) {
    throw new Error("The replacement file is identical to the current document.");
  }

  const retainOldBinary = document.revisionPolicy === "KEEP_HISTORY" && entitlement.retainRevisionBinaries;
  const usage = await repositoryUsageForWriteGuard();
  const baseUsedBytes = retainOldBinary
    ? usage.totalBytes
    : usage.totalBytes > document.fileSizeBytes
      ? usage.totalBytes - document.fileSizeBytes
      : BigInt(0);
  assertRepositoryQuota({
    usedBytes: baseUsedBytes,
    maximumStorageMb: entitlement.storageLimitMb,
    requestedBytes: input.file.data.byteLength,
  });

  const stored = await repositoryStorage.put({
    tenantSlug: actor.tenant.slug,
    originalFileName: input.file.originalFileName,
    data: input.file.data,
  });

  const previousStorageKey = document.storageKey;
  const previousRevision = document.currentRevision;
  const nextRevision = previousRevision + 1;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.repositoryDocumentRevision.create({
        data: {
          tenantId: context.tenantId,
          documentId: document.id,
          revision: previousRevision,
          revisionLabel: revisionLabel || `Rev ${previousRevision}`,
          originalFileName: document.originalFileName,
          storageKey: retainOldBinary ? document.storageKey : null,
          contentType: document.contentType,
          fileExtension: document.fileExtension,
          fileSizeBytes: document.fileSizeBytes,
          checksumSha256: document.checksumSha256,
          malwareScanStatus: document.malwareScanStatus,
          reason,
          createdById: actor.id,
        },
      });

      const current = await tx.repositoryDocument.update({
        where: { tenantId_id: { tenantId: context.tenantId, id: document.id } },
        data: {
          currentRevision: nextRevision,
          originalFileName: input.file.originalFileName.trim(),
          storageKey: stored.storageKey,
          contentType: validation.normalizedContentType,
          fileExtension: validation.extension,
          fileSizeBytes: BigInt(stored.size),
          checksumSha256: validation.checksumSha256,
          malwareScanStatus: "NOT_CONFIGURED",
          updatedById: actor.id,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorId: actor.id,
          module: REPOSITORY_AUDIT_MODULE,
          action: RepositoryAuditAction.REVISION_CREATED,
          entityType: "RepositoryDocument",
          entityId: document.id,
          reason,
          metadata: {
            categoryCode: document.category.code,
            governanceControlled: document.category.governanceControlled,
            previousRevision,
            newRevision: nextRevision,
            historicalBinaryRetained: retainOldBinary,
            previousFileName: document.originalFileName,
            previousChecksumSha256: document.checksumSha256,
          },
          aiAction: false,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorId: actor.id,
          module: REPOSITORY_AUDIT_MODULE,
          action: RepositoryAuditAction.REPLACED,
          entityType: "RepositoryDocument",
          entityId: document.id,
          reason,
          metadata: {
            fromRevision: previousRevision,
            toRevision: nextRevision,
            previousFileName: document.originalFileName,
            newFileName: current.originalFileName,
            previousFileSizeBytes: document.fileSizeBytes.toString(),
            newFileSizeBytes: current.fileSizeBytes.toString(),
            previousChecksumSha256: document.checksumSha256,
            newChecksumSha256: current.checksumSha256,
            historicalBinaryRetained: retainOldBinary,
          },
          aiAction: false,
        },
      });

      return current;
    });

    if (!retainOldBinary) {
      try {
        await repositoryStorage.delete({ tenantSlug: actor.tenant.slug, storageKey: previousStorageKey });
      } catch (error) {
        console.error("[document-repository] Failed to remove superseded repository binary.", {
          tenantId: context.tenantId,
          documentId: document.id,
          previousRevision,
          error,
        });
      }
    }

    if (retainOldBinary) {
      await enforceHistoricalBinaryLimit({
        tenantId: context.tenantId,
        tenantSlug: actor.tenant.slug,
        documentId: document.id,
        maximum: entitlement.maxRevisionBinaries,
        actorId: actor.id,
      });
    }

    return updated;
  } catch (error) {
    await repositoryStorage.delete({ tenantSlug: actor.tenant.slug, storageKey: stored.storageKey }).catch((cleanupError) => {
      console.error("[document-repository] Failed to remove replacement binary after transaction failure.", { cleanupError });
    });
    throw error;
  }
}
