import "server-only";

import type { Readable } from "node:stream";
import { Permission } from "@/lib/authorization/permissions";
import { requireUser } from "@/lib/auth";
import { requireRepositoryPermission } from "@/lib/document-repository/access";
import {
  assertHomeownerRepositoryDocumentAccess,
  isRepositoryDocumentSafeForDelivery,
} from "@/lib/document-repository/lifecycle";
import { repositoryStorage } from "@/lib/document-repository/storage";
import { prisma } from "@/lib/db";

export type RepositoryDelivery = {
  documentId: string;
  title: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: bigint;
  checksumSha256: string;
  stream: Readable;
};

async function findActiveTenantDocument(tenantId: string, documentId: string) {
  const id = documentId.trim();
  if (!id) throw new Error("Document ID is required.");

  const document = await prisma.repositoryDocument.findFirst({
    where: { tenantId, id },
    select: {
      id: true,
      tenantId: true,
      title: true,
      status: true,
      visibility: true,
      effectiveAt: true,
      expiresAt: true,
      malwareScanStatus: true,
      originalFileName: true,
      storageKey: true,
      contentType: true,
      fileSizeBytes: true,
      checksumSha256: true,
    },
  });
  if (!document) throw new Error("Repository document not found in the active tenant.");
  return document;
}

async function openDelivery(input: {
  tenantSlug: string;
  document: Awaited<ReturnType<typeof findActiveTenantDocument>>;
}): Promise<RepositoryDelivery> {
  const stream = await repositoryStorage.openReadStream({
    tenantSlug: input.tenantSlug,
    storageKey: input.document.storageKey,
  });
  return {
    documentId: input.document.id,
    title: input.document.title,
    fileName: input.document.originalFileName,
    contentType: input.document.contentType,
    fileSizeBytes: input.document.fileSizeBytes,
    checksumSha256: input.document.checksumSha256,
    stream,
  };
}

/** Authorized tenant staff delivery. Lifecycle may be Draft/Internal, but unsafe malware states are never delivered. */
export async function openRepositoryDocumentForStaff(documentId: string): Promise<RepositoryDelivery> {
  const actor = await requireUser();
  const { context } = await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_DOWNLOAD_INTERNAL);
  const document = await findActiveTenantDocument(context.tenantId, documentId);
  if (!isRepositoryDocumentSafeForDelivery({
    tenantId: document.tenantId,
    status: document.status,
    visibility: document.visibility,
    effectiveAt: document.effectiveAt,
    expiresAt: document.expiresAt,
    malwareStatus: document.malwareScanStatus,
  })) {
    throw new Error("This repository file is not safe for delivery.");
  }
  return openDelivery({ tenantSlug: actor.tenant.slug, document });
}

/** Homeowner delivery is restricted to same-tenant, published tenant-public documents that are currently effective and safe. */
export async function openRepositoryDocumentForHomeowner(documentId: string): Promise<RepositoryDelivery> {
  const actor = await requireUser();
  const { context } = await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_READ_PUBLIC);
  const document = await findActiveTenantDocument(context.tenantId, documentId);

  assertHomeownerRepositoryDocumentAccess({
    activeTenantId: context.tenantId,
    document: {
      tenantId: document.tenantId,
      status: document.status,
      visibility: document.visibility,
      effectiveAt: document.effectiveAt,
      expiresAt: document.expiresAt,
      malwareStatus: document.malwareScanStatus,
    },
  });

  return openDelivery({ tenantSlug: actor.tenant.slug, document });
}
