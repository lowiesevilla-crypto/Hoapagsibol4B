import "server-only";

import {
  DocumentApprovalDecision,
  CollectionType,
  DocumentDeliveryMode,
  DocumentDefinitionStatus,
  DocumentGenerationMode,
  DocumentGenerationState,
  DocumentRequestStatus,
  DocumentSubjectType,
  PaymentMethod,
  PaymentRequestStatus,
  PaymentRequestType,
  Prisma,
  Role,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { generateDocument } from "@/lib/services/document-generation";
import { DocumentRuntimeError } from "@/lib/services/document-runtime-errors";
import { requireDocumentPermission, type DocumentExecutionContext } from "@/lib/services/document-runtime-context";
import { startDocumentWorkflow } from "@/lib/services/document-workflows";
import { recordDocumentNotification } from "@/lib/services/document-notifications";
import { householdMemberEligibility } from "@/lib/services/household-member-eligibility";

const payableStatuses = new Set<DocumentRequestStatus>([
  DocumentRequestStatus.SUBMITTED,
  DocumentRequestStatus.PAYMENT_PENDING,
  DocumentRequestStatus.PENDING_PAYMENT,
  DocumentRequestStatus.PAYMENT_CONFIRMED,
]);

const approvableStatuses = new Set<DocumentRequestStatus>([
  DocumentRequestStatus.SUBMITTED,
  DocumentRequestStatus.PAYMENT_CONFIRMED,
  DocumentRequestStatus.PENDING_APPROVAL,
  DocumentRequestStatus.UNDER_REVIEW,
  DocumentRequestStatus.APPROVED,
]);

const issuedStatuses = new Set<DocumentRequestStatus>([
  DocumentRequestStatus.ISSUED,
  DocumentRequestStatus.READY_FOR_DOWNLOAD,
  DocumentRequestStatus.GENERATED,
  DocumentRequestStatus.DOWNLOADED,
]);

export type DocumentWorkflowExecutorResult = {
  requestId: string;
  status: DocumentRequestStatus;
  action:
    | "NOOP"
    | "PAYMENT_REQUIRED"
    | "PAYMENT_CONFIRMED"
    | "APPROVAL_REQUIRED"
    | "REQUEST_ONLY"
    | "GENERATED"
    | "GENERATION_FAILED";
  paymentRequestId?: string | null;
  documentVersionId?: string | null;
  documentNumber?: string | null;
  verificationUrl?: string | null;
  failureMessage?: string | null;
};

const workflowRequestInclude = {
  homeowner: { include: { user: true } },
  subjectMember: true,
  definition: { include: { workflowDefinition: { include: { steps: { orderBy: { stepOrder: "asc" } } } }, assignedTemplateVersion: { include: { templateSet: true } } } },
  paymentRequest: true,
  versions: { orderBy: { version: "desc" } },
  histories: { orderBy: { createdAt: "desc" }, take: 10 },
} satisfies Prisma.DocumentRequestInclude;

type WorkflowRequest = Prisma.DocumentRequestGetPayload<{ include: typeof workflowRequestInclude }>;

export async function executeDocumentWorkflowAfterSubmission(context: DocumentExecutionContext, requestId: string): Promise<DocumentWorkflowExecutorResult> {
  const request = await loadWorkflowRequest(context, requestId);
  await assertWorkflowRequest(context, request);
  if (issuedStatuses.has(request.status) || request.currentVersion > 0) return { requestId: request.id, status: request.status, action: "NOOP", documentNumber: request.documentNumber };
  if (request.status === DocumentRequestStatus.CANCELLED || request.status === DocumentRequestStatus.REJECTED || request.status === DocumentRequestStatus.REVOKED) {
    throw new DocumentRuntimeError("INVALID_STATE", "Cancelled, rejected, or revoked document requests cannot continue.");
  }

  if (isAdminOfficeRequest(context, request)) {
    const payment = request.paymentRequiredSnapshot ? await ensureDocumentFeePaymentRequest(context, request) : null;
    const issuanceRequest = await persistAdminOfficeApprovalBypass(context, request);
    await platformPrisma.auditLog.create({
      data: {
        tenantId: context.tenantId,
        actorId: context.authenticatedUserId,
        module: "DOCUMENTS",
        action: "ADMIN_OFFICE_DIRECT_ISSUANCE",
        entityType: "DocumentRequest",
        entityId: request.id,
        metadata: {
          definitionId: request.definitionId,
          definitionWorkflow: workflowLabel(request),
          approvalBypassedForAdminIssuance: true,
          configuredApprovalRequired: request.approvalRequiredSnapshot,
          effectiveApprovalRequired: false,
          paymentRequired: request.paymentRequiredSnapshot,
          paymentRequestId: payment?.id ?? null,
          paymentStatus: payment?.status ?? null,
        },
      },
    });
    const result = await issueOfficialDocument(context, issuanceRequest);
    return payment ? { ...result, paymentRequestId: payment.id } : result;
  }

  if (isRequestOnly(request)) {
    const updated = await ensureStatus(context, request, DocumentRequestStatus.SUBMITTED, "Request recorded for manual office processing.");
    return { requestId: request.id, status: updated.status, action: "REQUEST_ONLY" };
  }

  if (request.paymentRequiredSnapshot) {
    const payment = request.paymentRequest?.status === PaymentRequestStatus.APPROVED
      ? request.paymentRequest
      : await ensureDocumentFeePaymentRequest(context, request);
    if (payment.status !== PaymentRequestStatus.APPROVED) {
      const updated = await ensureStatus(context, request, DocumentRequestStatus.PENDING_PAYMENT, "Document fee payment confirmation is required before this request can proceed.", { paymentRequestId: payment.id });
      return { requestId: request.id, status: updated.status, action: "PAYMENT_REQUIRED", paymentRequestId: payment.id };
    }
    const paid = await ensureStatus(context, request, DocumentRequestStatus.PAYMENT_CONFIRMED, "Document fee payment was confirmed.", { paymentRequestId: payment.id });
    return continueAfterPaymentOrApproval(context, { ...request, status: paid.status, paymentRequest: payment });
  }

  return continueAfterPaymentOrApproval(context, request);
}

export async function advanceDocumentWorkflowAfterPayment(context: DocumentExecutionContext, requestId: string): Promise<DocumentWorkflowExecutorResult> {
  const request = await loadWorkflowRequest(context, requestId);
  await assertWorkflowRequest(context, request);
  if (issuedStatuses.has(request.status) || request.currentVersion > 0) {
    return { requestId: request.id, status: request.status, action: "NOOP", paymentRequestId: request.paymentRequest?.id ?? null, documentNumber: request.documentNumber };
  }
  if (!request.paymentRequiredSnapshot) return executeDocumentWorkflowAfterSubmission(context, request.id);
  if (request.paymentRequest?.status !== PaymentRequestStatus.APPROVED) {
    throw new DocumentRuntimeError("INVALID_STATE", "Document fee payment has not been confirmed.");
  }
  const paid = await ensureStatus(context, request, DocumentRequestStatus.PAYMENT_CONFIRMED, "Document fee payment was confirmed.", { paymentRequestId: request.paymentRequest.id });
  return continueAfterPaymentOrApproval(context, { ...request, status: paid.status });
}

export async function approveDocumentWorkflowRequest(context: DocumentExecutionContext, requestId: string, input: {
  remarks?: string | null;
  reviewedDataSnapshot?: Prisma.InputJsonValue;
  validityDate?: Date | null;
  processedByOfficerId?: string | null;
  approvedByOfficerId?: string | null;
  adminData?: Record<string, unknown>;
  editAudits?: Array<{ actorId: string; fieldName: string; previousValue: Prisma.InputJsonValue; newValue: Prisma.InputJsonValue; note?: string | null }>;
} = {}): Promise<DocumentWorkflowExecutorResult> {
  requireDocumentPermission(context, "APPROVE_REQUESTS");
  const request = await loadWorkflowRequest(context, requestId);
  await assertWorkflowRequest(context, request);
  if (request.paymentRequiredSnapshot && request.paymentRequest?.status !== PaymentRequestStatus.APPROVED && !paymentConfirmedByStatus(request.status)) {
    throw new DocumentRuntimeError("WORKFLOW_BLOCKED", "Document fee payment confirmation is required before approval.");
  }
  if (!approvableStatuses.has(request.status)) throw new DocumentRuntimeError("INVALID_STATE", "This request is not waiting for approval.");
  assertConfiguredApprover(context, request);
  const now = new Date();
  await platformPrisma.$transaction(async (tx) => {
    await tx.documentRequest.update({
      where: { id: request.id },
      data: {
        status: DocumentRequestStatus.APPROVED,
        reviewedAt: request.reviewedAt ?? now,
        approvedAt: now,
        approvedById: context.authenticatedUserId,
        validityDate: input.validityDate ?? request.validityDate,
        processedByOfficerId: input.processedByOfficerId ?? request.processedByOfficerId,
        approvedByOfficerId: input.approvedByOfficerId ?? request.approvedByOfficerId,
        adminRemarks: input.remarks ?? request.adminRemarks,
        reviewedDataSnapshot: input.reviewedDataSnapshot ?? request.reviewedDataSnapshot ?? undefined,
        ...(input.adminData ?? {}),
      },
    });
    if (input.editAudits?.length) {
      await tx.documentRequestEditAudit.createMany({ data: input.editAudits.map((audit) => ({ ...audit, tenantId: context.tenantId, requestId: request.id })) });
    }
    if (request.definition?.workflowDefinition?.steps.length) {
      await tx.documentRequestHistory.createMany({
        data: request.definition.workflowDefinition.steps.filter((step) => step.required).map((step) => ({
          tenantId: context.tenantId,
          requestId: request.id,
          status: DocumentRequestStatus.APPROVED,
          actorId: context.authenticatedUserId,
          workflowVersion: request.definition!.workflowDefinition!.version,
          workflowStepId: step.id,
          decision: DocumentApprovalDecision.APPROVED,
          actingRole: context.role,
          decisionAt: now,
          note: input.remarks?.trim() || "Approved through the document workflow executor.",
        })),
      });
    }
    await tx.documentRequestHistory.create({ data: { tenantId: context.tenantId, requestId: request.id, status: DocumentRequestStatus.APPROVED, actorId: context.authenticatedUserId, note: input.remarks?.trim() || "Approved for official generation." } });
    await tx.auditLog.create({ data: { tenantId: context.tenantId, actorId: context.authenticatedUserId, module: "DOCUMENTS", action: "APPROVE_DOCUMENT_WORKFLOW", entityType: "DocumentRequest", entityId: request.id, metadata: { status: "APPROVED", workflow: workflowLabel(request) } } });
  });
  const fresh = await loadWorkflowRequest(context, request.id);
  return issueOfficialDocument(context, fresh);
}

export async function retryDocumentGeneration(context: DocumentExecutionContext, requestId: string): Promise<DocumentWorkflowExecutorResult> {
  requireDocumentPermission(context, "ISSUE_DOCUMENT");
  const request = await loadWorkflowRequest(context, requestId);
  await assertWorkflowRequest(context, request);
  if (request.versions.length || request.currentVersion > 0 || issuedStatuses.has(request.status)) {
    await reconcileIssuedRequestIfNeeded(context, request);
    return { requestId: request.id, status: DocumentRequestStatus.ISSUED, action: "NOOP", documentNumber: request.documentNumber };
  }
  if (request.status === DocumentRequestStatus.CANCELLED || request.status === DocumentRequestStatus.REJECTED || request.status === DocumentRequestStatus.REVOKED) {
    throw new DocumentRuntimeError("INVALID_STATE", "Cancelled, rejected, or revoked document requests cannot be retried.");
  }
  await assertNoActiveGenerationAttempt(context, request.id);
  const restored = await restoreRecoverableStatus(context, request, "Authorized generation retry prepared this request for processing.");
  return issueOfficialDocument(context, { ...request, status: restored.status });
}

async function continueAfterPaymentOrApproval(context: DocumentExecutionContext, request: WorkflowRequest): Promise<DocumentWorkflowExecutorResult> {
  if (request.approvalRequiredSnapshot || request.definition?.requiresAdminReview || request.definition?.deliveryMode === DocumentDeliveryMode.APPROVAL_REQUIRED || request.definition?.deliveryMode === DocumentDeliveryMode.PAYMENT_AND_APPROVAL_REQUIRED) {
    if (!request.approvedAt && request.status !== DocumentRequestStatus.APPROVED) {
      const updated = await ensureStatus(context, request, DocumentRequestStatus.PENDING_APPROVAL, "Request is waiting for tenant approval.");
      if (request.definition?.workflowDefinitionId) await startDocumentWorkflow(context, request.id);
      await notifyTenantApprovers(context, request);
      return { requestId: request.id, status: updated.status, action: "APPROVAL_REQUIRED", paymentRequestId: request.paymentRequest?.id ?? null };
    }
  }
  return issueOfficialDocument(context, request);
}

async function issueOfficialDocument(context: DocumentExecutionContext, request: WorkflowRequest): Promise<DocumentWorkflowExecutorResult> {
  if (request.currentVersion > 0 || issuedStatuses.has(request.status)) return { requestId: request.id, status: request.status, action: "NOOP", documentNumber: request.documentNumber };
  if (!request.templateVersionIdSnapshot && !request.definition?.assignedTemplateVersion) throw new DocumentRuntimeError("DOCUMENT_TEMPLATE_VERSION_NOT_AVAILABLE", "No approved and published template version is available for this document definition.");
  await ensureStatus(context, request, DocumentRequestStatus.GENERATING, "Official document generation started.");
  try {
    const result = await generateDocument(context, request.id, { mode: DocumentGenerationMode.ISSUE, idempotencyKey: `workflow:issue:${request.id}` });
    if (result.documentVersionId && result.requestStatus === DocumentRequestStatus.ISSUED) {
      return { requestId: request.id, status: result.requestStatus, action: "GENERATED", paymentRequestId: request.paymentRequest?.id ?? null, documentVersionId: result.documentVersionId, documentNumber: result.documentNumber, verificationUrl: result.verificationUrl };
    }
    const failureMessage = safeGenerationFailureMessage();
    const restored = await recordGenerationFailure(context, request, failureMessage, {
      state: result.state,
      attemptId: result.attemptId,
      issueCodes: result.issues.map((issue) => issue.code),
      issueDomains: result.issues.map((issue) => issue.domain),
      issueMessages: result.issues.map((issue) => issue.message),
      templateVersionId: result.templateVersionId,
      templateVersion: result.templateVersion,
      correlationId: result.correlationId,
    });
    return { requestId: request.id, status: restored.status, action: "GENERATION_FAILED", paymentRequestId: request.paymentRequest?.id ?? null, failureMessage };
  } catch (error) {
    const runtime = error instanceof DocumentRuntimeError ? error : new DocumentRuntimeError("INTERNAL_GENERATION_FAILURE", error instanceof Error ? error.message : "Document generation failed.");
    console.error("Official document generation failed", { requestId: request.id, tenantId: context.tenantId, code: runtime.code, message: runtime.message, stack: error instanceof Error ? error.stack : undefined });
    const failureMessage = safeGenerationFailureMessage();
    const restored = await recordGenerationFailure(context, request, failureMessage, { code: runtime.code, detail: runtime.message, stack: error instanceof Error ? error.stack : undefined });
    return { requestId: request.id, status: restored.status, action: "GENERATION_FAILED", paymentRequestId: request.paymentRequest?.id ?? null, failureMessage };
  }
}

async function ensureDocumentFeePaymentRequest(context: DocumentExecutionContext, request: WorkflowRequest) {
  const feeAmount = Number(request.feeAmountSnapshot);
  if (!Number.isFinite(feeAmount) || feeAmount <= 0) throw new DocumentRuntimeError("VALIDATION_FAILED", "Paid document workflows require a fee greater than zero.");
  if (!payableStatuses.has(request.status)) throw new DocumentRuntimeError("INVALID_STATE", "This request is not waiting for document fee payment.");
  return platformPrisma.$transaction(async (tx) => {
    const existing = await tx.paymentRequest.findFirst({ where: { tenantId: context.tenantId, documentRequestId: request.id } });
    if (existing) return existing;
    const created = await tx.paymentRequest.create({
      data: {
        tenantId: context.tenantId,
        type: PaymentRequestType.DOCUMENT_FEE,
        homeownerId: request.homeownerId,
        documentRequestId: request.id,
        collectionType: CollectionType.OTHER,
        description: `Document Fee - ${request.definition?.displayName ?? "Official HOA document"}`,
        amount: request.feeAmountSnapshot,
        paymentDate: todayUtc(),
        method: PaymentMethod.GCASH,
        payerNotes: `Document Fee for request ${request.id}.`,
      },
    });
    await tx.auditLog.create({ data: { tenantId: context.tenantId, actorId: context.authenticatedUserId, module: "DOCUMENTS", action: "CREATE_DOCUMENT_FEE_PAYMENT_REQUEST", entityType: "PaymentRequest", entityId: created.id, metadata: { documentRequestId: request.id, amount: String(request.feeAmountSnapshot), workflow: workflowLabel(request), financeClassification: "DOCUMENT_FEE" } } });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function persistAdminOfficeApprovalBypass(context: DocumentExecutionContext, request: WorkflowRequest): Promise<WorkflowRequest> {
  if (!request.approvalRequiredSnapshot) return request;
  await platformPrisma.$transaction(async (tx) => {
    await tx.documentRequest.update({ where: { id: request.id }, data: { approvalRequiredSnapshot: false } });
    await tx.documentRequestHistory.create({ data: { tenantId: context.tenantId, requestId: request.id, status: request.status, actorId: context.authenticatedUserId, note: "Tenant Admin direct issuance bypassed the homeowner approval requirement. Payment and other configured controls remain separately tracked." } });
  });
  return { ...request, approvalRequiredSnapshot: false };
}

async function ensureStatus(context: DocumentExecutionContext, request: WorkflowRequest, status: DocumentRequestStatus, note: string, metadata: Record<string, unknown> = {}) {
  if (request.status === status) return { id: request.id, status };
  const updated = await platformPrisma.$transaction(async (tx) => {
    const result = await tx.documentRequest.update({ where: { id: request.id }, data: { status } });
    await tx.documentRequestHistory.create({ data: { tenantId: context.tenantId, requestId: request.id, status, actorId: context.authenticatedUserId, note } });
    await tx.auditLog.create({ data: { tenantId: context.tenantId, actorId: context.authenticatedUserId, module: "DOCUMENTS", action: "ADVANCE_DOCUMENT_WORKFLOW", entityType: "DocumentRequest", entityId: request.id, metadata: { from: request.status, to: status, ...metadata } } });
    return result;
  });
  return updated;
}

async function recordGenerationFailure(context: DocumentExecutionContext, request: WorkflowRequest, failureMessage: string, metadata: Record<string, unknown>) {
  const restored = await restoreRecoverableStatus(context, request, failureMessage);
  await platformPrisma.auditLog.create({
    data: {
      tenantId: context.tenantId,
      actorId: context.authenticatedUserId,
      module: "DOCUMENTS",
      action: "DOCUMENT_GENERATION_FAILED",
      entityType: "DocumentRequest",
      entityId: request.id,
      reason: failureMessage,
      metadata: { from: DocumentRequestStatus.GENERATING, restoredTo: restored.status, userMessage: failureMessage, failedAt: new Date().toISOString(), ...metadata },
    },
  });
  return restored;
}

async function restoreRecoverableStatus(context: DocumentExecutionContext, request: WorkflowRequest, note: string) {
  const status = recoverableStatus(request);
  const current = await platformPrisma.documentRequest.findFirst({ where: { tenantId: context.tenantId, id: request.id }, select: { status: true } });
  if (current?.status === status) return { id: request.id, status };
  return platformPrisma.$transaction(async (tx) => {
    const updated = await tx.documentRequest.update({ where: { id: request.id }, data: { status } });
    await tx.documentRequestHistory.create({ data: { tenantId: context.tenantId, requestId: request.id, status, actorId: context.authenticatedUserId, note } });
    return updated;
  });
}

async function reconcileIssuedRequestIfNeeded(context: DocumentExecutionContext, request: WorkflowRequest) {
  const version = request.versions[0];
  if (!version || request.status === DocumentRequestStatus.ISSUED) return;
  await platformPrisma.$transaction(async (tx) => {
    await tx.documentRequest.update({
      where: { id: request.id },
      data: {
        status: DocumentRequestStatus.ISSUED,
        documentNumber: request.documentNumber ?? version.documentNumber,
        generatedAt: request.generatedAt ?? version.createdAt,
        issuedAt: request.issuedAt ?? version.issuedAt ?? version.createdAt,
        currentVersion: request.currentVersion || version.version,
      },
    });
    await tx.documentRequestHistory.create({ data: { tenantId: context.tenantId, requestId: request.id, status: DocumentRequestStatus.ISSUED, actorId: context.authenticatedUserId, note: `Recovered request status from existing issued document ${version.documentNumber}.` } });
    await tx.auditLog.create({ data: { tenantId: context.tenantId, actorId: context.authenticatedUserId, module: "DOCUMENTS", action: "DOCUMENT_GENERATION_RECOVERED", entityType: "DocumentRequest", entityId: request.id, metadata: { documentVersionId: version.id, documentNumber: version.documentNumber } } });
  });
}

async function assertNoActiveGenerationAttempt(context: DocumentExecutionContext, requestId: string) {
  const active = await platformPrisma.documentGenerationAttempt.findFirst({
    where: { tenantId: context.tenantId, requestId, state: { in: [DocumentGenerationState.VALIDATING, DocumentGenerationState.READY, DocumentGenerationState.RENDERING, DocumentGenerationState.GENERATED] } },
    orderBy: { updatedAt: "desc" },
  });
  if (active && Date.now() - active.updatedAt.getTime() < 120_000) {
    throw new DocumentRuntimeError("CONCURRENCY_CONFLICT", "Official document generation is already running. Try again after the current attempt finishes.");
  }
}

async function loadWorkflowRequest(context: DocumentExecutionContext, requestId: string) {
  const request = await platformPrisma.documentRequest.findFirst({ where: { id: requestId, tenantId: context.tenantId }, include: workflowRequestInclude });
  if (!request) throw new DocumentRuntimeError("NOT_FOUND", "Document request was not found for the authenticated tenant.");
  return request;
}

async function assertWorkflowRequest(context: DocumentExecutionContext, request: WorkflowRequest) {
  if (request.tenantId !== context.tenantId || request.homeowner.tenantId !== context.tenantId) throw new DocumentRuntimeError("CROSS_TENANT", "Document request ownership does not match the authenticated tenant.");
  if (context.role === Role.HOMEOWNER && request.homeowner.userId !== context.authenticatedUserId) throw new DocumentRuntimeError("PERMISSION_DENIED", "Homeowners can manage only their own document requests.");
  if (context.role !== Role.HOMEOWNER) requireDocumentPermission(context, "VIEW_ISSUED_DOCUMENT");
  if (!request.definition) throw new DocumentRuntimeError("REQUEST_INCOMPLETE", "Document request is missing its tenant document definition.");
  if (request.definition.tenantId !== context.tenantId) throw new DocumentRuntimeError("CROSS_TENANT", "Document definition belongs to another tenant.");
  if (!request.definition.active || request.definition.status !== DocumentDefinitionStatus.ACTIVE || request.definition.archivedAt) throw new DocumentRuntimeError("REQUEST_INCOMPLETE", "Document definition is inactive or archived.");
  assertEligibleSubject(context, request);
}

function assertEligibleSubject(context: DocumentExecutionContext, request: WorkflowRequest) {
  if (request.subjectType !== DocumentSubjectType.HOUSEHOLD_MEMBER) return;
  const member = request.subjectMember;
  const eligibility = householdMemberEligibility(member, { tenantId: context.tenantId, homeownerId: request.homeownerId });
  if (!eligibility.eligible) throw new DocumentRuntimeError(eligibility.label === "Wrong tenant" || eligibility.label === "Wrong household" ? "PERMISSION_DENIED" : "VALIDATION_FAILED", eligibility.reason);
}

function assertConfiguredApprover(context: DocumentExecutionContext, request: WorkflowRequest) {
  const workflow = request.definition?.workflowDefinition;
  if (!workflow) return;
  const step = workflow.steps.find((item) => item.required) ?? workflow.steps[0];
  if (!step) return;
  if (step.approverUserId && step.approverUserId !== context.authenticatedUserId) {
    throw new DocumentRuntimeError("PERMISSION_DENIED", "You are not the named approver for this document workflow.");
  }
  if (step.approverRole && step.approverRole !== context.role && !context.platform) {
    throw new DocumentRuntimeError("PERMISSION_DENIED", "Your role is not authorized to approve this document workflow.");
  }
}

async function notifyTenantApprovers(context: DocumentExecutionContext, request: WorkflowRequest) {
  const approvers = await platformPrisma.user.findMany({ where: { tenantId: context.tenantId, active: true, role: { in: [Role.ADMIN, Role.HOA_ADMIN, Role.SYSTEM_ADMIN] } }, select: { id: true } });
  await Promise.all(approvers.map((recipient) => recordDocumentNotification({ context, recipientId: recipient.id, event: "APPROVAL_REQUIRED", subject: "Document approval required", message: `${request.definition?.displayName ?? "Document"} requires tenant approval.`, entityType: "DocumentRequest", entityId: request.id, eventKey: `APPROVAL_REQUIRED:DocumentRequest:${request.id}:${recipient.id}` }).catch(() => undefined)));
}

export function paymentConfirmedByStatus(status: DocumentRequestStatus | string) {
  return status === DocumentRequestStatus.PAYMENT_CONFIRMED || status === DocumentRequestStatus.APPROVED || status === DocumentRequestStatus.GENERATING || issuedStatuses.has(status as DocumentRequestStatus);
}

function isRequestOnly(request: WorkflowRequest) {
  return request.deliveryModeSnapshot === DocumentDeliveryMode.REQUEST_ONLY || request.definition?.deliveryMode === DocumentDeliveryMode.REQUEST_ONLY;
}

function isAdminOfficeRequest(context: DocumentExecutionContext, request: WorkflowRequest) {
  return request.origin === "ADMIN" && context.role !== Role.HOMEOWNER;
}

function workflowLabel(request: WorkflowRequest) {
  if (request.paymentRequiredSnapshot && request.approvalRequiredSnapshot) return "PAYMENT_AND_APPROVAL_REQUIRED";
  if (request.paymentRequiredSnapshot) return "PAYMENT_REQUIRED";
  if (request.approvalRequiredSnapshot) return "APPROVAL_REQUIRED";
  if (isRequestOnly(request)) return "REQUEST_ONLY";
  return "INSTANT_DOWNLOAD";
}

function recoverableStatus(request: WorkflowRequest) {
  if (request.status !== DocumentRequestStatus.GENERATING) return request.status;
  const previous = request.histories.find((history) => history.status !== DocumentRequestStatus.GENERATING && !issuedStatuses.has(history.status));
  if (previous && previous.status !== DocumentRequestStatus.CANCELLED && previous.status !== DocumentRequestStatus.REJECTED && previous.status !== DocumentRequestStatus.REVOKED) return previous.status;
  if (request.paymentRequiredSnapshot && !paymentConfirmedByStatus(request.status)) return DocumentRequestStatus.PENDING_PAYMENT;
  if (request.approvalRequiredSnapshot && !request.approvedAt) return DocumentRequestStatus.PENDING_APPROVAL;
  if (request.approvedAt) return DocumentRequestStatus.APPROVED;
  return DocumentRequestStatus.SUBMITTED;
}

function safeGenerationFailureMessage() {
  return "We could not finish generating this document. Your request was saved and HOA staff can retry processing it.";
}

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
