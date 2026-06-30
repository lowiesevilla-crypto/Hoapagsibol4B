import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getChatSettings } from "@/lib/system-settings";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireUser();
  const settings = await getChatSettings();
  const formData = await request.formData();
  const files = formData.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
  if (!files.length) return NextResponse.json({ error: "Choose at least one file to upload." }, { status: 400 });

  const maxBytes = settings.maxAttachmentMb * 1024 * 1024;
  const uploaded = [];
  const now = new Date();
  const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", "chat", folder);
  await mkdir(uploadDir, { recursive: true });

  for (const file of files) {
    if (!settings.allowedMimeTypes.includes(file.type)) {
      return NextResponse.json({ error: `${file.name} is not an allowed file type.` }, { status: 400 });
    }
    if (file.size > maxBytes) {
      return NextResponse.json({ error: `${file.name} exceeds the ${settings.maxAttachmentMb}MB limit.` }, { status: 400 });
    }
    const ext = extensionFor(file.name, file.type);
    const safeName = sanitizeFileName(file.name);
    const storedName = `${randomUUID()}${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, storedName), bytes);
    uploaded.push({
      url: `/uploads/chat/${folder}/${storedName}`,
      fileName: safeName,
      contentType: file.type,
      size: file.size,
    });
  }

  await writeAuditLog({ actorId: user.id, module: "CHAT", action: "UPLOAD_ATTACHMENTS", metadata: { count: uploaded.length, totalBytes: uploaded.reduce((sum, item) => sum + item.size, 0) } });
  return NextResponse.json({ files: uploaded });
}

function sanitizeFileName(name: string) {
  const cleaned = name.replace(/[^\w.\- ()]/g, "_").slice(0, 140);
  return cleaned || "attachment";
}

function extensionFor(name: string, type: string) {
  const ext = path.extname(name).toLowerCase();
  if (ext) return ext;
  return {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  }[type] ?? ".bin";
}
