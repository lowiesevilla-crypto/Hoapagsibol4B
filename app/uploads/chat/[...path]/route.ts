import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { locateTenantUpload, locateUpload } from "@/lib/storage";
import { DEFAULT_TENANT_SLUG } from "@/lib/tenant";

export const runtime = "nodejs";
const staffRoles = new Set<Role>([Role.ADMIN, Role.SYSTEM_ADMIN, Role.HOA_ADMIN, Role.STAFF, Role.SUPER_ADMIN, Role.PLATFORM_ADMIN]);

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await requireUser();
  const { path: segments } = await params;
  if (!segments?.length || segments.some((segment) => segment.includes("..") || segment.includes("/") || segment.includes("\\"))) return new Response("Invalid attachment path.", { status: 400 });
  const tenantScoped = segments[0] === user.tenant.slug;
  if (!tenantScoped && user.tenant.slug !== DEFAULT_TENANT_SLUG) return new Response("Not authorized.", { status: 403 });
  const relative = tenantScoped ? segments.slice(1) : segments;
  const url = `/uploads/chat/${segments.join("/")}`;
  if (!staffRoles.has(user.role)) {
    const participant = { conversation: { participants: { some: { userId: user.id, deletedAt: null } } } };
    const allowed = Boolean(await prisma.chatAttachment.findFirst({ where: { url, message: participant }, select: { id: true } })) || Boolean(await prisma.chatMessage.findFirst({ where: { attachmentUrl: url, ...participant }, select: { id: true } }));
    if (!allowed) return new Response("Not authorized.", { status: 403 });
  }
  try {
    const storedPath = tenantScoped ? await locateTenantUpload(user.tenant.slug, "chat", ...relative) : await locateUpload("chat", ...relative);
    const info = await stat(storedPath);
    if (!info.isFile()) return new Response("Attachment not found.", { status: 404 });
    const contentType = contentTypeFor(storedPath);
    const fileName = relative.at(-1) || "attachment";
    return new Response(new Uint8Array(await readFile(storedPath)), { headers: { "Content-Type": contentType, "Content-Length": String(info.size), "Content-Disposition": `${contentType.startsWith("image/") || contentType === "application/pdf" ? "inline" : "attachment"}; filename="${fileName.replaceAll("\"", "")}"`, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response("Attachment not found.", { status: 404 }); }
}

function contentTypeFor(filePath: string) { return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf", ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as Record<string, string>)[path.extname(filePath).toLowerCase()] ?? "application/octet-stream"; }
