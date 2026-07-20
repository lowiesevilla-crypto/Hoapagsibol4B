import "server-only";

import {
  DocumentApprovalDecision,
  DocumentGenerationMode,
  DocumentRequestStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { CERTIFICATE_OF_RESIDENCY_CODE } from "@/lib/services/certificate-of-residency";
import { approveDocumentRequestStep, rejectDocumentRequest } from "@/lib/services/document-approvals";
import { generateDocument } from "@/lib/services/document-generation";
import { notifyDocumentOwner, recordDocumentNotification } from "@/lib/services/document-notifications";
import { releaseIssuedDocument, revokeIssuedDocument } from "@/lib/services/document-release";
import { requireDocumentPermission, type DocumentExecutionContext } from "@/lib/services/document-runtime-context";
import { writeDocumentAudit } from "@/lib/services/document-runtime-audit";
import { getWorkflowState } from "@/lib/services/document-workflows";

export async function returnCertificateRequestForCorrection(context: DocumentExecutionContext, requestId: string, remarks: string) {
  requireDocumentPermission(context, "APPROVE_REQUESTS");
  const reason = remarks.trim();
  if (reason.length < 3) throw new Error("Return-for-correction remarks are required.");
  const request = await loadCertificateRequest(context, requestId);
  const returnable = new Set<DocumentRequestStatus>([DocumentRequestStatus.SUBMITTED, DocumentRequestStatus.PENDING_APPROVAL, DocumentRequestStatus.UNDER_REVIEW, DocumentRequestStatus.APPROVED]);
  if (!returnable.has(request.status)) throw new Error("This request can no longer be returned for correction.");
  if (request.versions.length) throw new Error("An issued request cannot return to an editable state.");
  const workflow = request.definition?.workflowDefinition;
  const current = workflow ? await getWorkflowState(context, request.id) : null;
  const stepId = current?.currentStepIds[0] ?? workflow?.steps[0]?.id ?? null;
  await platformPrisma.$transaction(async (tx) => {
    await tx.documentRequest.update({ where: { id: request.id }, data: { status: DocumentRequestStatus.RETURNED_FOR_CORRECTION, adminRemarks: reason, approvedAt: null, approvedById: null } });
    await tx.documentRequestHistory.create({ data: { tenantId: context.tenantId, requestId: request.id, status: DocumentRequestStatus.RETURNED_FOR_CORRECTION, actorId: context.authenticatedUserId, workflowVersion: workflow?.version, workflowStepId: stepId, decision: stepId ? DocumentApprovalDecision.PENDING : undefined, actingRole: context.role, decisionAt: new Date(), note: reason } });
    await writeDocumentAudit({ context, action: "RETURN_DOCUMENT_FOR_CORRECTION", entityType: "DocumentRequest", entityId: request.id, reason, after: { status: DocumentRequestStatus.RETURNED_FOR_CORRECTION }, client: tx });
  });
  await notifyDocumentOwner(context, request.homeowner.userId, "RETURNED", "Document request needs correction", reason, request.id, undefined, `RETURNED:DocumentRequest:${request.id}:${request.updatedAt.toISOString()}`);
}

export async function resubmitCertificateRequest(context: DocumentExecutionContext, input: { requestId: string; purpose: string; remarks?: string }) {
  const request = await loadCertificateRequest(context, input.requestId);
  if (context.role !== Role.HOMEOWNER || request.homeowner.userId !== context.authenticatedUserId) throw new Error("Only the requesting homeowner may resubmit this request.");
  if (request.status !== DocumentRequestStatus.RETURNED_FOR_CORRECTION || request.versions.length) throw new Error("This request is not available for correction.");
  const purpose = input.purpose.trim();
  const remarks = input.remarks?.trim() || null;
  if (purpose.length < 3 || purpose.length > 500) throw new Error("Purpose must contain 3 to 500 characters.");
  if ((remarks?.length ?? 0) > 1000) throw new Error("Additional remarks must not exceed 1000 characters.");
  const source = record(request.requestDataSnapshot);
  const sourceFields = record(source.fields);
  const requestDataSnapshot = asJson({ ...source, fields: { ...sourceFields, purpose, remarks } });
  const workflow = request.definition?.workflowDefinition;
  const step = workflow?.steps[0];
  await platformPrisma.$transaction(async (tx) => {
    await tx.documentRequest.update({ where: { id: request.id }, data: { status: DocumentRequestStatus.UNDER_REVIEW, purpose, remarks, requestDataSnapshot, adminRemarks: null, reviewedAt: null } });
    await tx.documentRequestHistory.create({ data: { tenantId: context.tenantId, requestId: request.id, status: DocumentRequestStatus.UNDER_REVIEW, actorId: context.authenticatedUserId, workflowVersion: workflow?.version, workflowStepId: step?.id, decision: step ? DocumentApprovalDecision.PENDING : undefined, note: "Corrected request resubmitted for review." } });
    await writeDocumentAudit({ context, action: "RESUBMIT_CORRECTED_DOCUMENT_REQUEST", entityType: "DocumentRequest", entityId: request.id, after: { status: DocumentRequestStatus.UNDER_REVIEW }, client: tx });
  });
  const approvers = await platformPrisma.user.findMany({ where: { tenantId: context.tenantId, active: true, role: { in: [Role.ADMIN, Role.HOA_ADMIN, Role.SYSTEM_ADMIN] } }, select: { id: true } });
  await Promise.all(approvers.map((recipient) => recordDocumentNotification({ context, recipientId: recipient.id, event: "APPROVAL_REQUIRED", subject: "Corrected document request resubmitted", message: "A Certificate of Residency request is ready for review.", entityType: "DocumentRequest", entityId: request.id, eventKey: `RESUBMITTED:DocumentRequest:${request.id}:${request.updatedAt.toISOString()}` })));
}

export async function approveCertificateRequest(context: DocumentExecutionContext, requestId: string, remarks?: string) {
  const request = await loadCertificateRequest(context, requestId);
  const state = await getWorkflowState(context, request.id);
  const stepId = state?.currentStepIds[0];
  if (!stepId) throw new Error("No workflow approval step is currently actionable.");
  const result = await approveDocumentRequestStep(context, { requestId: request.id, stepId, remarks });
  const updated = await platformPrisma.documentRequest.findFirst({ where: { id: request.id, tenantId: context.tenantId }, select: { status: true } });
  if (updated?.status === DocumentRequestStatus.APPROVED) await notifyDocumentOwner(context, request.homeowner.userId, "APPROVED", "Document request approved", "Your Certificate of Residency request was approved and is ready for issuance.", request.id, undefined, `APPROVED:DocumentRequest:${request.id}`);
  return result;
}

export async function rejectCertificateRequest(context: DocumentExecutionContext, requestId: string, remarks: string) {
  const request = await loadCertificateRequest(context, requestId);
  const reason = remarks.trim();
  if (reason.length < 3) throw new Error("A rejection reason is required.");
  const state = await getWorkflowState(context, request.id);
  const stepId = state?.currentStepIds[0];
  if (!stepId) throw new Error("No workflow approval step is currently actionable.");
  const result = await rejectDocumentRequest(context, { requestId: request.id, stepId, remarks: reason });
  await notifyDocumentOwner(context, request.homeowner.userId, "REJECTED", "Document request rejected", reason, request.id, undefined, `REJECTED:DocumentRequest:${request.id}`);
  return result;
}

export async function previewCertificate(context: DocumentExecutionContext, requestId: string) {
  const request = await loadCertificateRequest(context, requestId);
  const result = await generateDocument(context, request.id, { mode: DocumentGenerationMode.PREVIEW });
  await writeDocumentAudit({ context, action: "PREVIEW_DOCUMENT_REQUEST", entityType: "DocumentRequest", entityId: request.id, metadata: { rendered: Boolean(result.content), templateVersionId: result.templateVersionId, templateVersion: result.templateVersion } });
  return result;
}

export async function validateCertificate(context: DocumentExecutionContext, requestId: string) {
  await loadCertificateRequest(context, requestId);
  return generateDocument(context, requestId, { mode: DocumentGenerationMode.VALIDATE });
}

export async function issueCertificate(context: DocumentExecutionContext, requestId: string, idempotencyKey: string) {
  await loadCertificateRequest(context, requestId);
  return generateDocument(context, requestId, { mode: DocumentGenerationMode.ISSUE, idempotencyKey });
}

export async function reissueCertificate(context: DocumentExecutionContext, input: { requestId: string; sourceVersionId: string; reason: string; idempotencyKey: string }) {
  await loadCertificateRequest(context, input.requestId);
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("A reissue reason is required.");
  const result = await generateDocument(context, input.requestId, { mode: DocumentGenerationMode.REISSUE, reissueOfVersionId: input.sourceVersionId, reason, idempotencyKey: input.idempotencyKey });
  const request = await loadCertificateRequest(context, input.requestId);
  if (result.documentVersionId) await notifyDocumentOwner(context, request.homeowner.userId, "REISSUED", "Document reissued", `${result.documentNumber ?? "Your Certificate of Residency"} was reissued.`, request.id, { documentNumber: result.documentNumber }, `REISSUED:DocumentVersion:${result.documentVersionId}`);
  return result;
}

export async function releaseCertificate(context: DocumentExecutionContext, documentVersionId: string) {
  return releaseIssuedDocument(context, { documentVersionId, reason: "Authorized Certificate of Residency release." });
}

export async function revokeCertificate(context: DocumentExecutionContext, documentVersionId: string, reason: string) {
  return revokeIssuedDocument(context, { documentVersionId, reason });
}

async function loadCertificateRequest(context: DocumentExecutionContext, requestId: string) {
  const request = await platformPrisma.documentRequest.findFirst({
    where: { id: requestId, tenantId: context.tenantId, definition: { code: CERTIFICATE_OF_RESIDENCY_CODE } },
    include: { homeowner: { include: { user: true } }, definition: { include: { workflowDefinition: { include: { steps: { orderBy: { stepOrder: "asc" } } } } } }, versions: { orderBy: { version: "desc" } } },
  });
  if (!request || request.homeowner.tenantId !== context.tenantId) throw new Error("Certificate of Residency request was not found for the authenticated tenant.");
  return request;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
