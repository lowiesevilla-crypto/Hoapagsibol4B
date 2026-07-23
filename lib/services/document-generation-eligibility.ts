import "server-only";

import {
  DocumentDefinitionStatus,
  DocumentGenerationMode,
  DocumentRequestStatus,
  Role,
  type Prisma,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import type { DocumentCapabilities } from "@/lib/services/document-capabilities";
import { normalizeDocumentFields, validateDocumentRequestData } from "@/lib/services/document-field-validation";
import type { DocumentGenerationIssue } from "@/lib/services/document-generation-types";
import type { DocumentExecutionContext } from "@/lib/services/document-runtime-context";

export const generationRequestInclude = {
  homeowner: { include: { user: true } },
  subjectMember: true,
  definition: {
    include: {
      fields: { where: { active: true }, orderBy: [{ displayOrder: "asc" }, { label: "asc" }] },
      assignedTemplateVersion: { include: { templateSet: true } },
      workflowDefinition: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
      signatoryOfficer: true,
      policyAssignments: { where: { enabled: true }, include: { policy: true }, orderBy: { evaluationOrder: "asc" } },
    },
  },
  histories: { orderBy: { createdAt: "asc" } },
  versions: { orderBy: { version: "desc" } },
  paymentRequest: true,
} satisfies Prisma.DocumentRequestInclude;

export type GenerationRequestRecord = Prisma.DocumentRequestGetPayload<{ include: typeof generationRequestInclude }>;

export async function loadGenerationRequest(context: DocumentExecutionContext, requestId: string) {
  const request = await platformPrisma.documentRequest.findFirst({ where: { tenantId: context.tenantId, id: requestId }, include: generationRequestInclude });
  if (!request) return null;
  return request;
}

export function validateGenerationEligibility(input: {
  context: DocumentExecutionContext;
  request: GenerationRequestRecord;
  capabilities: DocumentCapabilities;
  mode: DocumentGenerationMode;
}) {
  const { context, request, capabilities, mode } = input;
  const issues: DocumentGenerationIssue[] = [];
  const block = (code: string, domain: DocumentGenerationIssue["domain"], message: string, remediation?: string, field?: string) => issues.push({ code, domain, severity: "ERROR", blocking: true, message, remediation, field });
  if (request.tenantId !== context.tenantId || request.homeowner.tenantId !== context.tenantId) block("CROSS_TENANT_REQUEST", "AUTHORIZATION", "Document request ownership does not match the authenticated tenant.");
  if (context.role === Role.HOMEOWNER && request.homeowner.userId !== context.authenticatedUserId) block("REQUEST_OWNER_MISMATCH", "AUTHORIZATION", "This document request does not belong to the authenticated homeowner.");
  if (!request.definition) block("DEFINITION_MISSING", "DEFINITION", "Document definition is missing.", "Assign an active document definition before generation.");
  if (request.definition) {
    if (request.definition.tenantId !== context.tenantId) block("CROSS_TENANT_DEFINITION", "AUTHORIZATION", "Document definition belongs to another tenant.");
    if (!request.definition.active || request.definition.status !== DocumentDefinitionStatus.ACTIVE || request.definition.archivedAt) block("DEFINITION_INACTIVE", "DEFINITION", "Document definition is inactive or archived.", "Activate a complete definition before generation.");
    if (request.origin === "HOMEOWNER" && !capabilities.supportsHomeownerRequest) block("HOMEOWNER_CHANNEL_UNSUPPORTED", "DEFINITION", "This definition does not support homeowner requests.");
    if (request.origin === "ADMIN" && !capabilities.supportsWalkInRequest) block("WALK_IN_CHANNEL_UNSUPPORTED", "DEFINITION", "This definition does not support walk-in or office requests.");
  }
  if (blockedRequestStates.has(request.status)) block("REQUEST_STATE_BLOCKED", "REQUEST", "Cancelled or rejected requests cannot be issued.");
  if (!request.subjectSnapshot) block("SUBJECT_MISSING", "REQUEST", "The immutable request subject snapshot is missing.");
  if (request.subjectMember && request.subjectMember.tenantId !== context.tenantId) block("CROSS_TENANT_SUBJECT", "AUTHORIZATION", "Household-member subject belongs to another tenant.");
  if (!request.homeowner.address || !request.homeowner.block || !request.homeowner.lot) block("PROPERTY_RELATIONSHIP_MISSING", "REQUEST", "The requesting homeowner property relationship is incomplete.", "Complete the homeowner property profile.");
  const requestData = record(request.reviewedDataSnapshot ?? request.requestDataSnapshot);
  const fields = record(requestData.fields ?? requestData);
  if (request.definition?.fields.length) {
    const normalized = normalizeDocumentFields(request.definition.fields);
    const submitted: Record<string, FormDataEntryValue | null> = {};
    for (const field of normalized) {
      const value = fields[field.key];
      submitted[field.key] = typeof value === "boolean" ? String(value) : value == null ? null : String(value);
    }
    const validation = validateDocumentRequestData(normalized, submitted);
    validation.errors.forEach((message) => block("REQUEST_FIELD_INVALID", "REQUEST", message, "Review the request's required information."));
  }
  const validatesOfficialReadiness = mode !== DocumentGenerationMode.PREVIEW;
  if ((mode === DocumentGenerationMode.ISSUE || mode === DocumentGenerationMode.VALIDATE) && request.versions.length) block("DUPLICATE_ISSUANCE", "ISSUANCE", "This request already has an issued document. Use reissue mode.");
  if (mode === DocumentGenerationMode.REISSUE && !request.versions.length) block("REISSUE_SOURCE_MISSING", "ISSUANCE", "Reissue requires an existing issued document.");
  if (mode === DocumentGenerationMode.REISSUE && !capabilities.supportsReissue) block("REISSUE_UNSUPPORTED", "DEFINITION", "This document definition does not allow reissue.");
  if (validatesOfficialReadiness && request.paymentRequiredSnapshot && !documentPaymentConfirmed(request)) block("DOCUMENT_PAYMENT_PENDING", "REQUEST", "Document fee payment confirmation is required before issuance.", "Approve the linked document fee payment request before issuance.");
  const approvedStatus = approvedRequestStates.has(request.status);
  if (validatesOfficialReadiness && request.approvalRequiredSnapshot && !request.approvedAt && !approvedStatus) block("APPROVAL_INCOMPLETE", "WORKFLOW", "Required approval is incomplete.");
  return issues;
}

const blockedRequestStates = new Set<DocumentRequestStatus>([
  DocumentRequestStatus.CANCELLED,
  DocumentRequestStatus.REJECTED,
]);

const approvedRequestStates = new Set<DocumentRequestStatus>([
  DocumentRequestStatus.APPROVED,
  DocumentRequestStatus.PAYMENT_CONFIRMED,
  DocumentRequestStatus.GENERATING,
  DocumentRequestStatus.ISSUED,
  DocumentRequestStatus.READY_FOR_DOWNLOAD,
  DocumentRequestStatus.GENERATED,
  DocumentRequestStatus.DOWNLOADED,
]);

function documentPaymentConfirmed(request: GenerationRequestRecord) {
  return request.paymentRequest?.status === "APPROVED" || approvedRequestStates.has(request.status);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
