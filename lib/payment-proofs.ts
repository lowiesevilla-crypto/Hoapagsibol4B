import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const allowedTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["application/pdf", ".pdf"],
]);

export const maxPaymentProofBytes = 5 * 1024 * 1024;

export async function savePaymentProof(formData: FormData) {
  const file = formData.get("proofFile");
  if (!isUploadedFile(file) || file.size === 0) return null;
  const extension = allowedTypes.get(file.type);
  if (!extension) throw new Error("Proof of payment must be a JPG, JPEG, PNG, WEBP, or PDF file.");
  if (file.size > maxPaymentProofBytes) throw new Error("Proof of payment must not exceed 5MB.");

  const now = new Date();
  const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const uploadDirectory = path.join(process.cwd(), "public", "uploads", "payments", folder);
  const storedName = `${randomUUID()}${extension}`;
  try {
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(path.join(uploadDirectory, storedName), Buffer.from(await file.arrayBuffer()));
  } catch {
    throw new Error("Proof of payment could not be uploaded. Try again or submit without an attachment.");
  }
  return {
    url: `/uploads/payments/${folder}/${storedName}`,
    fileName: file.name.slice(0, 255),
    contentType: file.type,
    size: file.size,
  };
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value !== "string" && typeof value.arrayBuffer === "function" && typeof value.size === "number" && typeof value.type === "string");
}
