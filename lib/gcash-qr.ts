import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tenantUploadDirectory } from "@/lib/storage";
import { HOAHUB_ALLOWED_IMAGE_EXTENSIONS, validateHoaHubUpload } from "@/lib/upload-policy";

export const maxGcashQrBytes = 5 * 1024 * 1024;
export const gcashQrFileField = "GCASH_QR_IMAGE_FILE";
export const gcashQrRemoveField = "GCASH_QR_IMAGE_REMOVE";

export async function resolveGcashQrImage(formData: FormData, tenantSlug: string, currentUrl?: string | null) {
  const file = formData.get(gcashQrFileField);
  const removeCurrent = formData.get(gcashQrRemoveField) === "on";
  if (!isUploadedFile(file) || file.size === 0) {
    return { url: removeCurrent ? null : currentUrl?.trim() || null, obsoleteUrl: removeCurrent ? currentUrl?.trim() || null : null };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateHoaHubUpload({
    fileName: file.name,
    contentType: file.type,
    size: file.size,
    data: bytes,
    maxBytes: maxGcashQrBytes,
    allowedExtensions: HOAHUB_ALLOWED_IMAGE_EXTENSIONS,
  });

  const storageDirectory = tenantUploadDirectory(tenantSlug, "settings", "gcash");
  const storedName = `${randomUUID()}${validation.extension}`;
  try {
    await mkdir(storageDirectory, { recursive: true });
    await writeFile(path.join(storageDirectory, storedName), Buffer.from(bytes));
  } catch {
    throw new Error("GCash QR image could not be uploaded. Please try again.");
  }
  return { url: `/uploads/settings/${tenantSlug}/gcash/${storedName}`, obsoleteUrl: currentUrl?.trim() || null };
}

export async function removeStoredGcashQrImage(tenantSlug: string, url?: string | null) {
  const prefix = `/uploads/settings/${tenantSlug}/gcash/`;
  if (!url?.startsWith(prefix)) return;
  const fileName = url.slice(prefix.length);
  if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) return;
  await rm(path.join(tenantUploadDirectory(tenantSlug, "settings", "gcash"), fileName), { force: true });
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value !== "string" && typeof value.arrayBuffer === "function" && typeof value.size === "number" && typeof value.type === "string" && typeof value.name === "string");
}
