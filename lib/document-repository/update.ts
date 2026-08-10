import "server-only";

import { purgeAiKnowledgeBindingForTenant } from "@/lib/ai-assistance/provider-index";
import { Permission } from "@/lib/authorization/permissions";
import { requireUser } from "@/lib/auth";
import { requireRepositoryPermission } from "@/lib/document-repository/access";
import { writeRepositoryAudit } from "@/lib/document-repository/audit";
import {
  RepositoryAuditAction,
  type RepositoryDocumentStatus,
  type RepositoryDocumentVisibility,
} from "@/lib/document-repository/constants";
import { prisma } from "@/lib/db";

export type UpdateRepositoryDocumentInput = {
  documentId: string;
  title: string;
  description?: string | null;
  categoryId: string;
  documentReference?: string | null;
  visibility: RepositoryDocumentVisibility;
  status: RepositoryDocumentStatus;
  issuingBody?: string | null;
  approvalDate?: Date | null;
  effectiveAt?: Date | null;
  expiresAt?: Date | null;
  resolutionNumber?: string | null;
  memoNumber?: string | null;
  policyOwner?: string | null;
  remarks?: string | null;
  searchableKeywords?: string | null;
  reason?: string | null;
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

function sameDate(left: Date | null, right: Date | null | undefined) {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

export async function updateRepositoryDocument(input: UpdateRepositoryDocumentInput) {
  const actor = await requireUser();
  const { context } = await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_UPDATE_METADATA);
  const documentId = requiredLabel(input.documentId, "Document ID", 191);
  const title = requiredLabel(input.title, "Document title", 191);
  const categoryId = requiredLabel(input.categoryId, "Document category", 191);

  if (input.effectiveAt && input.expiresAt && input.expiresAt.getTime() <= input.effectiveAt.getTime()) throw new Error("Document expiry must be later than its effective date.");

  const [existing, category] = await Promise.all([
    prisma.repositoryDocument.findFirst({
      where: { tenantId: context.tenantId, id: documentId },
      select: { id: true, title: true, categoryId: true, documentReference: true, visibility: true, status: true, revisionPolicy: true, approvalDate: true, effectiveAt: true, expiresAt: true },
    }),
    prisma.repositoryDocumentCategory.findFirst({ where: { tenantId: context.tenantId, id: categoryId, active: true }, select: { id: true, code: true, governanceControlled: true } }),
  ]);
  if (!existing) throw new Error("Repository document not found in the active tenant.");
  if (!category) throw new Error("The selected document category is not available in the active tenant.");

  const visibilityChanged = existing.visibility !== input.visibility;
  const statusChanged = existing.status !== input.status;
  if (visibilityChanged) await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_MANAGE_VISIBILITY);
  if (statusChanged && (existing.status === "PUBLISHED" || input.status === "PUBLISHED")) await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_PUBLISH);
  const archiveStates: readonly RepositoryDocumentStatus[] = ["ARCHIVED", "INACTIVE"];
  if (statusChanged && (archiveStates.includes(existing.status) || archiveStates.includes(input.status))) await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_ARCHIVE);

  const retrievalBoundaryChanged = visibilityChanged
    || statusChanged
    || !sameDate(existing.effectiveAt, input.effectiveAt)
    || !sameDate(existing.expiresAt, input.expiresAt);
  if (retrievalBoundaryChanged) {
    await purgeAiKnowledgeBindingForTenant({ tenantId: context.tenantId, documentId: existing.id, actorId: actor.id });
  }

  const updated = await prisma.repositoryDocument.update({
    where: { tenantId_id: { tenantId: context.tenantId, id: existing.id } },
    data: {
      categoryId: category.id,
      title,
      description: input.description?.trim() || null,
      documentReference: optionalLabel(input.documentReference, 120),
      visibility: input.visibility,
      status: input.status,
      revisionPolicy: category.governanceControlled ? "KEEP_HISTORY" : existing.revisionPolicy,
      issuingBody: optionalLabel(input.issuingBody, 191),
      approvalDate: input.approvalDate ?? null,
      effectiveAt: input.effectiveAt ?? null,
      expiresAt: input.expiresAt ?? null,
      publishedAt: input.status === "PUBLISHED" ? existing.status === "PUBLISHED" ? undefined : new Date() : null,
      resolutionNumber: optionalLabel(input.resolutionNumber, 120),
      memoNumber: optionalLabel(input.memoNumber, 120),
      policyOwner: optionalLabel(input.policyOwner, 191),
      remarks: input.remarks?.trim() || null,
      searchableKeywords: input.searchableKeywords?.trim() || null,
      updatedById: actor.id,
    },
  });

  await writeRepositoryAudit({
    action: RepositoryAuditAction.METADATA_UPDATED,
    actorId: actor.id,
    documentId: updated.id,
    reason: input.reason?.trim() || null,
    metadata: {
      previous: { title: existing.title, categoryId: existing.categoryId, documentReference: existing.documentReference, visibility: existing.visibility, status: existing.status, approvalDate: existing.approvalDate?.toISOString() ?? null, effectiveAt: existing.effectiveAt?.toISOString() ?? null, expiresAt: existing.expiresAt?.toISOString() ?? null },
      updated: { title: updated.title, categoryId: updated.categoryId, categoryCode: category.code, documentReference: updated.documentReference, visibility: updated.visibility, status: updated.status, approvalDate: updated.approvalDate?.toISOString() ?? null, effectiveAt: updated.effectiveAt?.toISOString() ?? null, expiresAt: updated.expiresAt?.toISOString() ?? null, aiKnowledgePurgedForBoundaryChange: retrievalBoundaryChanged },
    },
  });

  if (visibilityChanged) await writeRepositoryAudit({ action: RepositoryAuditAction.VISIBILITY_CHANGED, actorId: actor.id, documentId: updated.id, reason: input.reason?.trim() || null, metadata: { from: existing.visibility, to: updated.visibility } });
  if (statusChanged) {
    const action = updated.status === "PUBLISHED" ? RepositoryAuditAction.PUBLISHED : existing.status === "PUBLISHED" ? RepositoryAuditAction.UNPUBLISHED : updated.status === "ARCHIVED" ? RepositoryAuditAction.ARCHIVED : RepositoryAuditAction.STATUS_CHANGED;
    await writeRepositoryAudit({ action, actorId: actor.id, documentId: updated.id, reason: input.reason?.trim() || null, metadata: { from: existing.status, to: updated.status } });
  }

  return updated;
}
