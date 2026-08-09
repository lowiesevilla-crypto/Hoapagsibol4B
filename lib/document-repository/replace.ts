import "server-only";

import { Permission } from "@/lib/authorization/permissions";
import { requireUser } from "@/lib/auth";
import { requireRepositoryPermission } from "@/lib/document-repository/access";
import {
  REPOSITORY_AUDIT_MODULE,
  RepositoryAuditAction,
  type RepositoryRevisionPolicy,
} from "@/lib/document-repository/constants";
import { entitlementMaxFileBytes } from "@/lib/document-repository/entitlement";
import { assertRepositoryQuota } from "@/lib/document-repository/quota";
import { repositoryStorage } from "@/lib/document-repository/storage";
import { repositoryUsageForWriteGuard } from "@/lib/document-repository/usage";
import { validateRepositoryUpload } from "@/lib/document-repository/validation";
import { prisma } from "@/lib/db";

export type RetainedRevisionCandidate = {
  id: string;
  revision: number;
  storageKey: string;
  fileSizeBytes: bigint;
};

export type RepositoryReplacementRetentionPlan = {
  retainPreviousCurrentBinary: boolean;
  purgeRevisions: RetainedRevisionCandidate[];
  reclaimBeforeWriteBytes: bigint;
};

export function planRepositoryReplacementRetention(input: {
  revisionPolicy: RepositoryRevisionPolicy;
  retainRevisionBinaries: boolean;
  maxRevisionBinaries: number | null;
  currentFileSizeBytes: bigint;
  retainedRevisions: RetainedRevisionCandidate[];
}): RepositoryReplacementRetentionPlan {
  const retainPreviousCurrentBinary = input.revisionPolicy === "KEEP_HISTORY"
    && input.retainRevisionBinaries
    && (input.maxRevisionBinaries === null || input.maxRevisionBinaries > 0);

  if (!retainPreviousCurrentBinary) {
    return {
      retainPreviousCurrentBinary: false,
      purgeRevisions: [],
      reclaimBeforeWriteBytes: input.currentFileSizeBytes,
    };
  }

  const sortedRetained = [...input.retainedRevisions].sort((a, b) => a.revision - b.revision);
  const max = input.maxRevisionBinaries;
  const overflow = max === null ? 0 : Math.max(0, sortedRetained.length + 1 - max);
  const purgeRevisions = overflow ? sortedRetained.slice(0, overflow) : [];
  const reclaimBeforeWriteBytes = purgeRevisions.reduce((sum, revision) => sum + revision.fileSizeBytes, BigInt(0));

  return {
    retainPreviousCurrentBinary: true,
    purgeRevisions,
    reclaimBeforeWriteBytes,
  };
}

export type ReplaceRepositoryDocumentInput = {
  documentId: string;
  file: {
    originalFileName: string;
    contentType: string;
    data: Uint8Array;
  };
  revisionLabel?: string | null;
  reason: string;
};

function requiredText(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) throw new Error(`${label} must not exceed ${maxLength} characters.`);
  return normalized;
}

function optionalText(value: string | null | undefined, maxLength: number) {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new Error(`Revision label must not exceed ${maxLength} characters.`);
  return normalized;
}

/**
 * Replaces the live binary while preserving immutable revision evidence.
 *
 * The previous live revision is always represented by RepositoryDocumentRevision.
 * Whether its binary remains downloadable depends on the document revision policy
 * and the tenant's effective plan retention limits. Replacement always returns
 * the live document to DRAFT so a newly uploaded binary is never silently exposed
 * to homeowners without an explicit publish action.
 */
