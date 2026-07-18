import "server-only";

import { DocumentPolicySeverity, DocumentPolicyType, Prisma } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { getQualifyingHomeownerBalance } from "@/lib/services/document-balance-policy";
import { writeDocumentAudit } from "@/lib/services/document-runtime-audit";
import { requireDocumentPermission, type DocumentExecutionContext } from "@/lib/services/document-runtime-context";

export type PolicyEvaluationStatus = "PASS" | "WARNING" | "FAIL" | "SKIPPED" | "ERROR";
export type PolicyEvaluationResult = {
  policyId: string;
  policyCode: string;
  policyType: DocumentPolicyType;
  policyVersion: number;
  status: PolicyEvaluationStatus;
  blocking: boolean;
  severity: DocumentPolicySeverity;
  summary: string;
  reasons: string[];
  relevantMetadata: Record<string, string | number | boolean>;
  evaluatedAt: Date;
  evaluatorVersion: string;
};

export async function listDocumentPolicies(context: DocumentExecutionContext, enabledOnly = false) {
  requireDocumentPermission(context, "MANAGE_POLICIES");
  return platformPrisma.documentPolicy.findMany({ where: { tenantId: context.tenantId, ...(enabledOnly ? { enabled: true } : {}) }, orderBy: [{ enabled: "desc" }, { code: "asc" }] });
}

export async function createDocumentPolicy(context: DocumentExecutionContext, data: { code: string; name: string; type: DocumentPolicyType; description?: string; severity?: DocumentPolicySeverity; blocking?: boolean; parameters?: unknown }) {
  requireDocumentPermission(context, "MANAGE_POLICIES");
  validatePolicyParameters(data.type, data.parameters);
  const created = await platformPrisma.documentPolicy.create({ data: { tenantId: context.tenantId, code: data.code.trim().toUpperCase(), name: data.name.trim(), description: data.description?.trim() || null, type: data.type, severity: data.severity || DocumentPolicySeverity.WARNING, blocking: data.blocking ?? data.severity === DocumentPolicySeverity.BLOCKING, parameters: toJson(data.parameters), createdById: context.authenticatedUserId, updatedById: context.authenticatedUserId } });
  await writeDocumentAudit({ context, action: "CREATE_POLICY", entityType: "DocumentPolicy", entityId: created.id, after: { code: created.code, type: created.type, severity: created.severity, blocking: created.blocking } });
  return created;
}

export async function updateDocumentPolicy(context: DocumentExecutionContext, policyId: string, data: { name?: string; description?: string | null; enabled?: boolean; severity?: DocumentPolicySeverity; blocking?: boolean; parameters?: unknown }) {
  requireDocumentPermission(context, "MANAGE_POLICIES");
  const existing = await platformPrisma.documentPolicy.findFirst({ where: { id: policyId, tenantId: context.tenantId } });
  if (!existing) throw new Error("Document policy was not found for the authenticated tenant.");
  validatePolicyParameters(existing.type, data.parameters === undefined ? existing.parameters : data.parameters);
  const updated = await platformPrisma.documentPolicy.update({ where: { id: existing.id }, data: { ...data, parameters: data.parameters === undefined ? undefined : toJson(data.parameters), version: { increment: 1 }, updatedById: context.authenticatedUserId } });
  await writeDocumentAudit({ context, action: "UPDATE_POLICY", entityType: "DocumentPolicy", entityId: updated.id, before: { version: existing.version, enabled: existing.enabled }, after: { version: updated.version, enabled: updated.enabled } });
  return updated;
}

