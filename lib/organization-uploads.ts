import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const allowed = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"]]);
const maxBytes = 5 * 1024 * 1024;

export async function saveOrganizationImage(value: FormDataEntryValue | null, folder: "photos" | "signatures", existing?: string | null, remove = false) {
  if (remove) return null;
  if (!isFile(value) || value.size === 0) return existing || null;
  const extension = allowed.get(value.type);
  if (!extension) throw new Error("Upload a JPG, JPEG, PNG, or WEBP image.");
  if (value.size > maxBytes) throw new Error("Image must not exceed 5MB.");
  const uploadDirectory = path.join(process.cwd(), "storage", "uploads", "organization", folder);
  await mkdir(uploadDirectory, { recursive: true });
  const fileName = `${randomUUID()}${extension}`;
  await writeFile(path.join(uploadDirectory, fileName), Buffer.from(await value.arrayBuffer()));
  return `/uploads/organization-file/${folder}/${fileName}`;
}

function isFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value !== "string" && typeof value.arrayBuffer === "function");
}
