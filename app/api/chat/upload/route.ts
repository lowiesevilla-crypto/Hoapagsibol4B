import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getChatSettings } from "@/lib/system-settings";
import { tenantUploadDirectory } from "@/lib/storage";
import { validateHoaHubUpload } from "@/lib/upload-policy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireUser();
  const settings = await getChatSettings(user.tenantId);
  const formData = await request.formData();
  const files = formData.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
  if (!files.length) return NextResponse.json({ error: "Choose at least one file to upload." }, { status: 400 });

  const maxBytes = settings.maxAttachmentMb * 1024 * 1024;
  const uploaded = [];
  const now = new Date();
  const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const uploadDir = tenantUploadDirectory(user.tenant.slug, "chat", folder);
  await mkdir(uploadDir, { recursive: true });

  for (const file of files) {
    let bytes: Uint8Array;
    let validation: ReturnType<typeof validateHoaHubUpload>;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
      validation = validateHoaHubUpload({ fileName: file.name, contentType: file.type, size: file.size, data: bytes, maxBytes });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? `${file.name}: ${error.message}` : `${file.name} is not an allowed file type.` }, { status: 400 });
    }
    if (!settings.allowedMimeTypes.includes(validation.normalizedContentType)) {
      return NextResponse.json({ error: `${file.name} is disabled by the tenant chat attachment policy.` }, { status: 400 });
    }
    const safeName = sanitizeFileName(file.name);
    const storedName = `${randomUUID()}${validation.extension}`;
    await writeFile(path.join(uploadDir, storedName), Buffer.from(bytes));
    uploaded.push({
      url: `/uploads/chat/${user.tenant.slug}/${folder}/${storedName}`,
      fileName: safeName,
      contentType: validation.normalizedContentType,
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
