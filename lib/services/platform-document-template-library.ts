import "server-only";

import crypto from "node:crypto";
import {
  DocumentDefinitionStatus,
  DocumentSequenceScope,
  DocumentTemplateOwnership,
  DocumentTemplateVersionStatus,
  DocumentWorkflowApprovalMode,
  DocumentWorkflowStepType,
  Prisma,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import {
  FREE_DOCUMENT_LIBRARY_SOURCE,
  freeDocumentTemplateBlueprintByKey,
  freeDocumentTemplateBlueprints,
  validateFreeDocumentTemplateCatalog,
  type FreeDocumentTemplateBlueprint,
} from "@/lib/services/platform-document-template-catalog";
import { validateTemplateDefinition } from "@/lib/services/document-template-builder";

const TRANSACTION_TIMEOUT_MS = 120_000;
const LIBRARY_SET_PREFIX = "HOAHUB:FREE_DOCUMENT_LIBRARY:";

type TransactionClient = Prisma.TransactionClient;

export type FreeDocumentTemplateTenantStatus = {
  key: string;
  code: string;
  displayName: string;
  definitionId: string | null;
  definitionCode: string | null;
  definitionActive: boolean;
  assignedVersion: number | null;
  assignedStatus: DocumentTemplateVersionStatus | null;
  installedLibraryVersion: number | null;
  current: boolean;
  hasExistingDefinition: boolean;
};

export type FreeDocumentTemplateAssignmentResult = {
  key: string;
  definitionId: string;
  templateVersionId: string;
  templateVersion: number;
  action: "CREATED" | "UPGRADED" | "REASSIGNED_CURRENT";
  workflowAction: "CREATED" | "REFRESHED" | "PRESERVED";
  retiredVersionId: string | null;
  addedFieldKeys: string[];
};

export async function getFreeDocumentTemplateTenantStatus(tenantId: string): Promise<FreeDocumentTemplateTenantStatus[]> {
  const tenant = await platformPrisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) throw new Error("Tenant was not found.");
  const definitions = await platformPrisma.documentDefinition.findMany({
    where: { tenantId },
    include: { assignedTemplateVersion: { include: { templateSet: true } } },
  });
  return freeDocumentTemplateBlueprints.map((blueprint) => {
    const matches = definitions.filter((definition) => definition.code === blueprint.code || Boolean(blueprint.legacyType && definition.legacyType === blueprint.legacyType));
    const definition = matches.find((item) => item.code === blueprint.code) ?? matches[0] ?? null;
    const metadata = jsonObject(definition?.assignedTemplateVersion?.previewMetadata);
    const contentHash = hashDefinition(blueprint.template);
    const assignedContentHash = definition?.assignedTemplateVersion
      ? hashDefinition(definition.assignedTemplateVersion.definitionJson)
      : null;
    const installedLibraryVersion = metadata?.source === FREE_DOCUMENT_LIBRARY_SOURCE && metadata.key === blueprint.key
      ? positiveInteger(metadata.libraryVersion)
      : null;
    return {
      key: blueprint.key,
      code: blueprint.code,
      displayName: blueprint.displayName,
      definitionId: definition?.id ?? null,
      definitionCode: definition?.code ?? null,
      definitionActive: Boolean(definition?.active && !definition.archivedAt && definition.status === DocumentDefinitionStatus.ACTIVE),
      assignedVersion: definition?.assignedTemplateVersion?.version ?? null,
      assignedStatus: definition?.assignedTemplateVersion?.status ?? null,
      installedLibraryVersion,
      current: Boolean(
        definition?.active
        && !definition.archivedAt
        && definition.status === DocumentDefinitionStatus.ACTIVE
        && definition.assignedTemplateVersion?.status === DocumentTemplateVersionStatus.PUBLISHED
        && installedLibraryVersion === blueprint.libraryVersion
        && metadata?.contentHash === contentHash
        && assignedContentHash === contentHash,
      ),
      hasExistingDefinition: matches.length > 0,
    };
  });
}

