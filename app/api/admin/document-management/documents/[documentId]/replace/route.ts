import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { replaceRepositoryDocument } from "@/lib/document-repository/replace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function trustedRedirectOrigin(request: Request) {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // Fall through to the server-derived request origin when APP_URL is invalid.
    }
  }
  return new URL(request.url).origin;
}

function detailRedirect(request: Request, documentId: string, type: "success" | "error", message: string) {
  const url = new URL(`/admin/document-management/${encodeURIComponent(documentId)}`, `${trustedRedirectOrigin(request)}/`);
  url.searchParams.set(type, message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request, context: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await context.params;
  try {
    await requireUser(Role.ADMIN);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size <= 0) throw new Error("Select a replacement document file.");

    const updated = await replaceRepositoryDocument({
      documentId,
      reason: text(formData, "reason") || null,
      revisionLabel: text(formData, "revisionLabel") || null,
      file: {
        originalFileName: file.name,
        contentType: file.type || "application/octet-stream",
        data: new Uint8Array(await file.arrayBuffer()),
      },
    });

    return detailRedirect(request, documentId, "success", `Document file replaced successfully. Current revision is ${updated.currentRevision}.`);
  } catch (error) {
    return detailRedirect(request, documentId, "error", error instanceof Error ? error.message : "Document replacement failed.");
  }
}
