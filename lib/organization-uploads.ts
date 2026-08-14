import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tenantUploadDirectory } from "@/lib/storage";
import { HOAHUB_ALLOWED_IMAGE_EXTENSIONS, validateHoaHubUpload } from "@/lib/upload-policy";

const maxBytes = 5 * 1024 * 1024;

export async function saveOrganizationImage(value: FormDataEntryValue | null, tenantSlug: string, folder: "photos" | "signatures", existing?: string | null, remove = false) {
  if (remove) return null;
  if (!isFile(value) || value.size === 0) return existing || null;
  const bytes = new Uint8Array(await value.arrayBuffer());
  const validation = validateHoaHubUpload({
    fileName: value.name,
    contentType: value.type,
    size: value.size,
    data: bytes,
    maxBytes,
    allowedExtensions: HOAHUB_ALLOWED_IMAGE_EXTENSIONS,
  });
  const targetDirectory = tenantUploadDirectory(tenantSlug, "organization", folder);
  await mkdir(targetDirectory, { recursive: true });
  const fileName = `${randomUUID()}${validation.extension}`;
  await writeFile(path.join(targetDirectory, fileName), Buffer.from(bytes));
  return `/uploads/organization-file/${tenantSlug}/${folder}/${fileName}`;
}

function isFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value !== "string" && typeof value.arrayBuffer === "function" && typeof value.size === "number" && typeof value.type === "string" && typeof value.name === "string");
}