export async function assignFreeDocumentTemplateToTenant(input: {
  tenantId: string;
  templateKey: string;
  actorUserId: string;
  applyRecommendedWorkflow?: boolean;
}): Promise<FreeDocumentTemplateAssignmentResult> {
  const blueprint = freeDocumentTemplateBlueprintByKey(input.templateKey);
  if (!blueprint) throw new Error("Free document template was not found in the platform catalog.");
  validateCatalogOrThrow();
  return platformPrisma.$transaction(
    (tx) => assignBlueprint(tx, blueprint, input),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: TRANSACTION_TIMEOUT_MS },
  );
}

export async function assignFreeDocumentTemplateLibraryToTenant(input: {
  tenantId: string;
  actorUserId: string;
  applyRecommendedWorkflow?: boolean;
}): Promise<FreeDocumentTemplateAssignmentResult[]> {
  validateCatalogOrThrow();
  return platformPrisma.$transaction(async (tx) => {
    await assertTenant(tx, input.tenantId);
    const results: FreeDocumentTemplateAssignmentResult[] = [];
    for (const blueprint of freeDocumentTemplateBlueprints) results.push(await assignBlueprint(tx, blueprint, input, true));
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorUserId,
        module: "DOCUMENTS",
        action: "ASSIGN_FREE_DOCUMENT_TEMPLATE_LIBRARY",
        entityType: "Tenant",
        entityId: input.tenantId,
        metadata: asJson({ source: FREE_DOCUMENT_LIBRARY_SOURCE, count: results.length, results: results.map(({ key, definitionId, templateVersion, action, workflowAction }) => ({ key, definitionId, templateVersion, action, workflowAction })) }),
      },
    });
    return results;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: TRANSACTION_TIMEOUT_MS });
}

