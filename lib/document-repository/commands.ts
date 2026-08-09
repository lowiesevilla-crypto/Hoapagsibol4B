import type {
  RepositoryDocumentStatus,
  RepositoryDocumentVisibility,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertRepositoryTenant } from "@/lib/document-repository/access";
import { writeRepositoryAudit } from "@/lib/document-repository/audit";
import { RepositoryAuditAction } from "@/lib/document-repository/constants";
import { entitlementMaxFileBytes, requireDocumentManagementFeature } from "@/lib/document-repository/entitlement";
import { assertRepositoryQuota } from "@/lib/document-repository/quota";
import { repositoryUsageBytes } from "@/lib/document-repository/repository";
import { repositoryStorage } from "@/lib/document-repository/storage";
import { validateRepositoryUpload } from "@/lib/document-repository/validation";

export type CreateRepositoryDocumentInput = {
  tenantId: string;
  tenantSlug: string;
  actorId: string;
  title: string;
  description?: string | null;
  categoryId: string;
  documentReference?: string | null;
  visibility: RepositoryDocumentVisibility;
  status: RepositoryDocumentStatus;
  issuingBody?: string | null;
  effectiveAt?: Date | null;
  expiresAt?: Date | null;
  resolutionNumber?: string | null;
  memoNumber?: string | null;
  policyOwner?: string | null;
  searchableKeywords?: string | null;
  originalFileName: string;
  contentType: string;
  data: Uint8Array;
};

function requiredText(value: string, label: string, maxLength = 191) {
  const cleaned = value.trim();
  if (!cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > maxLength) throw new Error(`${label} is too long.`);
  return cleaned;
}

function optionalText(value: string | null | undefined, maxLength = 191) {
  const cleaned = value?.trim() || "";
  if (!cleaned) return null;
  if (cleaned.length > maxLength) throw new Error("A document metadata field is too long.");
  return cleaned;
}

export async function createRepositoryDocument(input: CreateRepositoryDocumentInput) {
  assertRepositoryTenant(input.tenantId);
  const entitlement = await requireDocumentManagementFeature(input.tenantId);
  const title = requiredText(input.title, "Document title");
  const categoryId = requiredText(input.categoryId, "Document category");
  const description = optionalText(input.description, 4000);
  const documentReference = optionalText(input.documentReference, 120);
  const issuingBody = optionalText(input.issuingBody, 191);
  const resolutionNumber = optionalText(input.resolutionNumber, 120);
  const memoNumber = optionalText(input.memoNumber, 120);
  const policyOwner = optionalText(input.policyOwner, 191);
  const searchableKeywords = optionalText(input.searchableKeywords, 4000);

  if (input.effectiveAt && input.expiresAt && input.expiresAt <= input.effectiveAt) {
    throw new Error("Expiration date must be later than the effective date.");
  }

  const category = await prisma.repositoryDocumentCategory.findFirst({
    where: { tenantId: input.tenantId, id: categoryId, active: true },
  });
  if (!category) throw new Error("The selected document category is not available for this tenant.");

  const validation = validateRepositoryUpload({
    originalFileName: input.originalFileName,
    contentType: input.contentType,
    size: input.data.byteLength,
    data: input.data,
    maxFileBytes: entitlementMaxFileBytes(entitlement),
  });
  if (!validation.checksumSha256) throw new Error("Document checksum could not be generated.");

  const usedBytes = await repositoryUsageBytes(input.tenantId);
  assertRepositoryQuota({
    usedBytes,
    maximumStorageMb: entitlement.storageLimitMb,
    requestedBytes: input.data.byteLength,
  });

  const stored = await repositoryStorage.put({
    tenantSlug: input.tenantSlug,
    originalFileName: input.originalFileName,
    data: input.data,
  });

  try {
    const document = await prisma.repositoryDocument.create({
      data: {
        tenantId: input.tenantId,
        categoryId: category.id,
        title,
        description,
        documentReference,
        visibility: input.visibility,
        status: input.status,
        currentRevision: 1,
        revisionPolicy: category.governanceControlled ? "KEEP_HISTORY" : "REPLACE_CURRENT",
        originalFileName: input.originalFileName,
        storageKey: stored.storageKey,
        contentType: validation.normalizedContentType,
        fileExtension: validation.extension,
        fileSizeBytes: BigInt(stored.size),
        checksumSha256: validation.checksumSha256,
        malwareScanStatus: "NOT_CONFIGURED",
        issuingBody,
        effectiveAt: input.effectiveAt ?? null,
        expiresAt: input.expiresAt ?? null,
        publishedAt: input.status === "PUBLISHED" ? new Date() : null,
        resolutionNumber,
        memoNumber,
        policyOwner,
        searchableKeywords,
        uploadedById: input.actorId,
        updatedById: input.actorId,
      },
      include: { category: true },
    });

    await writeRepositoryAudit({
      action: RepositoryAuditAction.UPLOADED,
      actorId: input.actorId,
      documentId: document.id,
      metadata: {
        title: document.title,
        categoryId: document.categoryId,
        categoryCode: document.category.code,
        visibility: document.visibility,
        status: document.status,
        fileName: document.originalFileName,
        fileSizeBytes: document.fileSizeBytes.toString(),
        checksumSha256: document.checksumSha256,
      },
    });

    return document;
  } catch (error) {
    await repositoryStorage.delete({
      tenantSlug: input.tenantSlug,
      storageKey: stored.storageKey,
    }).catch(() => undefined);
    throw error;
  }
}
