import "server-only";

import { DocumentApprovalDecision, Role } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { completeDocumentWorkflowStep, getDocumentWorkflow, getWorkflowState, startDocumentWorkflow } from "@/lib/services/document-workflows";
import { notifyDocumentOwner, notifyDocumentRoles } from "@/lib/services/document-notifications";
import { requireDocumentPermission, type DocumentExecutionContext } from "@/lib/services/document-runtime-context";

export async function getAuthorizedDocumentApprovers(context: DocumentExecutionContext, requestId: string, stepId?: string) {
  requireDocumentPermission(context, "APPROVE_REQUESTS");
  const request = await platformPrisma.documentRequest.findFirst({ where: { tenantId: context.tenantId, id: requestId }, include: { definition: { include: { workflowDefinition: { include: { steps: true } } } } } });
  if (!request?.definition?.workflowDefinition) return [];
  const steps = request.definition.workflowDefinition.steps.filter((step) => !stepId || step.id === stepId);
  const roles = [...new Set(steps.map((step) => step.approverRole).filter((role): role is Role => Boolean(role)))];
  const userIds = steps.map((step) => step.approverUserId).filter((id): id is string => Boolean(id));
  return platformPrisma.user.findMany({ where: { tenantId: context.tenantId, active: true, OR: [{ role: { in: roles } }, ...(userIds.length ? [{ id: { in: userIds } }] : [])] }, select: { id: true, name: true, role: true, email: true } });
}

export async function beginDocumentApproval(context: DocumentExecutionContext, requestId: string) {
  const state = await startDocumentWorkflow(context, requestId);
  if (state) await notifyDocumentRoles({ context, roles: [Role.ADMIN, Role.HOA_ADMIN, Role.SYSTEM_ADMIN, Role.SUPER_ADMIN], event: "APPROVAL_REQUIRED", subject: "Document approval required", message: "A document request is ready for review.", entityType: "DocumentRequest", entityId: requestId });
  return state;
}

export async function approveDocumentRequestStep(context: DocumentExecutionContext, input: { requestId: string; stepId: string; remarks?: string }) {
  const state = await completeDocumentWorkflowStep(context, { ...input, decision: DocumentApprovalDecision.APPROVED });
  await notifyRequestOwner(context, input.requestId, state?.completed ? "APPROVED" : "APPROVAL_REQUIRED", state?.completed ? "Document approved" : "Document approval step completed", state?.completed ? "Your document request was approved." : "A document approval step was completed.");
  return state;
}

export async function rejectDocumentRequest(context: DocumentExecutionContext, input: { requestId: string; stepId: string; remarks: string }) {
  const state = await completeDocumentWorkflowStep(context, { ...input, decision: DocumentApprovalDecision.REJECTED });
  await notifyRequestOwner(context, input.requestId, "REJECTED", "Document request rejected", input.remarks);
  return state;
}

export async function overrideDocumentRequestStep(context: DocumentExecutionContext, input: { requestId: string; stepId: string; reason: string }) {
  const state = await completeDocumentWorkflowStep(context, { requestId: input.requestId, stepId: input.stepId, decision: DocumentApprovalDecision.OVERRIDDEN, remarks: input.reason, override: true });
  await notifyRequestOwner(context, input.requestId, "APPROVED", "Document request released by override", "An authorized administrator completed an override decision.");
  return state;
}

export async function getDocumentApprovalTimeline(context: DocumentExecutionContext, requestId: string) {
  requireDocumentPermission(context, "APPROVE_REQUESTS");
  return getWorkflowState(context, requestId);
}

export async function resolveApprovalWorkflow(context: DocumentExecutionContext, workflowId: string) {
  return getDocumentWorkflow(context, workflowId);
}

async function notifyRequestOwner(context: DocumentExecutionContext, requestId: string, event: "APPROVED" | "APPROVAL_REQUIRED" | "REJECTED", subject: string, message: string) {
  const request = await platformPrisma.documentRequest.findFirst({ where: { tenantId: context.tenantId, id: requestId }, include: { homeowner: { select: { userId: true } } } });
  if (request?.homeowner.userId) await notifyDocumentOwner(context, request.homeowner.userId, event, subject, message, requestId);
}
