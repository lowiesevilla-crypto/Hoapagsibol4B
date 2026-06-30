import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { locateUpload, uploadDirectory } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  if (!segments?.length || segments.some((segment) => segment.includes("..") || segment.includes("/") || segment.includes("\\"))) {
    return new Response("Invalid image path.", { status: 400 });
  }

  const baseDir = uploadDirectory("content");
  const filePath = path.resolve(baseDir, ...segments);
  if (!filePath.startsWith(baseDir + path.sep)) return new Response("Invalid image path.", { status: 400 });

  try {
    const storedPath = await locateUpload("content", ...segments);
    const info = await stat(storedPath);
    if (!info.isFile()) return new Response("Image not found.", { status: 404 });
    const bytes = await readFile(storedPath);
    return new Response(bytes, {
      headers: {
        "Content-Type": contentTypeFor(storedPath),
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(info.size),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("Image not found.", { status: 404 });
  }
}

function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  }[ext] ?? "application/octet-stream";
}
