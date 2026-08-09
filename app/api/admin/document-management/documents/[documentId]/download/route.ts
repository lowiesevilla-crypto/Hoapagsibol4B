import { Readable } from "node:stream";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { writeRepositoryAudit } from "@/lib/document-repository/audit";
import { RepositoryAuditAction } from "@/lib/document-repository/constants";
import { openRepositoryDocumentForStaff } from "@/lib/document-repository/delivery";

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
  const { documentId } = await context.params;

  let delivery;
  try {
    delivery = await openRepositoryDocumentForStaff(documentId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document file is unavailable.";
    if (/not found/i.test(message)) return new Response("Document not found.", { status: 404 });
    if (/safe|malware|blocked/i.test(message)) return new Response("Document download is blocked by its file safety status.", { status: 409 });
    return new Response("Document file is unavailable.", { status: 404 });
  }

  await writeRepositoryAudit({
    action: RepositoryAuditAction.DOWNLOADED,
    actorId: user.id,
    documentId: delivery.documentId,
    metadata: {
      title: delivery.title,
      fileName: delivery.fileName,
      fileSizeBytes: delivery.fileSizeBytes.toString(),
      checksumSha256: delivery.checksumSha256,
    },
  });

  return new Response(Readable.toWeb(delivery.stream) as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": delivery.contentType || "application/octet-stream",
      "Content-Length": delivery.fileSizeBytes.toString(),
      "Content-Disposition": contentDisposition(delivery.fileName),
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
