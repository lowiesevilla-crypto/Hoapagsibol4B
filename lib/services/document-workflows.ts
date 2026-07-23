import "server-only";

import { DocumentApprovalDecision, DocumentRequestStatus, DocumentWorkflowApprovalMode, DocumentWorkflowStepType, Prisma, Role } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { writeDocumentAudit } from "@/lib/services/document-runtime-audit";
import { requireDocumentPermission, type DocumentExecutionContext } from "@/lib/services/document-runtime-context";

export type WorkflowState = {
  workflowId: string;
  workflowVersion: number;
  completed: boolean;
  currentStepIds: string[];
  timeline: Array<{ stepId: string | null; decision: DocumentApprovalDecision | null; status: DocumentRequestStatus; note: string | null; createdAt: Date }>;
};

export async function listDocumentWorkflows(context: DocumentExecutionContext, activeOnly = false) {
  requireDocumentPermission(context, "MANAGE_WORKFLOWS");
  return platformPrisma.documentWorkflowDefinition.findMany({ where: { tenantId: context.tenantId, ...(activeOnly ? { active: true } : {}) }, include: { steps: { orderBy: { stepOrder: "asc" } } }, orderBy: [{ active: "desc" }, { code: "asc" }, { version: "desc" }] });
}

export async function getDocumentWorkflow(context: DocumentExecutionContext, workflowId: string) {
  requireDocumentPermission(context, "MANAGE_WORKFLOWS");
  const workflow = await platformPrisma.documentWorkflowDefinition.findFirst({ where: { id: workflowId, tenantId: context.tenantId }, include: { steps: { orderBy: { stepOrder: "asc" } }, definitions: { select: { id: true, code: true, displayName: true } } } });
  if (!workflow) throw new Error("Document workflow was not found for the authenticated tenant.");
  return workflow;
}

export async function createDocumentWorkflow(context: DocumentExecutionContext, data: { code: string; name: string; description?: string; approvalMode?: DocumentWorkflowApprovalMode; steps: Array<{ stepType: DocumentWorkflowStepType; approvalMode?: DocumentWorkflowApprovalMode; approverRole?: Role; approverUserId?: string; required?: boolean; slaTargetHours?: number; overrideEligible?: boolean; mandatoryOverrideRemarks?: boolean; conditionalMetadata?: unknown }> }) {
  requireDocumentPermission(context, "MANAGE_WORKFLOWS");
  validateWorkflowSteps(data.steps);
  const created = await platformPrisma.$transaction(async (tx) => {
    const workflow = await tx.documentWorkflowDefinition.create({ data: { tenantId: context.tenantId, code: data.code.trim().toUpperCase(), name: data.name.trim(), description: data.description?.trim() || null, approvalMode: data.approvalMode || DocumentWorkflowApprovalMode.SEQUENTIAL, createdById: context.authenticatedUserId, updatedById: context.authenticatedUserId } });
    for (const [index, step] of data.steps.entries()) {
      if (step.approverUserId) await assertUserTenant(context.tenantId, step.approverUserId, tx);
      await tx.documentWorkflowStep.create({ data: { tenantId: context.tenantId, workflowId: workflow.id, stepOrder: index + 1, stepType: step.stepType, approvalMode: step.approvalMode || workflow.approvalMode, approverRole: step.approverRole, approverUserId: step.approverUserId, required: step.required ?? true, slaTargetHours: step.slaTargetHours, overrideEligible: step.overrideEligible ?? false, mandatoryOverrideRemarks: step.mandatoryOverrideRemarks ?? false, conditionalMetadata: toJson(step.conditionalMetadata), createdById: context.authenticatedUserId, updatedById: context.authenticatedUserId } });
    }
    await writeDocumentAudit({ context, action: "CREATE_WORKFLOW", entityType: "DocumentWorkflowDefinition", entityId: workflow.id, after: { code: workflow.code, version: workflow.version, stepCount: data.steps.length }, client: tx });
    return workflow;
  });
  return created;
}

