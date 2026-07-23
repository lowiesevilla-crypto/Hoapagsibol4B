import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { DocumentIssuedStatus, DocumentVerificationStatus, Prisma } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { requireDocumentPermission, type DocumentExecutionContext } from "@/lib/services/document-runtime-context";
import { writeDocumentAudit } from "@/lib/services/document-runtime-audit";

export async function createDocumentVerificationToken(context: DocumentExecutionContext, input: { requestId: string; documentVersionId?: string; expiresAt?: Date }) {
  requireDocumentPermission(context, "MANAGE_TENANT_TEMPLATES");
  const prepared = prepareDocumentVerificationToken();
  const created = await platformPrisma.$transaction(async (tx) => {
    return persistPreparedDocumentVerificationToken(context, { ...input, prepared }, tx);
  });
  return { id: created.id, token: prepared.rawToken, url: prepared.url, expiresAt: created.expiresAt };
}

export type PreparedDocumentVerificationToken = { rawToken: string; tokenHash: string; url: string };

export function prepareDocumentVerificationToken(baseUrl?: string): PreparedDocumentVerificationToken {
  const rawToken = randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashVerificationToken(rawToken), url: verificationUrl(rawToken, baseUrl) };
}

export async function persistPreparedDocumentVerificationToken(context: DocumentExecutionContext, input: { requestId: string; documentVersionId?: string; definitionId?: string | null; expiresAt?: Date; prepared: PreparedDocumentVerificationToken }, tx: Prisma.TransactionClient) {
  const request = await tx.documentRequest.findFirst({ where: { tenantId: context.tenantId, id: input.requestId }, select: { id: true, definitionId: true } });
  if (!request) throw new Error("Document request was not found for the authenticated tenant.");
  if (input.documentVersionId) {
    const version = await tx.documentVersion.findFirst({ where: { tenantId: context.tenantId, id: input.documentVersionId, requestId: request.id }, select: { id: true } });
    if (!version) throw new Error("Document version does not belong to the authenticated tenant and request.");
  }
  const token = await tx.documentVerificationToken.create({ data: { tenantId: context.tenantId, requestId: request.id, documentVersionId: input.documentVersionId, definitionId: input.definitionId ?? request.definitionId, tokenHash: input.prepared.tokenHash, expiresAt: input.expiresAt } });
  await writeDocumentAudit({ context, action: "CREATE_VERIFICATION_TOKEN", entityType: "DocumentVerificationToken", entityId: token.id, after: { requestId: request.id, documentVersionId: input.documentVersionId ?? null, expiresAt: input.expiresAt ?? null }, client: tx });
  return token;
}

export async function verifyDocumentToken(rawToken: string) {
  if (!rawToken || rawToken.length < 32) return invalidVerificationResult();
  const tokenHash = hashVerificationToken(rawToken);
  const token = await platformPrisma.documentVerificationToken.findUnique({ where: { tokenHash }, include: { tenant: { select: { name: true } }, request: { select: { documentNumber: true, status: true, definition: { select: { displayName: true } }, type: true, issueDate: true, validityDate: true } }, documentVersion: { select: { id: true, tenantId: true, documentNumber: true, issuedStatus: true, issuedAt: true, revokedAt: true, definition: { select: { displayName: true } } } } } });
  if (!token) return invalidVerificationResult();
  const expired = token.expiresAt ? token.expiresAt.getTime() <= Date.now() : false;
  const revoked = token.status === DocumentVerificationStatus.REVOKED || Boolean(token.revokedAt) || token.documentVersion?.issuedStatus === DocumentIssuedStatus.REVOKED || Boolean(token.documentVersion?.revokedAt);
  const superseded = token.documentVersion ? await platformPrisma.documentVersion.count({ where: { tenantId: token.documentVersion.tenantId, reissueOfId: token.documentVersion.id } }) : 0;
  const status = revoked ? "REVOKED" : expired ? "EXPIRED" : superseded > 0 ? "SUPERSEDED" : "VALID";
  await platformPrisma.documentVerificationToken.update({ where: { id: token.id }, data: { verificationCount: { increment: 1 }, lastVerifiedAt: new Date() } });
  await platformPrisma.auditLog.create({ data: { tenantId: token.tenantId, module: "DOCUMENTS", action: "VERIFY_DOCUMENT_TOKEN", entityType: "DocumentVerificationToken", entityId: token.id, metadata: { result: status } as Prisma.InputJsonValue } });
  const version = token.documentVersion;
  return { status, tenantName: token.tenant.name, documentNumber: version?.documentNumber ?? token.request.documentNumber, documentType: version?.definition?.displayName ?? token.request.definition?.displayName ?? token.request.type ?? "Document", issueDate: version?.issuedAt ?? token.request.issueDate, validUntil: token.request.validityDate };
}

export async function verifyLegacyDocumentCode(code: string) {
  if (!/^[A-Za-z0-9]{12,32}$/.test(code)) return invalidVerificationResult();
  const request = await platformPrisma.documentRequest.findUnique({
    where: { verificationCode: code.toUpperCase() },
    select: {
      tenantId: true,
      documentNumber: true,
      issueDate: true,
      validityDate: true,
      definition: { select: { displayName: true } },
      type: true,
      versions: { orderBy: { version: "desc" }, take: 1, select: { issuedStatus: true, issuedAt: true, revokedAt: true, definition: { select: { displayName: true } } } },
    },
  });
  if (!request?.documentNumber) return invalidVerificationResult();
  const tenant = await platformPrisma.tenant.findUnique({ where: { id: request.tenantId }, select: { name: true } });
  if (!tenant) return invalidVerificationResult();
  const version = request.versions[0];
  const expired = request.validityDate ? request.validityDate.getTime() <= Date.now() : false;
  const revoked = version?.issuedStatus === DocumentIssuedStatus.REVOKED || Boolean(version?.revokedAt);
  const status = revoked ? "REVOKED" : expired ? "EXPIRED" : "VALID";
  await platformPrisma.auditLog.create({ data: { tenantId: request.tenantId, module: "DOCUMENTS", action: "VERIFY_LEGACY_DOCUMENT_CODE", entityType: "DocumentRequest", metadata: { result: status } as Prisma.InputJsonValue } });
  return { status, tenantName: tenant.name, documentNumber: request.documentNumber, documentType: version?.definition?.displayName ?? request.definition?.displayName ?? request.type ?? "Document", issueDate: version?.issuedAt ?? request.issueDate, validUntil: request.validityDate };
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
  return { status: "NOT_FOUND" as const, tenantName: null, documentNumber: null, documentType: null, issueDate: null, validUntil: null };
}
