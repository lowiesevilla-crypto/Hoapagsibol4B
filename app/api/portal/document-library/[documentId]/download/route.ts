import { Readable } from "node:stream";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { openRepositoryDocumentForHomeowner } from "@/lib/document-repository/delivery";

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
  await requireUser(Role.HOMEOWNER);
  const { documentId } = await context.params;
  let delivery;
  try {
    delivery = await openRepositoryDocumentForHomeowner(documentId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document file is unavailable.";
    if (/not found|not available|not eligible|access/i.test(message)) return new Response("Document not found.", { status: 404 });
    return new Response("Document file is unavailable.", { status: 404 });
  }

  return new Response(Readable.toWeb(delivery.stream) as unknown as ReadableStream, {
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
