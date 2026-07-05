import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { storageRoot } from "@/lib/storage";

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

export async function GET(_request: Request, { params }: { params: Promise<{ segments: string[] }> }) {
  const { segments } = await params;
  if (!segments?.length || segments.some((segment) => !segment || segment === ".." || segment.includes("/") || segment.includes("\\"))) {
    return NextResponse.json({ error: "Invalid upload path." }, { status: 400 });
  }

  const root = path.join(storageRoot(), "uploads");
  const filePath = path.resolve(root, ...segments);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid upload path." }, { status: 400 });
  }

  try {
    const data = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    return new NextResponse(data, {
      headers: {
        "Content-Type": contentTypes[extension] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