async function assignBlueprint(
  tx: TransactionClient,
  blueprint: FreeDocumentTemplateBlueprint,
  input: { tenantId: string; actorUserId: string; applyRecommendedWorkflow?: boolean },
  tenantAlreadyChecked = false,
): Promise<FreeDocumentTemplateAssignmentResult> {
  if (!tenantAlreadyChecked) await assertTenant(tx, input.tenantId);
  const templateValidation = validateTemplateDefinition(blueprint.template);
  if (!templateValidation.valid) throw new Error(`${blueprint.displayName} template is invalid: ${templateValidation.errors.join("; ")}`);

  const candidates = await tx.documentDefinition.findMany({
    where: {
      tenantId: input.tenantId,
      OR: [
        { code: blueprint.code },
        ...(blueprint.legacyType ? [{ legacyType: blueprint.legacyType }] : []),
      ],
    },
    include: {
      fields: true,
      assignedTemplateVersion: { include: { templateSet: true } },
      workflowDefinition: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
    },
  });
  if (candidates.length > 1) throw new Error(`${blueprint.displayName} has multiple tenant definitions matching the same document identity. Resolve the duplicate definitions before platform assignment.`);

  let definition = candidates[0] ?? null;
  const createdDefinition = !definition;
  if (!definition) {
    definition = await tx.documentDefinition.create({
      data: {
        tenantId: input.tenantId,
        code: blueprint.code,
        displayName: blueprint.displayName,
        description: blueprint.description,
        category: blueprint.category,
        status: DocumentDefinitionStatus.ACTIVE,
        active: true,
        archivedAt: null,
        systemKey: `${FREE_DOCUMENT_LIBRARY_SOURCE}:${blueprint.key}`,
        legacyType: blueprint.legacyType,
        ...blueprint.workflow,
        homeownerDownloadEnabled: true,
        outstandingBalancePolicy: blueprint.outstandingBalancePolicy,
        walkInEnabled: true,
        householdMemberEnabled: true,
        manualSubjectEnabled: false,
        allowRegeneration: true,
        allowPayLater: false,
        currency: "PHP",
        receiptRequired: false,
        numberingFormat: blueprint.numberingFormat,
        sequenceScope: DocumentSequenceScope.ANNUAL,
        validityDays: blueprint.validityDays,
        maxCopies: blueprint.maxCopies,
        qrEnabled: true,
        watermarkEnabled: Boolean(blueprint.template.page.watermark.enabled),
        createdById: input.actorUserId,
        updatedById: input.actorUserId,
      },
      include: {
        fields: true,
        assignedTemplateVersion: { include: { templateSet: true } },
        workflowDefinition: { include: { steps: true } },
      },
    });
  }

  const addedFieldKeys = await addMissingFields(tx, input.tenantId, definition.id, blueprint, input.actorUserId);
  const applyRecommendedWorkflow = createdDefinition || input.applyRecommendedWorkflow === true || !definition.workflowDefinitionId;
  const workflow = applyRecommendedWorkflow
    ? await ensureRecommendedWorkflow(tx, { tenantId: input.tenantId, definition, blueprint, actorUserId: input.actorUserId })
    : { id: definition.workflowDefinitionId!, action: "PRESERVED" as const };

  if (createdDefinition || applyRecommendedWorkflow) {
    await tx.documentDefinition.update({
      where: { id: definition.id },
      data: {
        displayName: blueprint.displayName,
        description: blueprint.description,
        category: blueprint.category,
        status: DocumentDefinitionStatus.ACTIVE,
        active: true,
        archivedAt: null,
        systemKey: definition.systemKey ?? `${FREE_DOCUMENT_LIBRARY_SOURCE}:${blueprint.key}`,
        legacyType: definition.legacyType ?? blueprint.legacyType,
        ...blueprint.workflow,
        feeAmount: blueprint.workflow.feeAmount,
        receiptRequired: false,
        outstandingBalancePolicy: blueprint.outstandingBalancePolicy,
        numberingFormat: blueprint.numberingFormat,
        sequenceScope: DocumentSequenceScope.ANNUAL,
        validityDays: blueprint.validityDays,
        maxCopies: blueprint.maxCopies,
        qrEnabled: true,
        workflowDefinitionId: workflow.id,
        updatedById: input.actorUserId,
        version: createdDefinition ? undefined : { increment: 1 },
      },
    });
  } else {
    await tx.documentDefinition.update({
      where: { id: definition.id },
      data: {
        status: DocumentDefinitionStatus.ACTIVE,
        active: true,
        archivedAt: null,
        systemKey: definition.systemKey ?? `${FREE_DOCUMENT_LIBRARY_SOURCE}:${blueprint.key}`,
        qrEnabled: true,
        updatedById: input.actorUserId,
        version: { increment: 1 },
      },
    });
  }

  if (blueprint.legacyType) {
    await tx.documentTypeConfiguration.updateMany({
      where: { tenantId: input.tenantId, type: blueprint.legacyType },
      data: { definitionId: definition.id, updatedById: input.actorUserId, version: { increment: 1 } },
    });
  }

  const contentHash = hashDefinition(blueprint.template);
  const assigned = definition.assignedTemplateVersion;
  const assignedMeta = jsonObject(assigned?.previewMetadata);
  const assignedContentHash = assigned ? hashDefinition(assigned.definitionJson) : null;
  const metadataClaimsCurrent = Boolean(
    assignedMeta?.source === FREE_DOCUMENT_LIBRARY_SOURCE
    && assignedMeta.key === blueprint.key
    && positiveInteger(assignedMeta.libraryVersion) === blueprint.libraryVersion
    && assignedMeta.contentHash === contentHash,
  );
  const alreadyCurrent = Boolean(
    assigned
    && assigned.status === DocumentTemplateVersionStatus.PUBLISHED
    && metadataClaimsCurrent
    && assignedContentHash === contentHash,
  );
  const repairingContentMismatch = Boolean(assigned && metadataClaimsCurrent && assignedContentHash !== contentHash);

  let version = assigned;
  let retiredVersionId: string | null = null;
  let action: FreeDocumentTemplateAssignmentResult["action"] = "REASSIGNED_CURRENT";
  if (!alreadyCurrent) {
    const templateSet = await ensureLibraryTemplateSet(tx, { tenantId: input.tenantId, definitionId: definition.id, blueprint, actorUserId: input.actorUserId });
    const highest = await tx.documentTemplateVersion.aggregate({ where: { tenantId: input.tenantId, templateSetId: templateSet.id }, _max: { version: true } });
    const nextVersion = (highest._max.version ?? 0) + 1;
    version = await tx.documentTemplateVersion.create({
      data: {
        tenantId: input.tenantId,
        templateSetId: templateSet.id,
        version: nextVersion,
        status: DocumentTemplateVersionStatus.PUBLISHED,
        ownershipType: DocumentTemplateOwnership.TENANT,
        schemaVersion: blueprint.template.schemaVersion,
        definitionJson: asJson(blueprint.template),
        previewMetadata: asJson({ source: FREE_DOCUMENT_LIBRARY_SOURCE, key: blueprint.key, libraryVersion: blueprint.libraryVersion, contentHash, assignedByPlatform: true, tenantEditable: true }),
        publishedAt: new Date(),
        publishedById: input.actorUserId,
        createdById: input.actorUserId,
        sourceVersionId: assigned?.id ?? null,
        cloneSourceVersion: assigned?.version ?? null,
        clonedAt: assigned ? new Date() : null,
        upgradeCompatible: true,
        restorable: true,
      },
      include: { templateSet: true },
    });
    if (assigned && assigned.status === DocumentTemplateVersionStatus.PUBLISHED && assigned.id !== version.id) {
      await tx.documentTemplateVersion.update({ where: { id: assigned.id }, data: { status: DocumentTemplateVersionStatus.RETIRED } });
      retiredVersionId = assigned.id;
    }
    await tx.documentDefinition.update({ where: { id: definition.id }, data: { assignedTemplateVersionId: version.id, updatedById: input.actorUserId } });
    action = createdDefinition ? "CREATED" : "UPGRADED";
  } else if (assigned && definition.assignedTemplateVersionId !== assigned.id) {
    await tx.documentDefinition.update({ where: { id: definition.id }, data: { assignedTemplateVersionId: assigned.id, updatedById: input.actorUserId } });
  }
  if (!version) throw new Error(`${blueprint.displayName} could not resolve a published template version.`);

  await tx.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorUserId,
      module: "DOCUMENTS",
      action: "ASSIGN_FREE_DOCUMENT_TEMPLATE",
      entityType: "DocumentDefinition",
      entityId: definition.id,
      metadata: asJson({
        source: FREE_DOCUMENT_LIBRARY_SOURCE,
        key: blueprint.key,
        libraryVersion: blueprint.libraryVersion,
        action,
        workflowAction: workflow.action,
        applyRecommendedWorkflow,
        templateVersionId: version.id,
        templateVersion: version.version,
        retiredVersionId,
        addedFieldKeys,
        tenantEditable: true,
        historicalRequestsPreserved: true,
        contentIntegrityVerified: true,
        repairedContentMismatch: repairingContentMismatch,
      }),
    },
  });

  return {
    key: blueprint.key,
    definitionId: definition.id,
    templateVersionId: version.id,
    templateVersion: version.version,
    action,
    workflowAction: workflow.action,
    retiredVersionId,
    addedFieldKeys,
  };
}