export async function assignDocumentPolicy(context: DocumentExecutionContext, definitionId: string, policyId: string, options: { evaluationOrder?: number; required?: boolean } = {}) {
  requireDocumentPermission(context, "MANAGE_POLICIES");
  const [definition, policy] = await Promise.all([
    platformPrisma.documentDefinition.findFirst({ where: { id: definitionId, tenantId: context.tenantId }, select: { id: true } }),
    platformPrisma.documentPolicy.findFirst({ where: { id: policyId, tenantId: context.tenantId }, select: { id: true } }),
  ]);
  if (!definition || !policy) throw new Error("Policy or document definition does not belong to the authenticated tenant.");
  const assignment = await platformPrisma.$transaction(async (tx) => {
    const result = await tx.documentDefinitionPolicyAssignment.upsert({ where: { tenantId_definitionId_policyId: { tenantId: context.tenantId, definitionId, policyId } }, create: { tenantId: context.tenantId, definitionId, policyId, evaluationOrder: options.evaluationOrder ?? 0, required: options.required ?? false }, update: { evaluationOrder: options.evaluationOrder, required: options.required, enabled: true, version: { increment: 1 } } });
    await writeDocumentAudit({ context, action: "ASSIGN_POLICY", entityType: "DocumentDefinitionPolicyAssignment", entityId: result.id, after: { definitionId, policyId, evaluationOrder: result.evaluationOrder } , client: tx });
    return result;
  });
  return assignment;
}

export async function unassignDocumentPolicy(context: DocumentExecutionContext, assignmentId: string) {
  requireDocumentPermission(context, "MANAGE_POLICIES");
  const assignment = await platformPrisma.documentDefinitionPolicyAssignment.findFirst({ where: { id: assignmentId, tenantId: context.tenantId } });
  if (!assignment) throw new Error("Policy assignment was not found for the authenticated tenant.");
  await platformPrisma.documentDefinitionPolicyAssignment.update({ where: { id: assignment.id }, data: { enabled: false, version: { increment: 1 } } });
  await writeDocumentAudit({ context, action: "UNASSIGN_POLICY", entityType: "DocumentDefinitionPolicyAssignment", entityId: assignment.id, before: { enabled: true }, after: { enabled: false } });
}

export async function evaluateDocumentPolicies(context: DocumentExecutionContext, definitionId: string, input: { homeownerId?: string; requestId?: string; membershipStatus?: string }) {
  requireDocumentPermission(context, "VIEW_DEFINITIONS");
  const definition = await platformPrisma.documentDefinition.findFirst({ where: { id: definitionId, tenantId: context.tenantId }, include: { policyAssignments: { where: { enabled: true }, orderBy: { evaluationOrder: "asc" }, include: { policy: true } } } });
  if (!definition) throw new Error("Document definition was not found for the authenticated tenant.");
  const evaluatedAt = new Date();
  const results = await Promise.all(definition.policyAssignments.map(async (assignment) => evaluatePolicy(context, assignment.policy, input, evaluatedAt)));
  await writeDocumentAudit({
    context,
    action: "EVALUATE_DOCUMENT_POLICIES",
    entityType: "DocumentRequest",
    entityId: input.requestId ?? definition.id,
    metadata: { definitionId: definition.id, results: results.map((result) => ({ policyCode: result.policyCode, status: result.status, blocking: result.blocking })) },
  });
  return results;
}

