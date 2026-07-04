import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { locateTenantUpload, locateUpload } from "@/lib/storage";
import { DEFAULT_TENANT_SLUG, resolveTenant, tenantCanSignIn } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  if (!segments?.length || segments.some((segment) => segment.includes("..") || segment.includes("/") || segment.includes("\\"))) return new Response("Invalid image path.", { status: 400 });
  const requestedTenant = await resolveTenant(segments[0]);
  const tenantScoped = Boolean(requestedTenant);
  if (requestedTenant && !tenantCanSignIn(requestedTenant)) return new Response("Image not found.", { status: 404 });
  const tenantSlug = requestedTenant?.slug || DEFAULT_TENANT_SLUG;
  const relative = tenantScoped ? segments.slice(1) : segments;
  if (!relative.length) return new Response("Invalid image path.", { status: 400 });
  try {
    const storedPath = tenantScoped ? await locateTenantUpload(tenantSlug, "content", ...relative) : await locateUpload("content", ...relative);
    const info = await stat(storedPath);
    if (!info.isFile()) return new Response("Image not found.", { status: 404 });
    return new Response(new Uint8Array(await readFile(storedPath)), { headers: { "Content-Type": contentTypeFor(storedPath), "X-Content-Type-Options": "nosniff", "Content-Length": String(info.size), "Cache-Control": "public, max-age=86400" } });
  } catch { return new Response("Image not found.", { status: 404 }); }
}

function contentTypeFor(filePath: string) { return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" } as Record<string, string>)[path.extname(filePath).toLowerCase()] ?? "application/octet-stream"; }
