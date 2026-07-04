import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tenantUploadDirectory } from "@/lib/storage";

const allowed = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"]]);
const maxBytes = 5 * 1024 * 1024;

export async function saveOrganizationImage(value: FormDataEntryValue | null, tenantSlug: string, folder: "photos" | "signatures", existing?: string | null, remove = false) {
  if (remove) return null;
  if (!isFile(value) || value.size === 0) return existing || null;
  const extension = allowed.get(value.type);
  if (!extension) throw new Error("Upload a JPG, JPEG, PNG, or WEBP image.");
  if (value.size > maxBytes) throw new Error("Image must not exceed 5MB.");
  const targetDirectory = tenantUploadDirectory(tenantSlug, "organization", folder);
  await mkdir(targetDirectory, { recursive: true });
  const fileName = `${randomUUID()}${extension}`;
  await writeFile(path.join(targetDirectory, fileName), Buffer.from(await value.arrayBuffer()));
  return `/uploads/organization-file/${tenantSlug}/${folder}/${fileName}`;
}

function isFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value !== "string" && typeof value.arrayBuffer === "function");
}
