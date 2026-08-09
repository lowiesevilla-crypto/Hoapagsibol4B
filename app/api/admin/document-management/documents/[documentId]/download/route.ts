import { Readable } from "node:stream";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { Permission } from "@/lib/authorization/permissions";
import { requireRepositoryPermission } from "@/lib/document-repository/access";
import { writeRepositoryAudit } from "@/lib/document-repository/audit";
import { RepositoryAuditAction } from "@/lib/document-repository/constants";
import { isRepositoryDocumentSafeForDelivery } from "@/lib/document-repository/lifecycle";
import { getRepositoryDocumentForTenant } from "@/lib/document-repository/repository";
import { repositoryStorage } from "@/lib/document-repository/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeAsciiFileName(fileName: string) {
  const cleaned = fileName.replace(/[\r\n"\\/]/g, "_").replace(/[^\x20-\x7E]/g, "_").trim();
  return cleaned || "document";
}

function contentDisposition(fileName: string) {
  const fallback = safeAsciiFileName(fileName);
  const encoded = encodeURIComponent(fileName).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }) {
  const user = await requireUser(Role.ADMIN);
  await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_DOWNLOAD_INTERNAL);
  const { documentId } = await context.params;

  const document = await getRepositoryDocumentForTenant(user.tenantId, documentId);
  if (!document) return new Response("Document not found.", { status: 404 });
  if (!isRepositoryDocumentSafeForDelivery({
    tenantId: document.tenantId,
    visibility: document.visibility,
    status: document.status,
    effectiveAt: document.effectiveAt,
    expiresAt: document.expiresAt,
    malwareStatus: document.malwareScanStatus,
  })) {
    return new Response("Document download is blocked by its file safety status.", { status: 409 });
  }

  let stream;
  try {
    stream = await repositoryStorage.openReadStream({
      tenantSlug: user.tenantSlug,
      storageKey: document.storageKey,
    });
  } catch {
    return new Response("Document file is unavailable.", { status: 404 });
  }

  await writeRepositoryAudit({
    action: RepositoryAuditAction.DOWNLOADED,
    actorId: user.id,
    documentId: document.id,
    metadata: {
      title: document.title,
      fileName: document.originalFileName,
      fileSizeBytes: document.fileSizeBytes.toString(),
      revision: document.currentRevision,
    },
  });

  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": document.contentType || "application/octet-stream",
      "Content-Length": document.fileSizeBytes.toString(),
      "Content-Disposition": contentDisposition(document.originalFileName),
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
