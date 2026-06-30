import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { uploadDirectory } from "@/lib/storage";

const allowedContentImageTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);
const maxContentImageBytes = 5 * 1024 * 1024;

export async function resolveContentImage(formData: FormData, existingImageUrl?: string, removeImage?: boolean): Promise<{ url: string | null; warning: string | null }> {
  const image = formData.get("image");
  if (removeImage) return { url: null, warning: null };
  if (!isUploadedFile(image) || image.size === 0) return { url: existingImageUrl?.trim() || null, warning: null };
  const ext = allowedContentImageTypes.get(image.type);
  if (!ext) throw new Error("Upload a JPG, JPEG, PNG, or WEBP image.");
  if (image.size > maxContentImageBytes) throw new Error("Image must not exceed 5MB.");
  const now = new Date();
  const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const uploadDir = uploadDirectory("content", folder);
  try {
    await mkdir(uploadDir, { recursive: true });
    const storedName = `${randomUUID()}${ext}`;
    await writeFile(path.join(uploadDir, storedName), Buffer.from(await image.arrayBuffer()));
    return { url: `/uploads/content/${folder}/${storedName}`, warning: null };
  } catch {
    return { url: existingImageUrl?.trim() || null, warning: "The item was saved, but the image could not be stored. Try uploading the image again." };
  }
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value !== "string" && typeof value.arrayBuffer === "function" && typeof value.size === "number" && typeof value.type === "string");
}
