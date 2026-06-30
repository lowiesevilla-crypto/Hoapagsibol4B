import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const allowedTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

export const maxGcashQrBytes = 5 * 1024 * 1024;
export const gcashQrFileField = "GCASH_QR_IMAGE_FILE";
export const gcashQrRemoveField = "GCASH_QR_IMAGE_REMOVE";

export async function resolveGcashQrImage(formData: FormData, currentUrl?: string | null) {
  const file = formData.get(gcashQrFileField);
  const removeCurrent = formData.get(gcashQrRemoveField) === "on";
  if (!isUploadedFile(file) || file.size === 0) {
    return { url: removeCurrent ? null : currentUrl?.trim() || null, obsoleteUrl: removeCurrent ? currentUrl?.trim() || null : null };
  }

  const extension = allowedTypes.get(file.type);
  if (!extension) throw new Error("GCash QR image must be a JPG, JPEG, PNG, or WEBP file.");
  if (file.size > maxGcashQrBytes) throw new Error("GCash QR image must not exceed 5MB.");

  const storageDirectory = path.join(process.cwd(), "storage", "uploads", "settings", "gcash");
  const storedName = `${randomUUID()}${extension}`;
  try {
    await mkdir(storageDirectory, { recursive: true });
    await writeFile(path.join(storageDirectory, storedName), Buffer.from(await file.arrayBuffer()));
  } catch {
    throw new Error("GCash QR image could not be uploaded. Please try again.");
  }
  return { url: `/uploads/settings/gcash/${storedName}`, obsoleteUrl: currentUrl?.trim() || null };
}

export async function removeStoredGcashQrImage(url?: string | null) {
  const prefix = "/uploads/settings/gcash/";
  if (!url?.startsWith(prefix)) return;
  const fileName = url.slice(prefix.length);
  if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) return;
  await rm(path.join(process.cwd(), "storage", "uploads", "settings", "gcash", fileName), { force: true });
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value !== "string" && typeof value.arrayBuffer === "function" && typeof value.size === "number" && typeof value.type === "string");
}