export async function assignWorkflowToDefinition(context: DocumentExecutionContext, definitionId: string, workflowId: string) {
  requireDocumentPermission(context, "MANAGE_WORKFLOWS");
  const [definition, workflow] = await Promise.all([
    platformPrisma.documentDefinition.findFirst({ where: { id: definitionId, tenantId: context.tenantId }, select: { id: true, workflowDefinitionId: true } }),
    platformPrisma.documentWorkflowDefinition.findFirst({ where: { id: workflowId, tenantId: context.tenantId, active: true }, select: { id: true, version: true } }),
  ]);
  if (!definition || !workflow) throw new Error("Workflow or document definition does not belong to the authenticated tenant.");
  const updated = await platformPrisma.documentDefinition.update({ where: { id: definition.id }, data: { workflowDefinitionId: workflow.id, version: { increment: 1 } } });
  await writeDocumentAudit({ context, action: "ASSIGN_WORKFLOW", entityType: "DocumentDefinition", entityId: updated.id, before: { workflowDefinitionId: definition.workflowDefinitionId }, after: { workflowDefinitionId: workflow.id, workflowVersion: workflow.version } });
  return updated;
}

export async function startDocumentWorkflow(context: DocumentExecutionContext, requestId: string): Promise<WorkflowState | null> {
  const request = await platformPrisma.documentRequest.findFirst({ where: { id: requestId, tenantId: context.tenantId }, include: { definition: { include: { workflowDefinition: { include: { steps: { orderBy: { stepOrder: "asc" } } } } } }, histories: { orderBy: { createdAt: "asc" } } } });
  if (context.role === Role.HOMEOWNER) {
    const owned = request && await platformPrisma.homeownerProfile.findFirst({ where: { id: request.homeownerId, tenantId: context.tenantId, userId: context.authenticatedUserId }, select: { id: true } });
    if (!owned) throw new Error("Homeowners may start only their own tenant-scoped document workflow.");
  } else {
    requireDocumentPermission(context, "APPROVE_REQUESTS");
  }
  const workflow = request?.definition?.workflowDefinition;
  if (!request || !workflow) return null;
  const prior = request.histories.find((item) => item.workflowVersion === workflow.version && item.workflowStepId);
  if (prior) return getWorkflowState(context, request.id);
  const firstStep = workflow.steps[0];
  if (!firstStep) throw new Error("Workflow has no configured steps.");
  await platformPrisma.$transaction(async (tx) => {
    await tx.documentRequestHistory.create({ data: { tenantId: context.tenantId, requestId: request.id, status: request.status, actorId: context.authenticatedUserId, workflowVersion: workflow.version, workflowStepId: firstStep.id, decision: DocumentApprovalDecision.PENDING, note: "Workflow started." } });
    await writeDocumentAudit({ context, action: "START_WORKFLOW", entityType: "DocumentRequest", entityId: request.id, after: { workflowId: workflow.id, workflowVersion: workflow.version, firstStepId: firstStep.id }, client: tx });
  });
  return getWorkflowState(context, request.id);
}

export async function getWorkflowState(context: DocumentExecutionContext, requestId: string): Promise<WorkflowState | null> {
  const request = await platformPrisma.documentRequest.findFirst({ where: { id: requestId, tenantId: context.tenantId }, include: { definition: { include: { workflowDefinition: { include: { steps: { orderBy: { stepOrder: "asc" } } } } } }, histories: { orderBy: { createdAt: "asc" } } } });
  const workflow = request?.definition?.workflowDefinition;
  if (!request || !workflow) return null;
  const records = request.histories.filter((item) => item.workflowVersion === workflow.version && item.workflowStepId);
  const latestByStep = new Map<string, (typeof records)[number]>();
  for (const record of records) if (record.workflowStepId) latestByStep.set(record.workflowStepId, record);
  const approved = new Set([...latestByStep.values()].filter((item) => item.decision === DocumentApprovalDecision.APPROVED || item.decision === DocumentApprovalDecision.SKIPPED || item.decision === DocumentApprovalDecision.OVERRIDDEN).map((item) => item.workflowStepId));
  const rejected = [...latestByStep.values()].some((item) => item.decision === DocumentApprovalDecision.REJECTED);
  const currentStepIds = rejected ? [] : workflow.steps.filter((step) => !approved.has(step.id) && (workflow.approvalMode === DocumentWorkflowApprovalMode.PARALLEL || workflow.steps.slice(0, step.stepOrder - 1).every((prior) => !prior.required || approved.has(prior.id)))).map((step) => step.id);
  return { workflowId: workflow.id, workflowVersion: workflow.version, completed: !rejected && currentStepIds.length === 0, currentStepIds, timeline: records.map((item) => ({ stepId: item.workflowStepId, decision: item.decision, status: item.status, note: item.note, createdAt: item.createdAt })) };
}

