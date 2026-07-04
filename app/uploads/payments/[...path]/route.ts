import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { locateTenantUpload, locateUpload, tenantUploadDirectory, uploadDirectory } from "@/lib/storage";
import { DEFAULT_TENANT_SLUG } from "@/lib/tenant";

export const runtime = "nodejs";
const adminRoles = new Set<Role>([Role.ADMIN, Role.SYSTEM_ADMIN, Role.HOA_ADMIN, Role.BILLING_MANAGER, Role.SUPER_ADMIN, Role.PLATFORM_ADMIN]);

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await requireUser();
  const { path: segments } = await params;
  if (!validSegments(segments)) return new Response("Invalid attachment path.", { status: 400 });
  const tenantSlug = user.tenant.slug;
  const tenantScoped = segments[0] === tenantSlug;
  if (!tenantScoped && tenantSlug !== DEFAULT_TENANT_SLUG) return new Response("Not authorized.", { status: 403 });
  const relative = tenantScoped ? segments.slice(1) : segments;
  if (!relative.length) return new Response("Invalid attachment path.", { status: 400 });
  const base = tenantScoped ? tenantUploadDirectory(tenantSlug, "payments") : uploadDirectory("payments");
  const candidate = path.resolve(base, ...relative);
  if (!candidate.startsWith(base + path.sep)) return new Response("Invalid attachment path.", { status: 400 });
  const proofUrl = `/uploads/payments/${segments.join("/")}`;
  if (!adminRoles.has(user.role)) {
    const ownsProof = user.role === Role.HOMEOWNER && (Boolean(await prisma.paymentRequest.findFirst({ where: { proofImageUrl: proofUrl, homeowner: { userId: user.id } }, select: { id: true } })) || Boolean(await prisma.payment.findFirst({ where: { proofUrl, status: "ACTIVE", homeowner: { userId: user.id } }, select: { id: true } })));
    if (!ownsProof) return new Response("Not authorized.", { status: 403 });
  }
  try {
    const storedPath = tenantScoped ? await locateTenantUpload(tenantSlug, "payments", ...relative) : await locateUpload("payments", ...relative);
    const info = await stat(storedPath);
    if (!info.isFile()) return new Response("Attachment not found.", { status: 404 });
    return new Response(new Uint8Array(await readFile(storedPath)), { headers: { "Content-Type": contentTypeFor(storedPath), "Content-Length": String(info.size), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response("Attachment not found.", { status: 404 }); }
}

function validSegments(segments: string[]) { return Boolean(segments?.length && segments.every((segment) => segment && !segment.includes("..") && !segment.includes("/") && !segment.includes("\\"))); }
function contentTypeFor(filePath: string) { return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" } as Record<string, string>)[path.extname(filePath).toLowerCase()] ?? "application/octet-stream"; }
