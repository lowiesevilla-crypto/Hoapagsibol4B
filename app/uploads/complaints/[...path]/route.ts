import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { locateTenantUpload } from "@/lib/storage";

export const runtime = "nodejs";

const staffRoles = new Set<Role>([Role.ADMIN, Role.SYSTEM_ADMIN, Role.HOA_ADMIN, Role.STAFF]);

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await requireUser();
  const { path: segments } = await params;
  if (!validSegments(segments) || segments.length < 3) return new Response("Invalid attachment path.", { status: 400 });
  const tenantSlug = user.tenant.slug;
  if (segments[0] !== tenantSlug) return new Response("Not authorized.", { status: 403 });
  const url = `/uploads/complaints/${segments.join("/")}`;
  const attachment = await prisma.complaintAttachment.findFirst({
    where: {
      tenantId: user.tenantId,
      url,
      complaint: staffRoles.has(user.role) ? {} : { privacyMode: "NAMED", OR: [{ submittedById: user.id }, { homeownerId: user.homeownerProfile?.id ?? "" }] },
    },
    select: { originalName: true, contentType: true, fileSize: true },
  });
  if (!attachment) return new Response("Not authorized.", { status: 403 });
  try {
    const storedPath = await locateTenantUpload(tenantSlug, "complaints", ...segments.slice(1));
    const info = await stat(storedPath);
    if (!info.isFile()) return new Response("Attachment not found.", { status: 404 });
    return new Response(new Uint8Array(await readFile(storedPath)), { headers: { "Content-Type": attachment.contentType || contentTypeFor(storedPath), "Content-Length": String(info.size), "Content-Disposition": `${attachment.contentType === "application/pdf" || attachment.contentType.startsWith("image/") ? "inline" : "attachment"}; filename="${attachment.originalName.replaceAll("\"", "")}"`, "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Attachment not found.", { status: 404 });
  }
}

function validSegments(segments: string[]) {
  return Boolean(segments?.length && segments.every((segment) => segment && !segment.includes("..") && !segment.includes("/") && !segment.includes("\\")));
}

function contentTypeFor(filePath: string) {
  return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" } as Record<string, string>)[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}