async function evaluatePolicy(context: DocumentExecutionContext, policy: { id: string; code: string; type: DocumentPolicyType; enabled: boolean; severity: DocumentPolicySeverity; blocking: boolean; parameters: Prisma.JsonValue | null; version: number }, input: { homeownerId?: string; membershipStatus?: string }, evaluatedAt: Date): Promise<PolicyEvaluationResult> {
  const base = { policyId: policy.id, policyCode: policy.code, policyType: policy.type, policyVersion: policy.version, blocking: policy.blocking, severity: policy.severity, evaluatedAt, evaluatorVersion: "1" } as const;
  if (!policy.enabled) return { ...base, status: "SKIPPED", summary: "Policy is disabled.", reasons: [], relevantMetadata: {} };
  try {
    if (policy.type === DocumentPolicyType.OUTSTANDING_BALANCE) {
      if (!input.homeownerId) return { ...base, status: "ERROR", summary: "Homeowner context is required.", reasons: ["No homeowner was supplied for balance evaluation."], relevantMetadata: {} };
      const balance = await getQualifyingHomeownerBalance(context.tenantId, input.homeownerId);
      const threshold = numericParameter(policy.parameters, "threshold", 0);
      const failed = balance > threshold + 0.009;
      return { ...base, status: failed ? (policy.blocking ? "FAIL" : "WARNING") : "PASS", summary: failed ? "Qualifying outstanding balance exists." : "No qualifying outstanding balance exists.", reasons: failed ? [`Balance exceeds configured threshold of ${threshold.toFixed(2)}.`] : [], relevantMetadata: { hasQualifyingBalance: failed } };
    }
    if (policy.type === DocumentPolicyType.MEMBERSHIP_STATUS) {
      const expected = stringParameter(policy.parameters, "requiredStatus", "ACTIVE");
      const actual = input.membershipStatus || (input.homeownerId ? (await platformPrisma.homeownerProfile.findFirst({ where: { id: input.homeownerId, tenantId: context.tenantId }, select: { status: true } }))?.status : null);
      const passed = actual === expected;
      return { ...base, status: passed ? "PASS" : policy.blocking ? "FAIL" : "WARNING", summary: passed ? "Membership status satisfies policy." : "Membership status does not satisfy policy.", reasons: passed ? [] : [`Expected membership status ${expected}.`], relevantMetadata: { expectedStatus: expected, actualStatus: actual || "UNKNOWN" } };
    }
    if (policy.type === DocumentPolicyType.ACTIVE_RESIDENT) {
      if (!input.homeownerId) return { ...base, status: "ERROR", summary: "Homeowner context is required.", reasons: ["No homeowner was supplied for residency evaluation."], relevantMetadata: {} };
      const homeowner = await platformPrisma.homeownerProfile.findFirst({ where: { id: input.homeownerId, tenantId: context.tenantId }, select: { status: true, user: { select: { active: true } } } });
      const passed = homeowner?.status === "ACTIVE" && homeowner.user.active;
      return { ...base, status: passed ? "PASS" : policy.blocking ? "FAIL" : "WARNING", summary: passed ? "Resident relationship is active." : "Resident relationship is not active.", reasons: passed ? [] : ["An active homeowner profile and active tenant user are required."], relevantMetadata: { activeResident: Boolean(passed) } };
    }
    if (policy.type === DocumentPolicyType.PROPERTY_OWNERSHIP) {
      if (!input.homeownerId) return { ...base, status: "ERROR", summary: "Homeowner context is required.", reasons: ["No homeowner was supplied for property evaluation."], relevantMetadata: {} };
      const homeowner = await platformPrisma.homeownerProfile.findFirst({ where: { id: input.homeownerId, tenantId: context.tenantId }, select: { address: true, block: true, lot: true } });
      const passed = Boolean(homeowner?.address.trim() && homeowner.block.trim() && homeowner.lot.trim());
      return { ...base, status: passed ? "PASS" : policy.blocking ? "FAIL" : "WARNING", summary: passed ? "Tenant property relationship is verified." : "Tenant property relationship is incomplete.", reasons: passed ? [] : ["A tenant-scoped address, block, and lot relationship is required."], relevantMetadata: { propertyRelationshipVerified: passed } };
    }
    return { ...base, status: "SKIPPED", summary: "No safe evaluator is registered for this policy type yet.", reasons: ["The policy remains configurable for a future domain adapter."], relevantMetadata: {} };
  } catch (error) {
    return { ...base, status: "ERROR", summary: "Policy evaluation failed.", reasons: [error instanceof Error ? error.message : "Unknown evaluation error."], relevantMetadata: {} };
  }
}

function validatePolicyParameters(type: DocumentPolicyType, value: unknown) {
  if (value === undefined || value === null) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Policy parameters must be a structured JSON object.");
  if (type === DocumentPolicyType.OUTSTANDING_BALANCE && "threshold" in value && typeof (value as Record<string, unknown>).threshold !== "number") throw new Error("Outstanding balance threshold must be numeric.");
  if ("operator" in value && !["eq", "neq", "gt", "gte", "lt", "lte", "in"].includes(String((value as Record<string, unknown>).operator))) throw new Error("Policy operator is not supported.");
}

function numericParameter(value: Prisma.JsonValue | null, key: string, fallback: number) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
  return typeof record[key] === "number" && Number.isFinite(record[key]) ? record[key] as number : fallback;
}

function stringParameter(value: Prisma.JsonValue | null, key: string, fallback: string) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
  return typeof record[key] === "string" ? record[key] as string : fallback;
}

function toJson(value: unknown) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
