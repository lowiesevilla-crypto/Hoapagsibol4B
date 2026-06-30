import { access } from "node:fs/promises";
import path from "node:path";

export function storageRoot() {
  const configured = process.env.STORAGE_ROOT?.trim() || "storage";
  return path.isAbsolute(configured) ? path.resolve(configured) : path.resolve(process.cwd(), configured);
}

export function uploadDirectory(...segments: string[]) {
  return path.join(storageRoot(), "uploads", ...segments);
}

export function legacyPublicUploadDirectory(...segments: string[]) {
  return path.join(process.cwd(), "public", "uploads", ...segments);
}

export async function locateUpload(category: string, ...segments: string[]) {
  const primary = uploadDirectory(category, ...segments);
  try { await access(primary); return primary; }
  catch {
    const legacy = legacyPublicUploadDirectory(category, ...segments);
    await access(legacy);
    return legacy;
  }
}
