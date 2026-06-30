import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import { locateUpload, uploadDirectory } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  await requireUser();
  const { path: segments } = await params;
  if (!segments?.length || segments.some((segment) => segment.includes("..") || segment.includes("/") || segment.includes("\\"))) {
    return new Response("Invalid attachment path.", { status: 400 });
  }

  const baseDir = uploadDirectory("chat");
  const filePath = path.resolve(baseDir, ...segments);
  if (!filePath.startsWith(baseDir + path.sep)) {
    return new Response("Invalid attachment path.", { status: 400 });
  }

  try {
    const storedPath = await locateUpload("chat", ...segments);
    const info = await stat(storedPath);
    if (!info.isFile()) return new Response("Attachment not found.", { status: 404 });
    const bytes = await readFile(storedPath);
    const contentType = contentTypeFor(storedPath);
    const fileName = segments.at(-1) || "attachment";
    const disposition = contentType.startsWith("image/") || contentType === "application/pdf" ? "inline" : "attachment";
    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(info.size),
        "Content-Disposition": `${disposition}; filename="${fileName.replaceAll("\"", "")}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Attachment not found.", { status: 404 });
  }
}

function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }[ext] ?? "application/octet-stream";
}
