import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { DocumentIssuedStatus, DocumentVerificationStatus, Prisma } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { requireDocumentPermission, type DocumentExecutionContext } from "@/lib/services/document-runtime-context";
import { writeDocumentAudit } from "@/lib/services/document-runtime-audit";

export async function createDocumentVerificationToken(context: DocumentExecutionContext, input: { requestId: string; documentVersionId?: string; expiresAt?: Date }) {
  requireDocumentPermission(context, "MANAGE_TENANT_TEMPLATES");
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashVerificationToken(rawToken);
  const created = await platformPrisma.$transaction(async (tx) => {
    const request = await tx.documentRequest.findFirst({ where: { tenantId: context.tenantId, id: input.requestId }, include: { definition: { select: { id: true } } } });
    if (!request) throw new Error("Document request was not found for the authenticated tenant.");
    if (input.documentVersionId) {
      const version = await tx.documentVersion.findFirst({ where: { tenantId: context.tenantId, id: input.documentVersionId, requestId: request.id }, select: { id: true } });
      if (!version) throw new Error("Document version does not belong to the authenticated tenant and request.");
    }
    const token = await tx.documentVerificationToken.create({ data: { tenantId: context.tenantId, requestId: request.id, documentVersionId: input.documentVersionId, definitionId: request.definition?.id, tokenHash, expiresAt: input.expiresAt } });
    await writeDocumentAudit({ context, action: "CREATE_VERIFICATION_TOKEN", entityType: "DocumentVerificationToken", entityId: token.id, after: { requestId: request.id, documentVersionId: input.documentVersionId ?? null, expiresAt: input.expiresAt ?? null }, client: tx });
    return token;
  });
  return { id: created.id, token: rawToken, url: verificationUrl(rawToken), expiresAt: created.expiresAt };
}

export async function verifyDocumentToken(rawToken: string) {
  if (!rawToken || rawToken.length < 32) return invalidVerificationResult();
  const tokenHash = hashVerificationToken(rawToken);
  const token = await platformPrisma.documentVerificationToken.findUnique({ where: { tokenHash }, include: { tenant: { select: { name: true } }, request: { select: { documentNumber: true, status: true, definition: { select: { displayName: true } }, type: true, issueDate: true, validityDate: true } }, documentVersion: { select: { documentNumber: true, issuedStatus: true, issuedAt: true, revokedAt: true, definition: { select: { displayName: true } } } } } });
  if (!token) return invalidVerificationResult();
  const expired = token.expiresAt ? token.expiresAt.getTime() <= Date.now() : false;
  const revoked = token.status === DocumentVerificationStatus.REVOKED || Boolean(token.revokedAt) || token.documentVersion?.issuedStatus === DocumentIssuedStatus.REVOKED || Boolean(token.documentVersion?.revokedAt);
  const status = revoked ? "REVOKED" : expired ? "EXPIRED" : "VALID";
  await platformPrisma.documentVerificationToken.update({ where: { id: token.id }, data: { verificationCount: { increment: 1 }, lastVerifiedAt: new Date() } });
  await platformPrisma.auditLog.create({ data: { tenantId: token.tenantId, module: "DOCUMENTS", action: "VERIFY_DOCUMENT_TOKEN", entityType: "DocumentVerificationToken", entityId: token.id, metadata: { result: status } as Prisma.InputJsonValue } });
  const version = token.documentVersion;
  return { status, tenantName: token.tenant.name, documentNumber: version?.documentNumber ?? token.request.documentNumber, documentType: version?.definition?.displayName ?? token.request.definition?.displayName ?? token.request.type ?? "Document", issueDate: version?.issuedAt ?? token.request.issueDate, validUntil: token.request.validityDate };
}

export async function revokeDocumentVerificationToken(context: DocumentExecutionContext, tokenId: string, reason: string) {
  requireDocumentPermission(context, "REVOKE_VERIFICATION");
  if (!reason.trim()) throw new Error("A reason is required to revoke a verification token.");
  const token = await platformPrisma.documentVerificationToken.findFirst({ where: { tenantId: context.tenantId, id: tokenId }, select: { id: true, status: true } });
  if (!token) throw new Error("Verification token was not found for the authenticated tenant.");
  const revoked = await platformPrisma.$transaction(async (tx) => {
    const result = await tx.documentVerificationToken.update({ where: { id: token.id }, data: { status: DocumentVerificationStatus.REVOKED, revokedAt: new Date(), revokedById: context.authenticatedUserId } });
    await writeDocumentAudit({ context, action: "REVOKE_VERIFICATION_TOKEN", entityType: "DocumentVerificationToken", entityId: result.id, reason, before: { status: token.status }, after: { status: result.status }, client: tx });
    return result;
  });
  return revoked;
}

export async function rotateDocumentVerificationToken(context: DocumentExecutionContext, input: { tokenId: string; requestId: string; documentVersionId?: string; expiresAt?: Date; reason: string }) {
  requireDocumentPermission(context, "MANAGE_TENANT_TEMPLATES");
  if (!input.reason.trim()) throw new Error("A reason is required to rotate a verification token.");
  return platformPrisma.$transaction(async (tx) => {
    const old = await tx.documentVerificationToken.findFirst({ where: { tenantId: context.tenantId, id: input.tokenId }, select: { id: true, status: true } });
    if (!old) throw new Error("Verification token was not found for the authenticated tenant.");
    await tx.documentVerificationToken.update({ where: { id: old.id }, data: { status: DocumentVerificationStatus.REVOKED, revokedAt: new Date(), revokedById: context.authenticatedUserId } });
    const request = await tx.documentRequest.findFirst({ where: { tenantId: context.tenantId, id: input.requestId }, include: { definition: { select: { id: true } } } });
    if (!request) throw new Error("Document request was not found for the authenticated tenant.");
    const rawToken = randomBytes(32).toString("base64url");
    const created = await tx.documentVerificationToken.create({ data: { tenantId: context.tenantId, requestId: request.id, documentVersionId: input.documentVersionId, definitionId: request.definition?.id, tokenHash: hashVerificationToken(rawToken), expiresAt: input.expiresAt } });
    await writeDocumentAudit({ context, action: "ROTATE_VERIFICATION_TOKEN", entityType: "DocumentVerificationToken", entityId: created.id, reason: input.reason, after: { replacedTokenId: old.id }, client: tx });
    return { id: created.id, token: rawToken, url: verificationUrl(rawToken), expiresAt: created.expiresAt };
  });
}

export function hashVerificationToken(rawToken: string) {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function verificationUrl(rawToken: string, baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "") {
  return `${baseUrl.replace(/\/$/, "")}/verify/documents/${encodeURIComponent(rawToken)}`;
}

function invalidVerificationResult() {
  return { status: "INVALID" as const, tenantName: null, documentNumber: null, documentType: null, issueDate: null, validUntil: null };
}
