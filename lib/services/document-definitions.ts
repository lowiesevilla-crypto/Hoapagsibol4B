import "server-only";

import {
  DocumentDefinitionStatus,
  DocumentOutstandingBalancePolicy,
  DocumentSequenceScope,
  DocumentTemplateVersionStatus,
  type DocumentDefinition,
  type DocumentType,
  type Prisma,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { validateTemplateDefinition } from "@/lib/services/document-template-builder";
import { defaultNumberingFormat, validateNumberingFormat } from "@/lib/services/document-numbering";
import { workflowFieldsForPreset, workflowPresetForDeliveryMode } from "@/lib/services/document-workflow-presets";
import { defaultDocumentOutstandingBalancePolicy } from "@/lib/services/document-balance-policy";

export const documentDefinitionInclude = {
  fields: {
    where: { active: true },
    orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
  },
  assignedTemplateVersion: true,
  templateSets: {
    where: { active: true },
    include: {
      versions: {
        where: { status: DocumentTemplateVersionStatus.PUBLISHED },
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  },
} satisfies Prisma.DocumentDefinitionInclude;

export type DocumentDefinitionWithCompatibility = Prisma.DocumentDefinitionGetPayload<{
  include: typeof documentDefinitionInclude;
}>;

export type ResolveDocumentDefinitionInput = {
  tenantId: string;
  definitionId?: string | null;
  legacyType?: DocumentType | null;
};

export async function getDefinitionById(tenantId: string, definitionId: string) {
  return platformPrisma.documentDefinition.findFirst({
    where: { tenantId, id: definitionId },
    include: documentDefinitionInclude,
  });
}

export async function getDefinitionForLegacyType(tenantId: string, legacyType: DocumentType) {
  return platformPrisma.documentDefinition.findFirst({
    where: { tenantId, legacyType },
    include: documentDefinitionInclude,
  });
}

export async function resolveDocumentDefinition(input: ResolveDocumentDefinitionInput) {
  const { tenantId, definitionId, legacyType } = input;
  if (definitionId) {
    const definition = await getDefinitionById(tenantId, definitionId);
    if (definition) return definition;
  }
  if (legacyType) return getDefinitionForLegacyType(tenantId, legacyType);
  return null;
}

export async function validateDefinitionTenantOwnership(tenantId: string, definitionId: string) {
  const definition = await platformPrisma.documentDefinition.findFirst({
    where: { tenantId, id: definitionId },
    select: { id: true, tenantId: true },
  });
  if (!definition) throw new Error("Document definition was not found for the authenticated tenant.");
  return definition;
}

export async function getPublishedTemplateVersion(tenantId: string, definitionId: string) {
  const definition = await platformPrisma.documentDefinition.findFirst({
    where: { tenantId, id: definitionId },
    select: { assignedTemplateVersionId: true },
  });
  if (!definition) return null;
  if (definition.assignedTemplateVersionId) {
    const assigned = await platformPrisma.documentTemplateVersion.findFirst({
      where: {
        tenantId,
        id: definition.assignedTemplateVersionId,
        status: DocumentTemplateVersionStatus.PUBLISHED,
      },
    });
    if (assigned) return assigned;
  }
  return platformPrisma.documentTemplateVersion.findFirst({
    where: {
      tenantId,
      status: DocumentTemplateVersionStatus.PUBLISHED,
      templateSet: { definitionId },
    },
    orderBy: { version: "desc" },
  });
}

export type DocumentDefinitionCompletenessStatus =
  | "COMPLETE"
  | "INCOMPLETE"
  | "DRAFT_ONLY"
  | "MISSING_TEMPLATE"
  | "INVALID_TEMPLATE"
  | "INACTIVE"
  | "ARCHIVED";

export type DocumentDefinitionCompleteness = {
  status: DocumentDefinitionCompletenessStatus;
  requestable: boolean;
  errors: string[];
  warnings: string[];
};

export async function validateDocumentDefinitionCompleteness(definitionId: string, tenantId: string): Promise<DocumentDefinitionCompleteness> {
  const definition = await platformPrisma.documentDefinition.findFirst({
    where: { id: definitionId, tenantId },
    include: { fields: { where: { active: true } }, assignedTemplateVersion: { include: { templateSet: true } }, signatoryOfficer: true },
  });
  if (!definition) return { status: "INCOMPLETE", requestable: false, errors: ["Definition was not found for this tenant."], warnings: [] };
  return evaluateDefinitionCompleteness(definition);
}

export function evaluateDefinitionCompleteness(definition: DocumentDefinition & {
  fields?: { key: string; required: boolean; active: boolean }[];
  assignedTemplateVersion?: { status: DocumentTemplateVersionStatus; definitionJson: Prisma.JsonValue; templateSet: { definitionId: string; tenantId: string; active: boolean } } | null;
  signatoryOfficer?: { active: boolean; archivedAt: Date | null } | null;
}): DocumentDefinitionCompleteness {
  const errors: string[] = [];
  const warnings: string[] = [];
  let status: DocumentDefinitionCompletenessStatus = "COMPLETE";
  if (definition.archivedAt || definition.status === DocumentDefinitionStatus.ARCHIVED) status = "ARCHIVED";
  else if (!definition.active || definition.status === DocumentDefinitionStatus.INACTIVE) status = "INACTIVE";
  else if (!definition.assignedTemplateVersion) status = "MISSING_TEMPLATE";
  else if (definition.assignedTemplateVersion.status === DocumentTemplateVersionStatus.DRAFT) status = "DRAFT_ONLY";

  if (status === "ARCHIVED") errors.push("Definition is archived.");
  if (status === "INACTIVE") errors.push("Definition is inactive.");
  if (!definition.code.trim()) errors.push("Code is required.");
  if (!definition.displayName.trim()) errors.push("Display name is required.");
  const expectedWorkflow = workflowFieldsForPreset(workflowPresetForDeliveryMode(definition.deliveryMode));
  if (expectedWorkflow) {
    if (expectedWorkflow.paymentRequired && Number(definition.feeAmount) <= 0) errors.push("Paid workflows require a fee greater than zero.");
    if (!expectedWorkflow.paymentRequired && Number(definition.feeAmount) !== 0) errors.push("Free workflows must have a zero fee.");
    if (definition.paymentRequired !== expectedWorkflow.paymentRequired) errors.push("Payment requirement does not match the selected workflow.");
    if (definition.approvalRequired !== expectedWorkflow.approvalRequired) errors.push("Approval requirement does not match the selected workflow.");
    if (definition.paymentBeforeApproval !== expectedWorkflow.paymentBeforeApproval) errors.push("Payment timing does not match the selected workflow.");
    if (definition.allowImmediateDownload !== expectedWorkflow.allowImmediateDownload) errors.push("Immediate download setting does not match the selected workflow.");
    if (definition.requiresAdminReview !== expectedWorkflow.requiresAdminReview) errors.push("Admin review setting does not match the selected workflow.");
  }
  if (definition.maxCopies < 1 || definition.maxCopies > 25) errors.push("Maximum copies must be between 1 and 25.");
  if (definition.validityDays != null && definition.validityDays < 1) errors.push("Validity days must be blank or greater than zero.");
  const balancePolicy = definition.outstandingBalancePolicy ?? defaultDocumentOutstandingBalancePolicy;
  if (!Object.values(DocumentOutstandingBalancePolicy).includes(balancePolicy)) errors.push("Outstanding balance policy is invalid.");
  const numbering = validateNumberingFormat(definition.numberingFormat);
  errors.push(...numbering.errors);
  if (definition.qrEnabled && !definition.numberingFormat.includes("{SEQUENCE")) errors.push("QR-enabled definitions need a valid numbering sequence.");
  if (definition.requiresAdminReview && !definition.signatoryOfficerId) warnings.push("No default signatory is assigned; approving officer will be used where supported.");
  if (definition.signatoryOfficer && (!definition.signatoryOfficer.active || definition.signatoryOfficer.archivedAt)) errors.push("Assigned signatory is inactive or archived.");

  const requiredFields = (definition.fields ?? []).filter((field) => field.active && field.required);
  if (requiredFields.length === 0) warnings.push("No required fields are configured.");

  if (!definition.assignedTemplateVersion) errors.push("A published template version must be assigned.");
  else if (definition.assignedTemplateVersion.templateSet.tenantId !== definition.tenantId || definition.assignedTemplateVersion.templateSet.definitionId !== definition.id) errors.push("Assigned template version does not belong to this definition.");
  else if (!definition.assignedTemplateVersion.templateSet.active) errors.push("Assigned template set is inactive.");
  else {
    const template = validateTemplateDefinition(definition.assignedTemplateVersion.definitionJson as never);
    if (!template.valid) errors.push(...template.errors);
    if (definition.assignedTemplateVersion.status !== DocumentTemplateVersionStatus.PUBLISHED) errors.push("Assigned template version is not published.");
  }

  if (status === "COMPLETE" && errors.length) status = "INCOMPLETE";
  if (status === "MISSING_TEMPLATE" && definition.assignedTemplateVersion) status = "INVALID_TEMPLATE";
  return { status, requestable: status === "COMPLETE" && errors.length === 0, errors, warnings };
}

export async function getRequestableDocumentDefinitions(tenantId: string) {
  const definitions = await platformPrisma.documentDefinition.findMany({
    where: {
      tenantId,
      active: true,
      archivedAt: null,
      status: DocumentDefinitionStatus.ACTIVE,
      homeownerDownloadEnabled: true,
    },
    include: {
      fields: { where: { active: true }, orderBy: [{ displayOrder: "asc" }, { label: "asc" }] },
      assignedTemplateVersion: { include: { templateSet: true } },
    },
    orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
  });
  return definitions.filter((definition) => evaluateDefinitionCompleteness(definition).requestable);
}

export function workflowPresetForDefinition(definition: Pick<DocumentDefinition, "deliveryMode" | "paymentRequired" | "approvalRequired" | "requiresAdminReview" | "allowImmediateDownload">) {
  return workflowPresetForDeliveryMode(definition.deliveryMode);
}

export const documentSequenceScopeOptions = Object.values(DocumentSequenceScope);
export { defaultNumberingFormat, validateNumberingFormat };
export { documentWorkflowPresetValues, isDocumentWorkflowPreset, workflowFieldsForPreset, workflowPresetForDeliveryMode, type DocumentWorkflowPreset } from "@/lib/services/document-workflow-presets";
