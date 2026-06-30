import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  await requireUser();
  const { path: segments } = await params;
  if (!segments?.length || segments.some((segment) => segment.includes("..") || segment.includes("/") || segment.includes("\\"))) return new Response("Invalid image path.", { status: 400 });
  const baseDirectory = path.resolve(process.cwd(), "storage", "uploads", "settings");
  const filePath = path.resolve(baseDirectory, ...segments);
  if (!filePath.startsWith(baseDirectory + path.sep)) return new Response("Invalid image path.", { status: 400 });
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new Response("Image not found.", { status: 404 });
    return new Response(await readFile(filePath), { headers: { "Content-Type": contentTypeFor(filePath), "Content-Length": String(info.size), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Image not found.", { status: 404 });
  }
}

function contentTypeFor(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" } as Record<string, string>)[extension] ?? "application/octet-stream";
}
