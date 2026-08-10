import "server-only";

import { Permission } from "@/lib/authorization/permissions";
import { requireUser } from "@/lib/auth";
import {
  RepositoryAuditAction,
  type RepositoryRevisionPolicy,
  type RepositoryDocumentStatus,
  type RepositoryDocumentVisibility,
} from "@/lib/document-repository/constants";
import { requireRepositoryPermission } from "@/lib/document-repository/access";
import { writeRepositoryAudit } from "@/lib/document-repository/audit";
import { entitlementMaxFileBytes } from "@/lib/document-repository/entitlement";
import { assertRepositoryQuota } from "@/lib/document-repository/quota";
import { repositoryStorage } from "@/lib/document-repository/storage";
import { repositoryUsageForWriteGuard } from "@/lib/document-repository/usage";
import { validateRepositoryUpload } from "@/lib/document-repository/validation";
import { prisma } from "@/lib/db";

export type CreateRepositoryDocumentInput = {
  file: {
    originalFileName: string;
    contentType: string;
    data: Uint8Array;
  };
  title: string;
  categoryId: string;
  description?: string | null;
  documentReference?: string | null;
  visibility?: RepositoryDocumentVisibility;
  status?: RepositoryDocumentStatus;
  revisionPolicy?: RepositoryRevisionPolicy;
  issuingBody?: string | null;
  approvalDate?: Date | null;
  effectiveAt?: Date | null;
  expiresAt?: Date | null;
  resolutionNumber?: string | null;
  memoNumber?: string | null;
  policyOwner?: string | null;
  remarks?: string | null;
  searchableKeywords?: string | null;
};

function requiredLabel(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) throw new Error(`${label} must not exceed ${maxLength} characters.`);
  return normalized;
}

function optionalLabel(value: string | null | undefined, maxLength: number) {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new Error(`Document metadata must not exceed ${maxLength} characters.`);
  return normalized;
}

function validateDates(input: CreateRepositoryDocumentInput) {
  if (input.effectiveAt && input.expiresAt && input.expiresAt.getTime() <= input.effectiveAt.getTime()) {
    throw new Error("Document expiry must be later than its effective date.");
  }
}

/**
 * Creates one managed repository document for the authenticated tenant.
 *
 * The physical write happens only after entitlement, RBAC, category, validation
 * and quota checks. If database/audit persistence then fails, the newly written
 * binary is removed so failed uploads do not consume tenant storage.
 */
export async function createRepositoryDocument(input: CreateRepositoryDocumentInput) {
  const actor = await requireUser();
  const { context, entitlement } = await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_UPLOAD);

  const title = requiredLabel(input.title, "Document title", 191);
  const categoryId = requiredLabel(input.categoryId, "Document category", 191);
  const visibility = input.visibility ?? "INTERNAL";
  const status = input.status ?? "DRAFT";

  if (status !== "DRAFT" && status !== "PUBLISHED") {
    throw new Error("New repository documents must start as Draft or Published.");
  }
  if (visibility !== "INTERNAL") {
    await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_MANAGE_VISIBILITY);
  }
  if (status === "PUBLISHED") {
    await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_PUBLISH);
  }
  validateDates(input);

  const category = await prisma.repositoryDocumentCategory.findFirst({
    where: { tenantId: context.tenantId, id: categoryId, active: true },
    select: { id: true, code: true, governanceControlled: true },
  });
  if (!category) throw new Error("The selected document category is not available in the active tenant.");

  // Governance records can never opt into silent replace-current behavior.
  // They always retain a controlled revision lineage even if a caller submits
  // a weaker policy. Non-governed categories may explicitly request history.
  const revisionPolicy: RepositoryRevisionPolicy = category.governanceControlled
    ? "KEEP_HISTORY"
    : input.revisionPolicy ?? "REPLACE_CURRENT";

  const validation = validateRepositoryUpload({
    originalFileName: input.file.originalFileName,
    contentType: input.file.contentType,
    size: input.file.data.byteLength,
    data: input.file.data,
    maxFileBytes: entitlementMaxFileBytes(entitlement),
  });

  const usage = await repositoryUsageForWriteGuard();
  assertRepositoryQuota({
    usedBytes: usage.totalBytes,
    maximumStorageMb: entitlement.storageLimitMb,
    requestedBytes: input.file.data.byteLength,
  });

  const stored = await repositoryStorage.put({
    tenantSlug: actor.tenant.slug,
    originalFileName: input.file.originalFileName,
    data: input.file.data,
  });

  let documentId: string | null = null;
  try {
    const document = await prisma.repositoryDocument.create({
      data: {
        tenantId: context.tenantId,
        categoryId: category.id,
        title,
        description: input.description?.trim() || null,
        documentReference: optionalLabel(input.documentReference, 120),
        visibility,
        status,
        currentRevision: 1,
        revisionPolicy,
        originalFileName: input.file.originalFileName.trim(),
        storageKey: stored.storageKey,
        contentType: validation.normalizedContentType,
        fileExtension: validation.extension,
        fileSizeBytes: BigInt(stored.size),
        checksumSha256: validation.checksumSha256 ?? "",
        malwareScanStatus: "NOT_CONFIGURED",
        issuingBody: optionalLabel(input.issuingBody, 191),
        approvalDate: input.approvalDate ?? null,
        effectiveAt: input.effectiveAt ?? null,
        expiresAt: input.expiresAt ?? null,
        publishedAt: status === "PUBLISHED" ? new Date() : null,
        resolutionNumber: optionalLabel(input.resolutionNumber, 120),
        memoNumber: optionalLabel(input.memoNumber, 120),
        policyOwner: optionalLabel(input.policyOwner, 191),
        remarks: input.remarks?.trim() || null,
        searchableKeywords: input.searchableKeywords?.trim() || null,
        uploadedById: actor.id,
        updatedById: actor.id,
      },
      select: {
        id: true,
        title: true,
        status: true,
        visibility: true,
        categoryId: true,
        currentRevision: true,
        revisionPolicy: true,
        originalFileName: true,
        contentType: true,
        fileSizeBytes: true,
        createdAt: true,
      },
    });
    documentId = document.id;

    await writeRepositoryAudit({
      tenantId: context.tenantId,
      action: RepositoryAuditAction.UPLOADED,
      actorId: actor.id,
      documentId: document.id,
      metadata: {
        title: document.title,
        categoryId: document.categoryId,
        categoryCode: category.code,
        governanceControlled: category.governanceControlled,
        status: document.status,
        visibility: document.visibility,
        revision: document.currentRevision,
        revisionPolicy: document.revisionPolicy,
        originalFileName: document.originalFileName,
        contentType: document.contentType,
        fileSizeBytes: Number(document.fileSizeBytes),
      },
    });

    return document;
  } catch (error) {
    if (documentId) {
      await prisma.repositoryDocument.delete({ where: { id: documentId } }).catch((cleanupError) => {
        console.error("[document-repository] Failed to roll back repository metadata after upload failure.", { documentId, cleanupError });
      });
    }
    await repositoryStorage.delete({ tenantSlug: actor.tenant.slug, storageKey: stored.storageKey }).catch((cleanupError) => {
      console.error("[document-repository] Failed to remove orphaned upload after repository persistence failure.", { cleanupError });
    });
    throw error;
  }
}