async function addMissingFields(tx: TransactionClient, tenantId: string, definitionId: string, blueprint: FreeDocumentTemplateBlueprint, actorUserId: string) {
  const existing = await tx.documentDefinitionField.findMany({ where: { tenantId, definitionId }, select: { key: true } });
  const existingKeys = new Set(existing.map((field) => field.key));
  const missing = blueprint.fields.filter((field) => !existingKeys.has(field.key));
  if (missing.length) {
    const max = await tx.documentDefinitionField.aggregate({ where: { tenantId, definitionId }, _max: { displayOrder: true } });
    const start = max._max.displayOrder ?? 0;
    await tx.documentDefinitionField.createMany({
      data: missing.map((field, index) => ({
        tenantId,
        definitionId,
        key: field.key,
        label: field.label,
        fieldType: field.fieldType,
        required: field.required,
        active: true,
        displayOrder: start + (index + 1) * 10,
        options: field.options ? asJson(field.options) : undefined,
        defaultValue: field.defaultValue ? asJson(field.defaultValue) : undefined,
      })),
    });
    await tx.auditLog.create({ data: { tenantId, actorId: actorUserId, module: "DOCUMENTS", action: "ADD_FREE_LIBRARY_DOCUMENT_FIELDS", entityType: "DocumentDefinition", entityId: definitionId, metadata: asJson({ addedFieldKeys: missing.map((field) => field.key), preservedExistingFields: true }) } });
  }
  return missing.map((field) => field.key);
}

