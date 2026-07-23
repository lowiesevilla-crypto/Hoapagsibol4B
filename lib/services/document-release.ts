import "server-only";

import {
  DocumentGenerationState,
  DocumentIssuedStatus,
  DocumentRequestStatus,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { recordDocumentGenerationEvent } from "@/lib/services/document-generation-events";
import { notifyDocumentOwner } from "@/lib/services/document-notifications";
import { writeDocumentAudit } from "@/lib/services/document-runtime-audit";
import { DocumentRuntimeError } from "@/lib/services/document-runtime-errors";
import {
  requireDocumentPermission,
  type DocumentExecutionContext,
} from "@/lib/services/document-runtime-context";

export async function releaseIssuedDocument(
  context: DocumentExecutionContext,
  input: { documentVersionId: string; reason?: string },
) {
  requireDocumentPermission(context, "RELEASE_DOCUMENT");
  const current = await platformPrisma.documentVersion.findFirst({
    where: { id: input.documentVersionId, tenantId: context.tenantId },
    include: {
      request: { include: { homeowner: { select: { userId: true, tenantId: true } } } },
      generationAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!current) {
    throw new DocumentRuntimeError(
      "NOT_FOUND",
      "Issued document was not found for the authenticated tenant.",
    );
  }
  if (current.request.tenantId !== context.tenantId || current.request.homeowner.tenantId !== context.tenantId) {
    throw new DocumentRuntimeError("CROSS_TENANT", "Issued document ownership is invalid.");
  }
  if (current.issuedStatus === DocumentIssuedStatus.REVOKED || current.revokedAt) {
    throw new DocumentRuntimeError("RELEASE_BLOCKED", "A revoked document cannot be released.");
  }
  if (current.issuedStatus === DocumentIssuedStatus.RELEASED) {
    return { documentVersion: current, released: false, idempotentReplay: true } as const;
  }
  if (!current.generatedContent.trim() || !current.contentHash) {
    throw new DocumentRuntimeError("STORAGE_FAILURE", "The immutable issued output is missing or incomplete.");
  }

  const releasedAt = new Date();
  const result = await platformPrisma.$transaction(async (tx) => {
    const fresh = await tx.documentVersion.findFirst({
      where: { id: current.id, tenantId: context.tenantId },
      select: { id: true, issuedStatus: true, revokedAt: true },
    });
    if (!fresh) throw new DocumentRuntimeError("NOT_FOUND", "Issued document disappeared before release.");
    if (fresh.issuedStatus === DocumentIssuedStatus.REVOKED || fresh.revokedAt) {
      throw new DocumentRuntimeError("RELEASE_BLOCKED", "A revoked document cannot be released.");
    }
    if (fresh.issuedStatus === DocumentIssuedStatus.RELEASED) {
      return { idempotentReplay: true } as const;
    }

    const documentVersion = await tx.documentVersion.update({
      where: { id: fresh.id },
      data: {
        issuedStatus: DocumentIssuedStatus.RELEASED,
        releasedAt,
        releasedById: context.authenticatedUserId,
      },
    });
    await tx.documentRequest.update({
      where: { id: current.requestId },
      data: {
        status: DocumentRequestStatus.READY_FOR_DOWNLOAD,
        readyForDownloadAt: releasedAt,
      },
    });
    await tx.documentRequestHistory.create({
      data: {
        tenantId: context.tenantId,
        requestId: current.requestId,
        status: DocumentRequestStatus.READY_FOR_DOWNLOAD,
        actorId: context.authenticatedUserId,
        note: `Released ${current.documentNumber} to the authorized recipient.`,
      },
    });
    const attempt = current.generationAttempts[0];
    if (attempt) {
      await tx.documentGenerationAttempt.update({
        where: { id: attempt.id },
        data: { state: DocumentGenerationState.RELEASED, completedAt: releasedAt },
      });
    }
    await recordDocumentGenerationEvent({
      context,
      event: "DOCUMENT_RELEASED",
      requestId: current.requestId,
      attemptId: attempt?.id,
      documentVersionId: current.id,
      attemptNumber: attempt?.attemptNumber,
      state: DocumentGenerationState.RELEASED,
      reason: input.reason?.trim() || "Authorized document release.",
      metadata: { documentNumber: current.documentNumber },
      client: tx,
    });
    return { idempotentReplay: false, documentVersion } as const;
  });

  if (result.idempotentReplay) {
    const released = await platformPrisma.documentVersion.findUniqueOrThrow({ where: { id: current.id } });
    return { documentVersion: released, released: false, idempotentReplay: true } as const;
  }
  await notifyDocumentOwner(
    context,
    current.request.homeowner.userId,
    "RELEASED",
    "Document released",
    `${current.documentNumber} is ready for download.`,
    current.requestId,
    { documentNumber: current.documentNumber },
    `RELEASED:DocumentVersion:${current.id}`,
  );
  return { documentVersion: result.documentVersion, released: true, idempotentReplay: false } as const;
}

export async function getIssuedDocument(
  context: DocumentExecutionContext,
  documentVersionId: string,
) {
  requireDocumentPermission(context, "VIEW_ISSUED_DOCUMENT");
  const documentVersion = await platformPrisma.documentVersion.findFirst({
    where: {
      id: documentVersionId,
      tenantId: context.tenantId,
      ...(context.role === "HOMEOWNER"
        ? { request: { homeowner: { userId: context.authenticatedUserId, tenantId: context.tenantId } } }
        : {}),
    },
    include: { verificationTokens: { select: { status: true, expiresAt: true, revokedAt: true } } },
  });
  if (!documentVersion) {
    throw new DocumentRuntimeError(
      "NOT_FOUND",
      "Issued document was not found for the authenticated tenant and user.",
    );
  }
  return documentVersion;
}

export async function revokeIssuedDocument(
  context: DocumentExecutionContext,
  input: { documentVersionId: string; reason: string },
) {
  requireDocumentPermission(context, "REVOKE_DOCUMENT");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new DocumentRuntimeError("VALIDATION_FAILED", "A revocation reason is required.");
  const current = await platformPrisma.documentVersion.findFirst({
    where: { id: input.documentVersionId, tenantId: context.tenantId },
    include: { request: { include: { homeowner: { select: { userId: true, tenantId: true } } } } },
  });
  if (!current || current.request.tenantId !== context.tenantId || current.request.homeowner.tenantId !== context.tenantId) {
    throw new DocumentRuntimeError("NOT_FOUND", "Issued document was not found for the authenticated tenant.");
  }
  if (current.issuedStatus === DocumentIssuedStatus.REVOKED) return { documentVersion: current, revoked: false, idempotentReplay: true } as const;
  const revokedAt = new Date();
  const documentVersion = await platformPrisma.$transaction(async (tx) => {
    const fresh = await tx.documentVersion.findFirst({ where: { id: current.id, tenantId: context.tenantId }, select: { id: true, issuedStatus: true } });
    if (!fresh) throw new DocumentRuntimeError("NOT_FOUND", "Issued document disappeared before revocation.");
    if (fresh.issuedStatus === DocumentIssuedStatus.REVOKED) return tx.documentVersion.findUniqueOrThrow({ where: { id: fresh.id } });
    const updated = await tx.documentVersion.update({ where: { id: fresh.id }, data: { issuedStatus: DocumentIssuedStatus.REVOKED, revokedAt, revokedById: context.authenticatedUserId, revocationReason: reason } });
    await tx.documentVerificationToken.updateMany({ where: { tenantId: context.tenantId, documentVersionId: fresh.id, status: "VALID" }, data: { status: "REVOKED", revokedAt, revokedById: context.authenticatedUserId } });
    if (current.request.currentVersion === current.version) await tx.documentRequest.update({ where: { id: current.requestId }, data: { status: DocumentRequestStatus.REVOKED } });
    await tx.documentRequestHistory.create({ data: { tenantId: context.tenantId, requestId: current.requestId, status: current.request.currentVersion === current.version ? DocumentRequestStatus.REVOKED : current.request.status, actorId: context.authenticatedUserId, note: `Revoked issued document ${current.documentNumber}.` } });
    await writeDocumentAudit({ context, action: "REVOKE_ISSUED_DOCUMENT", entityType: "DocumentVersion", entityId: fresh.id, reason, before: { issuedStatus: fresh.issuedStatus }, after: { issuedStatus: DocumentIssuedStatus.REVOKED }, client: tx });
    return updated;
  });
  await notifyDocumentOwner(context, current.request.homeowner.userId, "REVOKED", "Document revoked", `${current.documentNumber} has been revoked. Contact the HOA office for assistance.`, current.requestId, { documentNumber: current.documentNumber }, `REVOKED:DocumentVersion:${current.id}`);
  return { documentVersion, revoked: true, idempotentReplay: false } as const;
}
