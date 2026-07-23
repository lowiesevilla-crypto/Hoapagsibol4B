import { DocumentIssuedStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAccessibleGeneratedDocument } from "@/lib/document-access";
import { platformPrisma } from "@/lib/db";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccessibleGeneratedDocument(id, { requireDownload: true });
  const version = await platformPrisma.documentVersion.findFirst({
    where: { tenantId: access.user.tenantId, requestId: access.request.id, version: access.request.currentVersion },
  });
  if (!version || version.issuedStatus !== DocumentIssuedStatus.RELEASED || version.revokedAt || !version.generatedContent.trim()) {
    return NextResponse.json({ error: "The released immutable document is unavailable or revoked." }, { status: 403 });
  }
  const disposition = new URL(request.url).searchParams.get("print") === "1" ? "inline" : "attachment";
  const filename = `Certificate-of-Residency-${safeFilename(version.documentNumber)}.html`;
  await platformPrisma.auditLog.create({ data: { tenantId: access.user.tenantId, actorId: access.user.id, module: "DOCUMENTS", action: disposition === "inline" ? "PRINT_ISSUED_DOCUMENT" : "DOWNLOAD_ISSUED_DOCUMENT", entityType: "DocumentVersion", entityId: version.id, metadata: { documentNumber: version.documentNumber, immutableVersion: version.version } } });
  return new NextResponse(version.generatedContent, { headers: { "Content-Type": version.contentType || "text/html; charset=utf-8", "Content-Disposition": `${disposition}; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" } });
}

function safeFilename(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
}