export async function completeDocumentWorkflowStep(context: DocumentExecutionContext, input: { requestId: string; stepId: string; decision: DocumentApprovalDecision; remarks?: string; override?: boolean }) {
  requireDocumentPermission(context, "APPROVE_REQUESTS");
  if ((input.decision === DocumentApprovalDecision.REJECTED || input.decision === DocumentApprovalDecision.OVERRIDDEN) && !input.remarks?.trim()) throw new Error("Remarks are required for rejection or override decisions.");
  const request = await platformPrisma.documentRequest.findFirst({ where: { id: input.requestId, tenantId: context.tenantId }, include: { definition: { include: { workflowDefinition: { include: { steps: true } } } } } });
  const workflow = request?.definition?.workflowDefinition;
  const step = workflow?.steps.find((item) => item.id === input.stepId);
  if (!request || !workflow || !step) throw new Error("Workflow step was not found for the authenticated tenant.");
  if (step.approverUserId && step.approverUserId !== context.authenticatedUserId) throw new Error("You are not the named approver for this workflow step.");
  if (step.approverRole && step.approverRole !== context.role && !context.platform) throw new Error("You are not authorized for this workflow step.");
  if (input.override) requireDocumentPermission(context, "OVERRIDE_POLICY");
  const state = await getWorkflowState(context, request.id);
  if (!state?.currentStepIds.includes(step.id)) throw new Error("This workflow step is not currently actionable.");
  await platformPrisma.$transaction(async (tx) => {
    await tx.documentRequestHistory.create({ data: { tenantId: context.tenantId, requestId: request.id, status: input.decision === DocumentApprovalDecision.REJECTED ? DocumentRequestStatus.REJECTED : DocumentRequestStatus.UNDER_REVIEW, actorId: context.authenticatedUserId, workflowVersion: workflow.version, workflowStepId: step.id, decision: input.decision, actingRole: context.role, decisionAt: new Date(), override: input.override ?? false, overrideReason: input.override ? input.remarks : null, note: input.remarks?.trim() || null } });
    if (input.decision === DocumentApprovalDecision.REJECTED) {
      await tx.documentRequest.update({ where: { id: request.id }, data: { status: DocumentRequestStatus.REJECTED, reviewedAt: new Date(), adminRemarks: input.remarks?.trim() } });
    } else {
      const prior = await tx.documentRequestHistory.findMany({ where: { tenantId: context.tenantId, requestId: request.id, workflowVersion: workflow.version }, select: { workflowStepId: true, decision: true } });
      const accepted = new Set(prior.filter((item) => item.decision === DocumentApprovalDecision.APPROVED || item.decision === DocumentApprovalDecision.OVERRIDDEN || item.decision === DocumentApprovalDecision.SKIPPED).map((item) => item.workflowStepId));
      const workflowComplete = workflow.steps.filter((item) => item.required).every((item) => accepted.has(item.id) || (item.id === step.id && (input.decision === DocumentApprovalDecision.APPROVED || input.decision === DocumentApprovalDecision.OVERRIDDEN)));
      await tx.documentRequest.update({ where: { id: request.id }, data: { status: workflowComplete ? DocumentRequestStatus.APPROVED : DocumentRequestStatus.UNDER_REVIEW, reviewedAt: new Date(), ...(workflowComplete ? { approvedAt: new Date(), approvedById: context.authenticatedUserId } : {}) } });
    }
    await writeDocumentAudit({ context, action: input.override ? "OVERRIDE_WORKFLOW_STEP" : "DECIDE_WORKFLOW_STEP", entityType: "DocumentRequest", entityId: request.id, after: { workflowId: workflow.id, workflowVersion: workflow.version, stepId: step.id, decision: input.decision }, reason: input.remarks, client: tx });
  });
  return getWorkflowState(context, request.id);
}

function validateWorkflowSteps(steps: Array<{ stepType: DocumentWorkflowStepType; approverRole?: Role; approverUserId?: string; required?: boolean }>) {
  if (!steps.length || steps.length > 25) throw new Error("A workflow must contain between one and twenty-five steps.");
  if (!steps.some((step) => step.stepType === DocumentWorkflowStepType.APPROVAL || step.stepType === DocumentWorkflowStepType.REVIEW)) throw new Error("A workflow needs an approval or review step.");
}

async function assertUserTenant(tenantId: string, userId: string, tx: Prisma.TransactionClient) {
  const user = await tx.user.findFirst({ where: { id: userId, tenantId, active: true }, select: { id: true } });
  if (!user) throw new Error("Named approver does not belong to the authenticated tenant.");
}

function toJson(value: unknown) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