async function ensureRecommendedWorkflow(tx: TransactionClient, input: {
  tenantId: string;
  definition: { id: string; code: string; displayName: string; workflowDefinitionId: string | null };
  blueprint: FreeDocumentTemplateBlueprint;
  actorUserId: string;
}) {
  const existingId = input.definition.workflowDefinitionId;
  const workflowCode = `${input.definition.code}_LIBRARY_APPROVAL_${input.definition.id.slice(-6).toUpperCase()}`.slice(0, 190);
  const workflow = existingId
    ? await tx.documentWorkflowDefinition.update({
        where: { id: existingId },
        data: { active: true, approvalMode: DocumentWorkflowApprovalMode.SEQUENTIAL, updatedById: input.actorUserId, version: { increment: 1 } },
      })
    : await tx.documentWorkflowDefinition.create({
        data: {
          tenantId: input.tenantId,
          code: workflowCode,
          name: `${input.blueprint.displayName} approval workflow`,
          description: "HOAHub recommended free-document workflow. Tenant administrators may configure this workflow after assignment.",
          active: true,
          approvalMode: DocumentWorkflowApprovalMode.SEQUENTIAL,
          createdById: input.actorUserId,
          updatedById: input.actorUserId,
        },
      });
  const step = await tx.documentWorkflowStep.findFirst({ where: { tenantId: input.tenantId, workflowId: workflow.id, stepOrder: 1 }, select: { id: true } });
  if (step) {
    await tx.documentWorkflowStep.update({ where: { id: step.id }, data: { stepType: DocumentWorkflowStepType.APPROVAL, approvalMode: DocumentWorkflowApprovalMode.SEQUENTIAL, approverRole: null, approverUserId: null, required: true, updatedById: input.actorUserId } });
  } else {
    await tx.documentWorkflowStep.create({ data: { tenantId: input.tenantId, workflowId: workflow.id, stepOrder: 1, stepType: DocumentWorkflowStepType.APPROVAL, approvalMode: DocumentWorkflowApprovalMode.SEQUENTIAL, approverRole: null, approverUserId: null, required: true, createdById: input.actorUserId, updatedById: input.actorUserId } });
  }
  await tx.documentWorkflowStep.updateMany({ where: { tenantId: input.tenantId, workflowId: workflow.id, stepOrder: { gt: 1 }, required: true }, data: { required: false, updatedById: input.actorUserId } });
  return { id: workflow.id, action: existingId ? "REFRESHED" as const : "CREATED" as const };
}

async function ensureLibraryTemplateSet(tx: TransactionClient, input: { tenantId: string; definitionId: string; blueprint: FreeDocumentTemplateBlueprint; actorUserId: string }) {
  const certifiedKey = `${LIBRARY_SET_PREFIX}${input.blueprint.key}`;
  const existing = await tx.documentTemplateSet.findFirst({ where: { tenantId: input.tenantId, definitionId: input.definitionId, certifiedKey }, orderBy: { updatedAt: "desc" } });
  if (existing) {
    return tx.documentTemplateSet.update({ where: { id: existing.id }, data: { active: true, ownershipType: DocumentTemplateOwnership.TENANT, editable: true, upgradeCompatible: true, restorable: true, updatedById: input.actorUserId } });
  }
  return tx.documentTemplateSet.create({
    data: {
      tenantId: input.tenantId,
      definitionId: input.definitionId,
      name: `${input.blueprint.displayName} — HOAHub Free Template`,
      description: "Platform-provided professional starting template. Tenant administrators may configure the definition, workflow, and create/edit tenant template versions after assignment.",
      active: true,
      ownershipType: DocumentTemplateOwnership.TENANT,
      certifiedKey,
      upgradeCompatible: true,
      restorable: true,
      editable: true,
      createdById: input.actorUserId,
      updatedById: input.actorUserId,
    },
  });
}

async function assertTenant(tx: TransactionClient, tenantId: string) {
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) throw new Error("Tenant was not found.");
}

function validateCatalogOrThrow() {
  const result = validateFreeDocumentTemplateCatalog();
  if (!result.valid) throw new Error(`Free document template catalog is invalid: ${result.errors.join("; ")}`);
}

function hashDefinition(value: unknown) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function jsonObject(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : null;
}

function positiveInteger(value: Prisma.JsonValue | undefined) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}