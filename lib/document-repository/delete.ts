import "server-only";

import { Permission } from "@/lib/authorization/permissions";
import { requireUser } from "@/lib/auth";
import { requireRepositoryPermission } from "@/lib/document-repository/access";
import { REPOSITORY_AUDIT_MODULE, RepositoryAuditAction } from "@/lib/document-repository/constants";
import { repositoryStorage } from "@/lib/document-repository/storage";
import { prisma } from "@/lib/db";

export type DeleteRepositoryDocumentResult = {
  documentId: string;
  deletedFileCount: number;
  storageCleanupFailures: number;
};

/**
 * Permanently removes one managed repository document for the active tenant.
 *
 * Database deletion and its immutable audit tombstone commit together first.
 * Binary cleanup happens immediately afterwards. A storage cleanup error never
 * recreates database visibility; it is logged as an operational orphan for
 * retry/maintenance rather than exposing an inaccessible file back to users.
 */
export async function permanentlyDeleteRepositoryDocument(input: { documentId: string; reason?: string | null }): Promise<DeleteRepositoryDocumentResult> {
  const actor = await requireUser();
  const { context } = await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_DELETE);
  const documentId = input.documentId.trim();
  if (!documentId) throw new Error("Document ID is required for permanent deletion.");

  const document = await prisma.repositoryDocument.findFirst({
    where: { tenantId: context.tenantId, id: documentId },
    select: {
      id: true,
      title: true,
      categoryId: true,
      status: true,
      visibility: true,
      currentRevision: true,
      originalFileName: true,
      storageKey: true,
      fileSizeBytes: true,
      revisions: {
        where: { tenantId: context.tenantId, storageKey: { not: null } },
        select: { storageKey: true, fileSizeBytes: true },
      },
    },
  });
  if (!document) throw new Error("Repository document not found in the active tenant.");

  const retainedRevisionBytes = document.revisions.reduce((sum, revision) => sum + revision.fileSizeBytes, BigInt(0));
  const binaryCount = 1 + document.revisions.filter((revision) => Boolean(revision.storageKey)).length;

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        tenantId: context.tenantId,
        actorId: actor.id,
        module: REPOSITORY_AUDIT_MODULE,
        action: RepositoryAuditAction.DELETED,
        entityType: "RepositoryDocument",
        entityId: document.id,
        metadata: {
          title: document.title,
          categoryId: document.categoryId,
          status: document.status,
          visibility: document.visibility,
          revision: document.currentRevision,
          originalFileName: document.originalFileName,
          currentFileSizeBytes: Number(document.fileSizeBytes),
          retainedRevisionBytes: Number(retainedRevisionBytes),
          binaryCount,
        },
        reason: input.reason?.trim() || null,
        aiAction: false,
      },
    });

    await tx.repositoryDocument.delete({
      where: { tenantId_id: { tenantId: context.tenantId, id: document.id } },
    });
  });

  const storageKeys = new Set<string>([document.storageKey]);
  for (const revision of document.revisions) {
    if (revision.storageKey) storageKeys.add(revision.storageKey);
  }

  let deletedFileCount = 0;
  let storageCleanupFailures = 0;
  for (const storageKey of storageKeys) {
    try {
      await repositoryStorage.delete({ tenantSlug: actor.tenant.slug, storageKey });
      deletedFileCount += 1;
    } catch (error) {
      storageCleanupFailures += 1;
      console.error("[document-repository] Permanent delete left an inaccessible storage orphan for maintenance cleanup.", {
        tenantId: context.tenantId,
        documentId: document.id,
        error,
      });
    }
  }

  return { documentId: document.id, deletedFileCount, storageCleanupFailures };
}
