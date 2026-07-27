import { DocumentIssuedStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { platformPrisma } from "@/lib/db";
import { getIssuedDocumentRenderSource } from "@/lib/services/issued-document-export";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = await getIssuedDocumentRenderSource(id, { requireDownload: true });
  const { access, version } = source;
  if (!version || version.issuedStatus !== DocumentIssuedStatus.RELEASED || version.revokedAt || !version.generatedContent.trim()) {
    return NextResponse.json({ error: "The released immutable document is unavailable or revoked." }, { status: 403 });
  }
  const disposition = new URL(request.url).searchParams.get("print") === "1" ? "inline" : "attachment";
  const filename = `${source.filenameBase}.html`;
  await platformPrisma.auditLog.create({ data: { tenantId: access.user.tenantId, actorId: access.user.id, module: "DOCUMENTS", action: disposition === "inline" ? "PRINT_ISSUED_DOCUMENT" : "DOWNLOAD_ISSUED_DOCUMENT", entityType: "DocumentVersion", entityId: version.id, metadata: { documentNumber: version.documentNumber, immutableVersion: version.version } } });
  return new NextResponse(source.selfContainedHtml, { headers: { "Content-Type": version.contentType || "text/html; charset=utf-8", "Content-Disposition": `${disposition}; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" } });
}
