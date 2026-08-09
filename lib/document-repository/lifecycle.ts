import type {
  RepositoryDocumentStatus,
  RepositoryDocumentVisibility,
  RepositoryMalwareScanStatus,
} from "@/lib/document-repository/constants";

export type RepositoryAccessState = {
  tenantId: string;
  visibility: RepositoryDocumentVisibility;
  status: RepositoryDocumentStatus;
  effectiveAt?: Date | null;
  expiresAt?: Date | null;
  malwareStatus?: RepositoryMalwareScanStatus | null;
};

export function isRepositoryDocumentEffective(document: RepositoryAccessState, now = new Date()) {
  if (document.effectiveAt && document.effectiveAt.getTime() > now.getTime()) return false;
  if (document.expiresAt && document.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

export function isRepositoryDocumentSafeForDelivery(document: RepositoryAccessState) {
  return document.malwareStatus !== "FAILED" && document.malwareStatus !== "BLOCKED" && document.malwareStatus !== "PENDING";
}

export function canHomeownerAccessRepositoryDocument(input: {
  document: RepositoryAccessState;
  activeTenantId: string;
  now?: Date;
}) {
  const { document, activeTenantId } = input;
  if (document.tenantId !== activeTenantId) return false;
  if (document.visibility !== "TENANT_PUBLIC") return false;
  if (document.status !== "PUBLISHED") return false;
  if (!isRepositoryDocumentEffective(document, input.now)) return false;
  if (!isRepositoryDocumentSafeForDelivery(document)) return false;
  return true;
}

export function assertHomeownerRepositoryDocumentAccess(input: {
  document: RepositoryAccessState;
  activeTenantId: string;
  now?: Date;
}) {
  if (!canHomeownerAccessRepositoryDocument(input)) {
    throw new Error("This document is not available in the current tenant Document Library.");
  }
  return input.document;
}
