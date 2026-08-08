import "server-only";

import { DocumentGenerationMode, DocumentTemplateOwnership, DocumentTemplateVersionStatus, Prisma } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import {
  assertEditableTemplateOwnership,
  cloneCertifiedTemplateForTenant,
  createCustomTemplateSet,
  restoreTenantTemplateFromCertified,
} from "@/lib/services/document-template-ownership";
import {
  normalizeTemplateDefinition,
  validateTemplateDefinition,
} from "@/lib/services/document-template-builder";
import { listDocumentPlaceholders, validateTemplatePlaceholdersForTenant } from "@/lib/services/document-placeholders";
import { getActiveOrganizationOfficers } from "@/lib/organization";
import { requireDocumentPermission, type DocumentExecutionContext } from "@/lib/services/document-runtime-context";
import { writeDocumentAudit } from "@/lib/services/document-runtime-audit";
import { DocumentRuntimeError } from "@/lib/services/document-runtime-errors";

export async function listDocumentTemplateSets(context: DocumentExecutionContext, definitionId?: string) {
  requireDocumentPermission(context, "VIEW_TEMPLATES");
  return platformPrisma.documentTemplateSet.findMany({
    where: { tenantId: context.tenantId, ...(definitionId ? { definitionId } : {}) },
    include: { definition: { select: { id: true, code: true, displayName: true } }, versions: { orderBy: { version: "desc" } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export async function getDocumentTemplateSet(context: DocumentExecutionContext, templateSetId: string) {
  requireDocumentPermission(context, "VIEW_TEMPLATES");
  const set = await platformPrisma.documentTemplateSet.findFirst({ where: { tenantId: context.tenantId, id: templateSetId }, include: { definition: true, versions: { orderBy: { version: "desc" } } } });
  if (!set) throw new Error("Document template set was not found for the authenticated tenant.");
  return set;
}

export async function getDocumentTemplateVersion(context: DocumentExecutionContext, versionId: string) {
  requireDocumentPermission(context, "VIEW_TEMPLATES");
  const version = await platformPrisma.documentTemplateVersion.findFirst({ where: { tenantId: context.tenantId, id: versionId }, include: { templateSet: { include: { definition: true } } } });
  if (!version) throw new Error("Document template version was not found for the authenticated tenant.");
  return version;
}

export async function createTenantTemplateSet(context: DocumentExecutionContext, input: { definitionId: string; name: string; description?: string }) {
  requireDocumentPermission(context, "MANAGE_TENANT_TEMPLATES");
  await assertDefinition(context, input.definitionId);
  const set = await createCustomTemplateSet({ tenantId: context.tenantId, definitionId: input.definitionId, name: input.name, description: input.description, createdById: context.authenticatedUserId });
  await writeDocumentAudit({ context, action: "CREATE_TEMPLATE_SET", entityType: "DocumentTemplateSet", entityId: set.id, after: { definitionId: input.definitionId, name: set.name } });
  return set;
}

export async function cloneCertifiedDocumentTemplate(context: DocumentExecutionContext, input: { definitionId: string; certifiedVersionId: string }) {
  requireDocumentPermission(context, "MANAGE_TENANT_TEMPLATES");
  await assertDefinition(context, input.definitionId);
  const result = await cloneCertifiedTemplateForTenant({ tenantId: context.tenantId, definitionId: input.definitionId, certifiedVersionId: input.certifiedVersionId, createdById: context.authenticatedUserId });
  if (result.created) await writeDocumentAudit({ context, action: "CLONE_CERTIFIED_TEMPLATE", entityType: "DocumentTemplateSet", entityId: result.set.id, after: { certifiedVersionId: input.certifiedVersionId, definitionId: input.definitionId } });
  return result;
}

export async function restoreCertifiedDocumentTemplate(context: DocumentExecutionContext, input: { templateSetId: string; certifiedVersionId: string }) {
  requireDocumentPermission(context, "MANAGE_TENANT_TEMPLATES");
  const set = await getDocumentTemplateSet(context, input.templateSetId);
  assertEditableTemplateOwnership(set.ownershipType);
  const draft = await restoreTenantTemplateFromCertified({ tenantId: context.tenantId, templateSetId: input.templateSetId, certifiedVersionId: input.certifiedVersionId, createdById: context.authenticatedUserId });
  await writeDocumentAudit({ context, action: "RESTORE_TEMPLATE_FROM_CERTIFIED", entityType: "DocumentTemplateVersion", entityId: draft.id, after: { templateSetId: input.templateSetId, certifiedVersionId: input.certifiedVersionId } });
  return draft;
}

export async function duplicateDocumentTemplateVersion(context: DocumentExecutionContext, input: { versionId: string; name?: string }) {
  requireDocumentPermission(context, "MANAGE_TENANT_TEMPLATES");
  const source = await getDocumentTemplateVersion(context, input.versionId);
  assertEditableTemplateOwnership(source.ownershipType);
  const maxVersion = await platformPrisma.documentTemplateVersion.aggregate({ where: { tenantId: context.tenantId, templateSetId: source.templateSetId }, _max: { version: true } });
  const draft = await platformPrisma.$transaction(async (tx) => {
    const created = await tx.documentTemplateVersion.create({ data: { tenantId: context.tenantId, templateSetId: source.templateSetId, version: (maxVersion._max.version ?? 0) + 1, status: DocumentTemplateVersionStatus.DRAFT, ownershipType: source.ownershipType, schemaVersion: source.schemaVersion, definitionJson: asJson(source.definitionJson), previewMetadata: asJson({ duplicatedFromVersionId: source.id, duplicatedFromVersion: source.version }), createdById: context.authenticatedUserId, sourceVersionId: source.id, cloneSourceVersion: source.version, clonedAt: new Date(), upgradeCompatible: true, restorable: true } });
    if (input.name?.trim()) await tx.documentTemplateSet.update({ where: { id: source.templateSetId }, data: { name: input.name.trim(), updatedById: context.authenticatedUserId } });
    await writeDocumentAudit({ context, action: "DUPLICATE_TEMPLATE_VERSION", entityType: "DocumentTemplateVersion", entityId: created.id, after: { sourceVersionId: source.id, version: created.version }, client: tx });
    return created;
  });
  return draft;
}

export async function saveDocumentTemplateDraft(context: DocumentExecutionContext, input: { versionId: string; definitionJson: unknown; previewMetadata?: unknown; reason?: string }) {
  requireDocumentPermission(context, "MANAGE_TENANT_TEMPLATES");
  const current = await getDocumentTemplateVersion(context, input.versionId);
  assertEditableTemplateOwnership(current.ownershipType);
  if (current.status !== DocumentTemplateVersionStatus.DRAFT) throw new Error("Only draft template versions can be edited.");
  const placeholders = await listDocumentPlaceholders(context);
  const officers = await getActiveOrganizationOfficers(context.tenantId);
  const validation = validateTemplateDefinition(input.definitionJson, { allowedPlaceholders: new Set(placeholders.map((item) => item.key)), officerPositions: officers.map((officer) => officer.position), activeOfficerCount: officers.length });
  if (!validation.valid) throw new Error(`Template draft is invalid: ${validation.errors.join(" ")}`);
  const placeholderValidation = await validateTemplatePlaceholdersForTenant(context, renderableText(input.definitionJson));
  if (!placeholderValidation.valid) throw new Error(`Template placeholders are invalid: ${placeholderValidation.validationErrors.join(" ")}`);
  const updated = await platformPrisma.$transaction(async (tx) => {
    const result = await tx.documentTemplateVersion.update({ where: { id: current.id }, data: { definitionJson: asJson(normalizeTemplateDefinition(input.definitionJson, current.templateSet.definitionId)), previewMetadata: asJson(input.previewMetadata), updatedAt: new Date() } });
    await writeDocumentAudit({ context, action: "SAVE_TEMPLATE_DRAFT", entityType: "DocumentTemplateVersion", entityId: result.id, reason: input.reason, after: { version: result.version, validation: "valid" }, client: tx });
    return result;
  });
  return updated;
}

export async function publishDocumentTemplateDraft(context: DocumentExecutionContext, versionId: string) {
  requireDocumentPermission(context, "PUBLISH_TEMPLATES");
  const current = await getDocumentTemplateVersion(context, versionId);
  assertEditableTemplateOwnership(current.ownershipType);
  if (current.status !== DocumentTemplateVersionStatus.DRAFT) throw new Error("Only a draft template version can be published.");
  const placeholders = await listDocumentPlaceholders(context);
  const officers = await getActiveOrganizationOfficers(context.tenantId);
  const validation = validateTemplateDefinition(current.definitionJson, { allowedPlaceholders: new Set(placeholders.map((item) => item.key)), officerPositions: officers.map((officer) => officer.position), activeOfficerCount: officers.length });
  if (!validation.valid) throw new Error(`Template cannot be published: ${validation.errors.join(" ")}`);
  const placeholderValidation = await validateTemplatePlaceholdersForTenant(context, renderableText(current.definitionJson));
  if (!placeholderValidation.valid) throw new Error(`Template placeholders are invalid: ${placeholderValidation.validationErrors.join(" ")}`);
  const published = await platformPrisma.$transaction(async (tx) => {
    const set = await tx.documentTemplateSet.findFirst({ where: { tenantId: context.tenantId, id: current.templateSetId, active: true }, include: { definition: true } });
    if (!set || set.ownershipType === DocumentTemplateOwnership.CERTIFIED) throw new Error("Only an active tenant-owned template set can be published.");
    await tx.documentTemplateVersion.updateMany({ where: { tenantId: context.tenantId, templateSetId: set.id, status: DocumentTemplateVersionStatus.PUBLISHED }, data: { status: DocumentTemplateVersionStatus.RETIRED } });
    const result = await tx.documentTemplateVersion.update({ where: { id: current.id }, data: { status: DocumentTemplateVersionStatus.PUBLISHED, publishedAt: new Date(), publishedById: context.authenticatedUserId } });
    await tx.documentDefinition.update({ where: { id: set.definitionId }, data: { assignedTemplateVersionId: result.id, version: { increment: 1 }, updatedById: context.authenticatedUserId } });
    await writeDocumentAudit({ context, action: "PUBLISH_TEMPLATE", entityType: "DocumentTemplateVersion", entityId: result.id, after: { templateSetId: set.id, definitionId: set.definitionId, version: result.version }, client: tx });
    return result;
  });
  return published;
}

export async function archiveDocumentTemplateSet(context: DocumentExecutionContext, templateSetId: string) {
  requireDocumentPermission(context, "MANAGE_TENANT_TEMPLATES");
  const set = await getDocumentTemplateSet(context, templateSetId);
  assertEditableTemplateOwnership(set.ownershipType);
  const archived = await platformPrisma.documentTemplateSet.update({ where: { id: set.id }, data: { active: false, updatedById: context.authenticatedUserId } });
  await writeDocumentAudit({ context, action: "ARCHIVE_TEMPLATE_SET", entityType: "DocumentTemplateSet", entityId: archived.id, before: { active: true }, after: { active: false } });
  return archived;
}

export async function compareDocumentTemplateVersions(context: DocumentExecutionContext, leftVersionId: string, rightVersionId: string) {
  const [left, right] = await Promise.all([getDocumentTemplateVersion(context, leftVersionId), getDocumentTemplateVersion(context, rightVersionId)]);
  if (left.templateSetId !== right.templateSetId) throw new Error("Template versions must belong to the same tenant template set.");
  return { left: { id: left.id, version: left.version }, right: { id: right.id, version: right.version }, changes: diffJson(normalizeTemplateDefinition(left.definitionJson), normalizeTemplateDefinition(right.definitionJson)) };
}

export async function resolveActiveDocumentTemplate(context: DocumentExecutionContext, definitionId: string) {
  requireDocumentPermission(context, "VIEW_TEMPLATES");
  const definition = await assertDefinition(context, definitionId);
  if (definition.assignedTemplateVersionId) {
    const assigned = await platformPrisma.documentTemplateVersion.findFirst({ where: { tenantId: context.tenantId, id: definition.assignedTemplateVersionId, status: DocumentTemplateVersionStatus.PUBLISHED, templateSet: { tenantId: context.tenantId, definitionId, active: true } } });
    if (assigned) return assigned;
  }
  return platformPrisma.documentTemplateVersion.findFirst({ where: { tenantId: context.tenantId, status: DocumentTemplateVersionStatus.PUBLISHED, templateSet: { tenantId: context.tenantId, definitionId, active: true } }, orderBy: { version: "desc" } });
}

export async function resolveEffectiveDocumentTemplate(context: DocumentExecutionContext, input: { definitionId: string; mode: DocumentGenerationMode; requestId?: string | null; requestTemplateVersionId?: string | null; draftTemplateVersionId?: string | null }) {
  const definition = await assertDefinition(context, input.definitionId);
  if (input.draftTemplateVersionId) {
    if (input.mode !== DocumentGenerationMode.PREVIEW) throw new Error("Draft templates may be used only for an explicit preview.");
    requireDocumentPermission(context, "MANAGE_TENANT_TEMPLATES");
    const draft = await platformPrisma.documentTemplateVersion.findFirst({ where: { tenantId: context.tenantId, id: input.draftTemplateVersionId, status: DocumentTemplateVersionStatus.DRAFT, templateSet: { tenantId: context.tenantId, definitionId: input.definitionId, active: true, editable: true } }, include: { templateSet: true } });
    if (!draft) throw new Error("Draft template was not found for this tenant and definition.");
    return draft;
  }
  if (input.requestTemplateVersionId) {
    const captured = await platformPrisma.documentTemplateVersion.findFirst({ where: { tenantId: context.tenantId, id: input.requestTemplateVersionId, status: { in: [DocumentTemplateVersionStatus.PUBLISHED, DocumentTemplateVersionStatus.RETIRED] }, templateSet: { tenantId: context.tenantId, definitionId: input.definitionId } }, include: { templateSet: true } });
    if (captured) return captured;
    throw new DocumentRuntimeError("DOCUMENT_TEMPLATE_VERSION_NOT_AVAILABLE", "The captured template version is not valid for this tenant and document definition.");
  }
  let active = null;
  if (definition.assignedTemplateVersionId) {
    active = await platformPrisma.documentTemplateVersion.findFirst({
      where: {
        tenantId: context.tenantId,
        id: definition.assignedTemplateVersionId,
        status: DocumentTemplateVersionStatus.PUBLISHED,
        templateSet: { tenantId: context.tenantId, definitionId: input.definitionId, active: true },
      },
      include: { templateSet: true },
    });
  }
  if (!active) {
    active = await platformPrisma.documentTemplateVersion.findFirst({ where: { tenantId: context.tenantId, status: DocumentTemplateVersionStatus.PUBLISHED, templateSet: { tenantId: context.tenantId, definitionId: input.definitionId, active: true } }, include: { templateSet: true }, orderBy: { version: "desc" } });
  }
  if (!active) throw new DocumentRuntimeError("DOCUMENT_TEMPLATE_VERSION_NOT_AVAILABLE", "No approved and published template version is available for this document definition.");
  if (input.requestId) {
    await platformPrisma.documentRequest.updateMany({
      where: { tenantId: context.tenantId, id: input.requestId, definitionId: input.definitionId, templateVersionIdSnapshot: null },
      data: { templateVersionIdSnapshot: active.id, templateVersionSnapshot: active.version, templateDefinitionSnapshot: asJson(active.definitionJson) },
    });
  }
  return active;
}

export async function resolveDocumentTemplateForGeneration(context: DocumentExecutionContext, input: { definitionId: string; mode: DocumentGenerationMode; requestId?: string | null; requestTemplateVersionId?: string | null; draftTemplateVersionId?: string | null }) {
  return resolveEffectiveDocumentTemplate(context, input);
}

async function assertDefinition(context: DocumentExecutionContext, definitionId: string) {
  const definition = await platformPrisma.documentDefinition.findFirst({ where: { id: definitionId, tenantId: context.tenantId }, select: { id: true, tenantId: true, assignedTemplateVersionId: true } });
  if (!definition) throw new Error("Document definition was not found for the authenticated tenant.");
  return definition;
}

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function renderableText(value: unknown) {
  return JSON.stringify(value) || "";
}

function diffJson(left: unknown, right: unknown, path = ""): string[] {
  if (Object.is(left, right)) return [];
  if (Array.isArray(left) && Array.isArray(right)) {
    const changes: string[] = [];
    const length = Math.max(left.length, right.length);
    for (let i = 0; i < length; i += 1) changes.push(...diffJson(left[i], right[i], `${path}[${i}]`));
    return changes;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].flatMap((key) => diffJson((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key], path ? `${path}.${key}` : key));
  }
  return [`${path || "root"} changed`];
}