export async function replaceRepositoryDocument(input: ReplaceRepositoryDocumentInput) {
  const actor = await requireUser();
  const { context, entitlement } = await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_REPLACE);
  const documentId = requiredText(input.documentId, "Document ID", 191);
  const reason = requiredText(input.reason, "Revision reason", 1000);
  const requestedRevisionLabel = optionalText(input.revisionLabel, 60);

  const existing = await prisma.repositoryDocument.findFirst({
    where: { tenantId: context.tenantId, id: documentId },
    select: {
      id: true,
      title: true,
      status: true,
      visibility: true,
      currentRevision: true,
      currentRevisionLabel: true,
      revisionPolicy: true,
      originalFileName: true,
      storageKey: true,
      contentType: true,
      fileExtension: true,
      fileSizeBytes: true,
      checksumSha256: true,
      malwareScanStatus: true,
      category: { select: { code: true, name: true, governanceControlled: true } },
      revisions: {
        where: { storageKey: { not: null } },
        orderBy: { revision: "asc" },
        select: { id: true, revision: true, storageKey: true, fileSizeBytes: true },
      },
    },
  });
  if (!existing) throw new Error("Repository document not found in the active tenant.");

  if (existing.status === "PUBLISHED") {
    await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_PUBLISH);
  }
  if (existing.status === "ARCHIVED" || existing.status === "INACTIVE") {
    await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_ARCHIVE);
  }

  const revisionLabel = requestedRevisionLabel ?? (existing.category.governanceControlled ? null : `Rev ${existing.currentRevision + 1}`);
  if (existing.category.governanceControlled && !revisionLabel) {
    throw new Error("A revision label is required when replacing a governed repository record.");
  }

  const validation = validateRepositoryUpload({
    originalFileName: input.file.originalFileName,
    contentType: input.file.contentType,
    size: input.file.data.byteLength,
    data: input.file.data,
    maxFileBytes: entitlementMaxFileBytes(entitlement),
  });

  const retentionPlan = planRepositoryReplacementRetention({
    revisionPolicy: existing.revisionPolicy,
    retainRevisionBinaries: entitlement.retainRevisionBinaries,
    maxRevisionBinaries: entitlement.maxRevisionBinaries,
    currentFileSizeBytes: existing.fileSizeBytes,
    retainedRevisions: existing.revisions.map((revision) => ({
      id: revision.id,
      revision: revision.revision,
      storageKey: revision.storageKey!,
      fileSizeBytes: revision.fileSizeBytes,
    })),
  });

  const usage = await repositoryUsageForWriteGuard();
  const logicalUsedAfterPlannedReclaim = usage.totalBytes > retentionPlan.reclaimBeforeWriteBytes
    ? usage.totalBytes - retentionPlan.reclaimBeforeWriteBytes
    : BigInt(0);
  assertRepositoryQuota({
    usedBytes: logicalUsedAfterPlannedReclaim,
    maximumStorageMb: entitlement.storageLimitMb,
    requestedBytes: input.file.data.byteLength,
  });

  const stored = await repositoryStorage.put({
    tenantSlug: actor.tenant.slug,
    originalFileName: input.file.originalFileName,
    data: input.file.data,
  });

  const previousWasPublished = existing.status === "PUBLISHED";
  const nextRevision = existing.currentRevision + 1;

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      await tx.repositoryDocumentRevision.create({
        data: {
          tenantId: context.tenantId,
          documentId: existing.id,
          revision: existing.currentRevision,
          revisionLabel: existing.currentRevisionLabel,
          originalFileName: existing.originalFileName,
          storageKey: retentionPlan.retainPreviousCurrentBinary ? existing.storageKey : null,
          contentType: existing.contentType,
          fileExtension: existing.fileExtension,
          fileSizeBytes: existing.fileSizeBytes,
          checksumSha256: existing.checksumSha256,
          malwareScanStatus: existing.malwareScanStatus,
          reason,
          createdById: actor.id,
        },
      });

      for (const revision of retentionPlan.purgeRevisions) {
        await tx.repositoryDocumentRevision.update({
          where: { tenantId_id: { tenantId: context.tenantId, id: revision.id } },
          data: { storageKey: null },
        });
      }

      const document = await tx.repositoryDocument.update({
        where: { tenantId_id: { tenantId: context.tenantId, id: existing.id } },
        data: {
          currentRevision: nextRevision,
          currentRevisionLabel: revisionLabel,
          originalFileName: input.file.originalFileName.trim(),
          storageKey: stored.storageKey,
          contentType: validation.normalizedContentType,
          fileExtension: validation.extension,
          fileSizeBytes: BigInt(stored.size),
          checksumSha256: validation.checksumSha256 ?? "",
          malwareScanStatus: "NOT_CONFIGURED",
          status: "DRAFT",
          publishedAt: null,
          updatedById: actor.id,
        },
        select: {
          id: true,
          title: true,
          currentRevision: true,
          currentRevisionLabel: true,
          status: true,
          originalFileName: true,
          contentType: true,
          fileExtension: true,
          fileSizeBytes: true,
          checksumSha256: true,
          updatedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorId: actor.id,
          module: REPOSITORY_AUDIT_MODULE,
          action: RepositoryAuditAction.REVISION_CREATED,
          entityType: "RepositoryDocument",
          entityId: existing.id,
          reason,
          metadata: {
            revision: existing.currentRevision,
            revisionLabel: existing.currentRevisionLabel,
            binaryRetained: retentionPlan.retainPreviousCurrentBinary,
            originalFileName: existing.originalFileName,
            fileSizeBytes: existing.fileSizeBytes.toString(),
            checksumSha256: existing.checksumSha256,
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
          entityId: existing.id,
          reason,
          metadata: {
            fromRevision: existing.currentRevision,
            fromRevisionLabel: existing.currentRevisionLabel,
            toRevision: nextRevision,
            toRevisionLabel: revisionLabel,
            oldFileName: existing.originalFileName,
            newFileName: document.originalFileName,
            oldChecksumSha256: existing.checksumSha256,
            newChecksumSha256: document.checksumSha256,
            purgedRevisionBinaries: retentionPlan.purgeRevisions.map((revision) => revision.revision),
          },
          aiAction: false,
        },
      });

      if (previousWasPublished) {
        await tx.auditLog.create({
          data: {
            tenantId: context.tenantId,
            actorId: actor.id,
            module: REPOSITORY_AUDIT_MODULE,
            action: RepositoryAuditAction.UNPUBLISHED,
            entityType: "RepositoryDocument",
            entityId: existing.id,
            reason: "A replacement binary requires explicit review and republishing.",
            metadata: { from: "PUBLISHED", to: "DRAFT", replacementRevision: nextRevision },
            aiAction: false,
          },
        });
      }

      return document;
    });
  } catch (error) {
    await repositoryStorage.delete({ tenantSlug: actor.tenant.slug, storageKey: stored.storageKey }).catch((cleanupError) => {
      console.error("[document-repository] Failed to remove replacement upload after transaction rollback.", {
        tenantId: context.tenantId,
        documentId: existing.id,
        cleanupError,
      });
    });
    throw error;
  }

  const storageKeysToDelete = new Set<string>();
  if (!retentionPlan.retainPreviousCurrentBinary) storageKeysToDelete.add(existing.storageKey);
  for (const revision of retentionPlan.purgeRevisions) storageKeysToDelete.add(revision.storageKey);

  for (const storageKey of storageKeysToDelete) {
    await repositoryStorage.delete({ tenantSlug: actor.tenant.slug, storageKey }).catch((error) => {
      console.error("[document-repository] Revision retention left an inaccessible storage orphan for maintenance cleanup.", {
        tenantId: context.tenantId,
        documentId: existing.id,
        storageKey,
        error,
      });
    });
  }

  return {
    document: updated,
    previousRevision: existing.currentRevision,
    retainedPreviousBinary: retentionPlan.retainPreviousCurrentBinary,
    purgedRevisionBinaries: retentionPlan.purgeRevisions.map((revision) => revision.revision),
  };
}
