import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tenantUploadDirectory } from "@/lib/storage";

export const DEFAULT_TENANT_LOGO_URL = "/Hoahub-logo.png";
export const tenantLogoFileField = "TENANT_LOGO_FILE";
export const tenantLogoRemoveField = "TENANT_LOGO_REMOVE";
export const maxTenantLogoBytes = 3 * 1024 * 1024;

const allowedTenantLogoTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

export async function resolveTenantLogo(formData: FormData, tenantSlug: string, currentUrl?: string | null) {
  const file = formData.get(tenantLogoFileField);
  const removeCurrent = formData.get(tenantLogoRemoveField) === "on";
  const normalizedCurrent = currentUrl?.trim() || DEFAULT_TENANT_LOGO_URL;

  if (!isUploadedFile(file) || file.size === 0) {
    return {
      url: removeCurrent ? DEFAULT_TENANT_LOGO_URL : normalizedCurrent,
      obsoleteUrl: removeCurrent ? normalizedCurrent : null,
    };
  }

  const extension = allowedTenantLogoTypes.get(file.type);
  if (!extension) throw new Error("Tenant logo must be a JPG, JPEG, PNG, or WEBP file.");
  if (file.size > maxTenantLogoBytes) throw new Error("Tenant logo must not exceed 3MB.");

  const storageDirectory = tenantUploadDirectory(tenantSlug, "branding", "logo");
  const storedName = `${randomUUID()}${extension}`;
  try {
    await mkdir(storageDirectory, { recursive: true });
    await writeFile(path.join(storageDirectory, storedName), Buffer.from(await file.arrayBuffer()));
  } catch {
    throw new Error("Tenant logo could not be uploaded. Please try again.");
  }

  return {
    url: `/uploads/tenants/${tenantSlug}/branding/logo/${storedName}`,
    obsoleteUrl: normalizedCurrent,
  };
}

export async function removeStoredTenantLogo(tenantSlug: string, url?: string | null) {
  const prefix = `/uploads/tenants/${tenantSlug}/branding/logo/`;
  if (!url?.startsWith(prefix)) return;
  const fileName = url.slice(prefix.length);
  if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) return;
  await rm(path.join(tenantUploadDirectory(tenantSlug, "branding", "logo"), fileName), { force: true });
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value !== "string" && typeof value.arrayBuffer === "function" && typeof value.size === "number" && typeof value.type === "string");
}
