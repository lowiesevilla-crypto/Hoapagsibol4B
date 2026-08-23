"use server";

import { DocumentGenerationMode, DocumentOutstandingBalancePolicy, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { processDocumentRequestAction } from "@/lib/actions/documents";
import { requireUser } from "@/lib/auth";
import { platformPrisma, prisma } from "@/lib/db";
import { asJson, getActiveOrganizationOfficers, officerSnapshot } from "@/lib/organization";
import {
  canOverrideDocumentBalancePolicy,
  getQualifyingHomeownerBalance,
  policyForDocumentRequest,
} from "@/lib/services/document-balance-policy";
import { generateDocument } from "@/lib/services/document-generation";
import { documentContextFromUser } from "@/lib/services/document-runtime-context";

/**
 * Reissues an already-generated definition-backed document through the same
 * canonical visual template renderer used for first issuance.
 *
 * The legacy processDocumentRequestAction regeneration path renders structured
 * WYSIWYG template JSON as flattened text. Keeping definition-backed reissue in
 * the canonical engine prevents visual templates from being downgraded and also
 * preserves renderer metadata used by view/print/PDF routes.
 */
export async function reissueGeneratedDocumentAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const id = String(formData.get("id") || "").trim();
  const requestedReturnPath = String(formData.get("returnTo") || "");
  const returnPath = /^\/admin\/documents\/[A-Za-z0-9_-]+$/.test(requestedReturnPath)
    ? requestedReturnPath
    : id
      ? `/admin/documents/${id}`
      : "/admin/documents";
  const fail = (message: string): never => redirect(`${returnPath}?error=${encodeURIComponent(message)}`);

  if (!id) redirect(`${returnPath}?error=${encodeURIComponent("Document request is required.")}`);

  const request = await prisma.documentRequest.findFirst({
    where: { id, tenantId: admin.tenantId },
    include: {
      homeowner: { include: { user: true } },
      definition: true,
      versions: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (!request) redirect(`${returnPath}?error=${encodeURIComponent("Document request not found.")}`);

  // Preserve legacy documents on their existing compatibility path. The defect
  // being fixed here is specific to definition-backed WYSIWYG templates.
  if (!request.definitionId || !request.definition) {
    formData.set("operation", "regenerate");
    return processDocumentRequestAction(formData);
  }

  const currentVersion = request.versions[0] ?? null;
  if (!currentVersion || !request.generatedContent || !request.documentNumber || request.archivedAt) {
    redirect(`${returnPath}?error=${encodeURIComponent("Only active issued documents with an immutable version can be reissued.")}`);
  }
  if (!request.definition.allowRegeneration) {
    redirect(`${returnPath}?error=${encodeURIComponent("This document definition does not allow reissue. Enable regeneration/reissue in the Document Definition first.")}`);
  }

  const purpose = clean(formData.get("purpose")) ?? request.purpose;
  const adminRemarks = clean(formData.get("adminRemarks")) ?? request.adminRemarks;
  const validityDate = parseOptionalDate(formData.get("validityDate"), fail) ?? request.validityDate;
  const scheduledDate = parseOptionalDate(formData.get("scheduledDate"), fail) ?? request.scheduledDate;
  const startTime = clean(formData.get("startTime")) ?? request.startTime;
  const endTime = clean(formData.get("endTime")) ?? request.endTime;
  const partyName = clean(formData.get("partyName")) ?? request.partyName;
  const vehicleDetails = clean(formData.get("vehicleDetails")) ?? request.vehicleDetails;
  const contractorDetails = clean(formData.get("contractorDetails")) ?? request.contractorDetails;
  const representativeName = clean(formData.get("representativeName")) ?? request.representativeName;
  const propertyDetails = clean(formData.get("propertyDetails")) ?? request.propertyDetails ?? request.homeowner.address;
  const passType = clean(formData.get("passType")) ?? request.passType;
  const processedByOfficerId = clean(formData.get("processedByOfficerId")) ?? request.processedByOfficerId;
  const approvedByOfficerId = clean(formData.get("approvedByOfficerId")) ?? request.approvedByOfficerId;
  const numberOfCopies = Math.max(1, Math.min(25, Number(formData.get("numberOfCopies")) || request.numberOfCopies));

  if (validityDate && validityDate < todayUtc()) fail("Validity date must be today or later.");
  if (scheduledDate && scheduledDate < todayUtc()) fail("Scheduled date must be today or later.");

  const [outstandingBalance, officers] = await Promise.all([
    getQualifyingHomeownerBalance(admin.tenantId, request.homeownerId),
    getActiveOrganizationOfficers(admin.tenantId),
  ]);
  const balancePolicy = policyForDocumentRequest(request);
  const requestedDownloadOverride = formData.get("allowDownloadDespiteBalance") === "on";
  const allowDownloadDespiteBalance = balancePolicy === DocumentOutstandingBalancePolicy.ALLOW_ADMIN_OVERRIDE
    ? requestedDownloadOverride
    : request.allowDownloadDespiteBalance;
  const downloadOverrideReason = clean(formData.get("downloadOverrideReason")) ?? request.downloadOverrideReason;

  if (requestedDownloadOverride && balancePolicy !== DocumentOutstandingBalancePolicy.ALLOW_ADMIN_OVERRIDE) {
    fail("This document definition does not allow admin balance overrides.");
  }
  if (allowDownloadDespiteBalance && !canOverrideDocumentBalancePolicy(admin.role)) {
    fail("Your role is not authorized to allow download despite an outstanding balance.");
  }
  if (allowDownloadDespiteBalance && outstandingBalance > 0 && !downloadOverrideReason) {
    fail("Enter a reason when allowing download despite an outstanding balance.");
  }

  const processedOfficer = processedByOfficerId ? officers.find((officer) => officer.id === processedByOfficerId) ?? null : null;
  const approvedOfficer = approvedByOfficerId ? officers.find((officer) => officer.id === approvedByOfficerId) ?? null : null;
  if (processedByOfficerId && !processedOfficer) fail("Select an active processing officer.");
  if (approvedByOfficerId && !approvedOfficer) fail("Select an active approving officer.");

  const previousSnapshot = record(request.reviewedDataSnapshot ?? request.requestDataSnapshot);
  const previousFields = record(previousSnapshot.fields ?? previousSnapshot);
  const reviewedDataSnapshot = asJson({
    ...previousSnapshot,
    fields: {
      ...previousFields,
      purpose,
      remarks: request.remarks,
      validityDate: validityDate?.toISOString().slice(0, 10) ?? null,
      scheduledDate: scheduledDate?.toISOString().slice(0, 10) ?? null,
      startTime,
      endTime,
      partyName,
      vehicleDetails,
      contractorDetails,
      representativeName,
      propertyDetails,
      passType,
    },
    adminRemarks,
    processedByOfficerId: processedOfficer?.id ?? null,
    approvedByOfficerId: approvedOfficer?.id ?? null,
    numberOfCopies,
  });

  const now = new Date();
  await platformPrisma.$transaction(async (tx) => {
    await tx.documentRequest.update({
      where: { id: request.id },
      data: {
        purpose,
        validityDate,
        scheduledDate,
        startTime,
        endTime,
        partyName,
        vehicleDetails,
        contractorDetails,
        representativeName,
        propertyDetails,
        passType,
        numberOfCopies,
        adminRemarks,
        reviewedDataSnapshot,
        outstandingBalanceAtRequest: outstandingBalance,
        allowDownloadDespiteBalance,
        downloadOverrideReason: allowDownloadDespiteBalance ? downloadOverrideReason : null,
        downloadOverrideAt: allowDownloadDespiteBalance ? request.downloadOverrideAt ?? now : null,
        downloadOverrideById: allowDownloadDespiteBalance ? request.downloadOverrideById ?? admin.id : null,
        processedById: admin.id,
        processedByOfficerId: processedOfficer?.id ?? null,
        approvedByOfficerId: approvedOfficer?.id ?? null,
        processedOfficerSnapshot: processedOfficer ? asJson(officerSnapshot(processedOfficer)) : undefined,
        approvedOfficerSnapshot: approvedOfficer ? asJson(officerSnapshot(approvedOfficer)) : undefined,
        downloadedAt: null,
      },
    });
    await tx.documentRequestHistory.create({
      data: {
        tenantId: request.tenantId,
        requestId: request.id,
        status: request.status,
        actorId: admin.id,
        note: "Prepared for canonical template reissue. The previous immutable document version remains preserved.",
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: request.tenantId,
        actorId: admin.id,
        module: "DOCUMENTS",
        action: "PREPARE_CANONICAL_DOCUMENT_REISSUE",
        entityType: "DocumentRequest",
        entityId: request.id,
        metadata: {
          definitionId: request.definitionId,
          sourceDocumentVersionId: currentVersion.id,
          sourceVersion: currentVersion.version,
          sourceRendererName: currentVersion.rendererName,
          capturedTemplateVersionId: request.templateVersionIdSnapshot,
          capturedTemplateVersion: request.templateVersionSnapshot,
          previousStatus: request.status,
        },
      },
    });
  });

  const reason = adminRemarks || "Admin reissued the document using its captured published visual template.";
  const result = await generateDocument(documentContextFromUser(admin), request.id, {
    mode: DocumentGenerationMode.REISSUE,
    reason,
    reissueOfVersionId: currentVersion.id,
    idempotencyKey: `admin:template-reissue:${request.id}:v${request.currentVersion + 1}`,
  });

  if (!result.documentVersionId) {
    const blocking = result.issues.find((issue) => issue.blocking);
    fail(blocking?.message || "The document could not be reissued from its published visual template.");
  }

  revalidateDocumentPages(request.id);
  redirect(`${returnPath}?success=reissued&message=${encodeURIComponent(`Document reissued from the captured visual template${result.documentNumber ? ` as ${result.documentNumber}` : ""}. The previous version was preserved.`)}`);
}

function clean(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text || null;
}

function parseOptionalDate(value: FormDataEntryValue | null, fail: (message: string) => never) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) fail("Enter a valid date.");
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) fail("Enter a valid date.");
  return date;
}

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function revalidateDocumentPages(id: string) {
  for (const path of [
    "/admin/documents",
    `/admin/documents/${id}`,
    "/portal/documents",
    `/documents/${id}`,
    `/documents/${id}/print`,
    `/documents/${id}/pdf`,
    `/documents/${id}/download`,
  ]) revalidatePath(path);
}
