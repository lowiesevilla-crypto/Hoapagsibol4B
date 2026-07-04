import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import { locateTenantUpload, uploadDirectory } from "@/lib/storage";
import { DEFAULT_TENANT_SLUG } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await requireUser();
  const { path: segments } = await params;
  if (!segments?.length || segments.some((segment) => segment.includes("..") || segment.includes("/") || segment.includes("\\"))) return new Response("Invalid image path.", { status: 400 });
  const tenantScoped = segments[0] === user.tenant.slug;
  if (!tenantScoped && user.tenant.slug !== DEFAULT_TENANT_SLUG) return new Response("Not authorized.", { status: 403 });
  const relative = tenantScoped ? segments.slice(1) : segments;
  try {
    const filePath = tenantScoped ? await locateTenantUpload(user.tenant.slug, "settings", ...relative) : path.join(uploadDirectory("settings"), ...relative);
    const info = await stat(filePath);
    if (!info.isFile()) return new Response("Image not found.", { status: 404 });
    return new Response(new Uint8Array(await readFile(filePath)), { headers: { "Content-Type": contentTypeFor(filePath), "Content-Length": String(info.size), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response("Image not found.", { status: 404 }); }
}

function contentTypeFor(filePath: string) { return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" } as Record<string, string>)[path.extname(filePath).toLowerCase()] ?? "application/octet-stream"; }
