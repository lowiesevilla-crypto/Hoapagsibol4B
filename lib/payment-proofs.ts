import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tenantUploadDirectory } from "@/lib/storage";
import { validateHoaHubUpload } from "@/lib/upload-policy";

const paymentProofExtensions = [".pdf", ".jpg", ".jpeg", ".png"] as const;

export const maxPaymentProofBytes = 5 * 1024 * 1024;

export async function savePaymentProof(formData: FormData, tenantSlug: string) {
  const file = formData.get("proofFile");
  if (!isUploadedFile(file) || file.size === 0) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateHoaHubUpload({
    fileName: file.name,
    contentType: file.type,
    size: file.size,
    data: bytes,
    maxBytes: maxPaymentProofBytes,
    allowedExtensions: paymentProofExtensions,
  });

  const now = new Date();
  const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const targetDirectory = tenantUploadDirectory(tenantSlug, "payments", folder);
  const storedName = `${randomUUID()}${validation.extension}`;
  try {
    await mkdir(targetDirectory, { recursive: true });
    await writeFile(path.join(targetDirectory, storedName), Buffer.from(bytes));
  } catch {
    throw new Error("Proof of payment could not be uploaded. Try again or submit without an attachment.");
  }
  return {
    url: `/uploads/payments/${tenantSlug}/${folder}/${storedName}`,
    fileName: file.name.slice(0, 255),
    contentType: validation.normalizedContentType,
    size: file.size,
  };
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value !== "string" && typeof value.arrayBuffer === "function" && typeof value.size === "number" && typeof value.type === "string" && typeof value.name === "string");
}
