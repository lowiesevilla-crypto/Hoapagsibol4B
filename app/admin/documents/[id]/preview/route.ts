import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { previewCertificate } from "@/lib/services/document-certificate-lifecycle";
import { documentContextFromUser } from "@/lib/services/document-runtime-context";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  try {
    const result = await previewCertificate(documentContextFromUser(user), id);
    if (!result.content) return NextResponse.json({ error: "Preview could not be rendered.", issues: result.issues }, { status: 422 });
    return new NextResponse(result.content, { headers: { "Content-Type": result.contentType || "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preview failed." }, { status: 403 });
  }
}
