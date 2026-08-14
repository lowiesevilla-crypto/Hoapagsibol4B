import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tenantUploadDirectory } from "@/lib/storage";
import { HOAHUB_ALLOWED_IMAGE_EXTENSIONS, validateHoaHubUpload } from "@/lib/upload-policy";

const maxContentImageBytes = 5 * 1024 * 1024;

export async function resolveContentImage(formData: FormData, tenantSlug: string, existingImageUrl?: string, removeImage?: boolean): Promise<{ url: string | null; warning: string | null }> {
  const image = formData.get("image");
  if (removeImage) return { url: null, warning: null };
  if (!isUploadedFile(image) || image.size === 0) return { url: existingImageUrl?.trim() || null, warning: null };
  const bytes = new Uint8Array(await image.arrayBuffer());
  const validation = validateHoaHubUpload({
    fileName: image.name,
    contentType: image.type,
    size: image.size,
    data: bytes,
    maxBytes: maxContentImageBytes,
    allowedExtensions: HOAHUB_ALLOWED_IMAGE_EXTENSIONS,
  });
  const now = new Date();
  const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const uploadDir = tenantUploadDirectory(tenantSlug, "content", folder);
  try {
    await mkdir(uploadDir, { recursive: true });
    const storedName = `${randomUUID()}${validation.extension}`;
    await writeFile(path.join(uploadDir, storedName), Buffer.from(bytes));
    return { url: `/uploads/content/${tenantSlug}/${folder}/${storedName}`, warning: null };
  } catch {
    return { url: existingImageUrl?.trim() || null, warning: "The item was saved, but the image could not be stored. Try uploading the image again." };
  }
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value !== "string" && typeof value.arrayBuffer === "function" && typeof value.size === "number" && typeof value.type === "string" && typeof value.name === "string");
}
