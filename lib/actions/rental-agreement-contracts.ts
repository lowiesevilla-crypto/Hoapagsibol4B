"use server";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { getRentalAgreementContractForViewer } from "@/lib/services/rental-agreement-contracts";
import { tenantUploadDirectory } from "@/lib/storage";

const MAX_SIGNED_AGREEMENT_BYTES = 15 * 1024 * 1024;
const allowedTypes = new Map([
  ["application/pdf", ".pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
]);

function requiredAgreementId(formData: FormData) {
  const value = String(formData.get("agreementId") || "").trim();
  if (!value || value.length > 191) throw new Error("Rental agreement is required.");
  return value;
}

function verifyFileSignature(bytes: Uint8Array, contentType: string) {
  if (contentType === "application/pdf") {
    return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  }
  if (contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  }
  return false;
}

export async function uploadSignedRentalAgreementAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_MANAGE);
  const agreementId = requiredAgreementId(formData);
  const upload = formData.get("signedAgreement");
  if (!(upload instanceof File) || upload.size <= 0) throw new Error("Choose a signed PDF or DOCX agreement to upload.");
  if (upload.size > MAX_SIGNED_AGREEMENT_BYTES) throw new Error("Signed rental agreement must not exceed 15 MB.");
  const contentType = upload.type.trim().toLowerCase();
  const extension = allowedTypes.get(contentType);
  if (!extension) throw new Error("Signed rental agreement must be a PDF or DOCX file.");
  const bytes = new Uint8Array(await upload.arrayBuffer());
  if (!verifyFileSignature(bytes, contentType)) throw new Error("The uploaded file content does not match its declared PDF or DOCX type.");

  const contract = await getRentalAgreementContractForViewer({
    tenantId: admin.tenantId,
    agreementId,
    canReadAllRentalAgreements: true,
  });
  if (!contract) throw new Error("Rental agreement contract was not found in this association.");

  const directory = tenantUploadDirectory(admin.tenant.slug, "rentals", agreementId, "signed");
  await mkdir(directory, { recursive: true });
  const storedName = `${randomUUID()}${extension}`;
  const destination = path.join(directory, storedName);
  await writeFile(destination, bytes, { flag: "wx" });
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const originalName = path.basename(upload.name || `signed-agreement${extension}`).slice(0, 255);

  try {
    await prisma.$transaction(async (tx) => {
      const db = tx as unknown as Prisma.TransactionClient;
      const updated = await db.$executeRaw(Prisma.sql`
        UPDATE RentalAgreementDocument
        SET signedOriginalName=${originalName},signedStoredName=${storedName},signedContentType=${contentType},
            signedFileSize=${upload.size},signedSha256=${sha256},signedUploadedById=${admin.id},signedUploadedAt=NOW(3),updatedAt=NOW(3)
        WHERE tenantId=${admin.tenantId} AND id=${contract.id} AND agreementId=${agreementId}
      `);
      if (!updated) throw new Error("Rental agreement contract could not be updated.");
      await db.auditLog.create({
        data: {
          tenantId: admin.tenantId,
          actorId: admin.id,
          module: "RENTALS",
          action: "UPLOAD_SIGNED_RENTAL_AGREEMENT",
          entityType: "RentalAgreementDocument",
          entityId: contract.id,
          metadata: {
            agreementId,
            contractNumber: contract.contractNumber,
            originalName,
            contentType,
            fileSize: upload.size,
            sha256,
            replacedSignedSha256: contract.signedSha256,
          },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    await unlink(destination).catch(() => undefined);
    throw error;
  }

  if (contract.signedStoredName && contract.signedStoredName !== storedName) {
    await unlink(path.join(directory, path.basename(contract.signedStoredName))).catch(() => undefined);
  }
  revalidatePath(`/admin/rentals/agreements/${agreementId}`);
  revalidatePath("/portal/rentals");
  redirect(`/admin/rentals/agreements/${agreementId}?success=signed-agreement-uploaded`);
}
