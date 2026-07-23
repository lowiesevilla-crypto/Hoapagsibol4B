import "server-only";

import { DocumentTemplateOwnership, DocumentTemplateVersionStatus } from "@prisma/client";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { asJson } from "@/lib/organization";
import { platformPrisma } from "@/lib/db";

export const CERTIFIED_TEMPLATE_TENANT_ID = process.env.CERTIFIED_TEMPLATE_TENANT_ID || DEFAULT_TENANT_ID;

export type TemplateOwnershipMetadata = {
  ownershipType: DocumentTemplateOwnership;
  ownerLabel: string;
  sourceTemplateSetId: string | null;
  sourceTemplateVersionId: string | null;
  currentVersion: number | null;
  currentPublishedVersion: number | null;
  draftVersion: number | null;
  publishedAt: Date | null;
  publishedById: string | null;
  status: DocumentTemplateVersionStatus | null;
  upgradeCompatible: boolean;
  restorable: boolean;
  editable: boolean;
};

function ownerLabel(ownershipType: DocumentTemplateOwnership) {
  if (ownershipType === DocumentTemplateOwnership.CERTIFIED) return "HOAHub";
  if (ownershipType === DocumentTemplateOwnership.CUSTOM) return "Tenant custom";
  return "Tenant";
}

export function getTemplateOwnershipMetadata(set: {
  ownershipType: DocumentTemplateOwnership;
  sourceTemplateSetId: string | null;
  sourceTemplateVersionId: string | null;
  upgradeCompatible: boolean;
  restorable: boolean;
  editable: boolean;
}, versions: Array<{ version: number; status: DocumentTemplateVersionStatus; publishedAt: Date | null; publishedById: string | null }>): TemplateOwnershipMetadata {
  const published = versions.filter((version) => version.status === DocumentTemplateVersionStatus.PUBLISHED).sort((a, b) => b.version - a.version)[0] || null;
  const draft = versions.filter((version) => version.status === DocumentTemplateVersionStatus.DRAFT).sort((a, b) => b.version - a.version)[0] || null;
  const current = [...versions].sort((a, b) => b.version - a.version)[0] || null;
  return {
    ownershipType: set.ownershipType,
    ownerLabel: ownerLabel(set.ownershipType),
    sourceTemplateSetId: set.sourceTemplateSetId,
    sourceTemplateVersionId: set.sourceTemplateVersionId,
    currentVersion: current?.version ?? null,
    currentPublishedVersion: published?.version ?? null,
    draftVersion: draft?.version ?? null,
    publishedAt: published?.publishedAt ?? null,
    publishedById: published?.publishedById ?? null,
    status: draft ? DocumentTemplateVersionStatus.DRAFT : published?.status ?? null,
    upgradeCompatible: set.upgradeCompatible,
    restorable: set.restorable,
    editable: set.editable && set.ownershipType !== DocumentTemplateOwnership.CERTIFIED,
  };
}

async function getCertifiedVersion(certifiedVersionId: string) {
  const version = await platformPrisma.documentTemplateVersion.findFirst({
    where: {
      id: certifiedVersionId,
      tenantId: CERTIFIED_TEMPLATE_TENANT_ID,
      ownershipType: DocumentTemplateOwnership.CERTIFIED,
      status: DocumentTemplateVersionStatus.PUBLISHED,
      templateSet: { tenantId: CERTIFIED_TEMPLATE_TENANT_ID, ownershipType: DocumentTemplateOwnership.CERTIFIED, active: true },
    },
    include: { templateSet: true },
  });
  if (!version) throw new Error("Certified template version was not found or is not published.");
  return version;
}

export async function cloneCertifiedTemplateForTenant(args: { tenantId: string; definitionId: string; certifiedVersionId: string; createdById: string }) {
  const [definition, source] = await Promise.all([
    platformPrisma.documentDefinition.findFirst({ where: { id: args.definitionId, tenantId: args.tenantId }, select: { id: true, tenantId: true, displayName: true } }),
    getCertifiedVersion(args.certifiedVersionId),
  ]);
  if (!definition) throw new Error("Document definition was not found for the authenticated tenant.");
  const existing = await platformPrisma.documentTemplateSet.findFirst({ where: { tenantId: args.tenantId, definitionId: args.definitionId, sourceTemplateSetId: source.templateSetId, ownershipType: DocumentTemplateOwnership.TENANT }, include: { versions: true } });
  if (existing) return { created: false, set: existing };
  return platformPrisma.$transaction(async (tx) => {
    const set = await tx.documentTemplateSet.create({ data: { tenantId: args.tenantId, definitionId: args.definitionId, name: `${definition.displayName} Template`, description: "Tenant working copy of an HOAHub certified template.", active: true, ownershipType: DocumentTemplateOwnership.TENANT, sourceTemplateSetId: source.templateSetId, sourceTemplateVersionId: source.id, upgradeCompatible: true, restorable: true, editable: true, createdById: args.createdById, updatedById: args.createdById } });
    const version = await tx.documentTemplateVersion.create({ data: { tenantId: args.tenantId, templateSetId: set.id, version: 1, status: DocumentTemplateVersionStatus.DRAFT, ownershipType: DocumentTemplateOwnership.TENANT, schemaVersion: source.schemaVersion, definitionJson: source.definitionJson ?? asJson({}), previewMetadata: asJson({ clonedFromCertified: true, certifiedTemplateSetId: source.templateSetId, certifiedVersionId: source.id }), createdById: args.createdById, sourceVersionId: source.id, cloneSourceVersion: source.version, clonedAt: new Date(), upgradeCompatible: true, restorable: true } });
    await tx.auditLog.create({ data: { tenantId: args.tenantId, actorId: args.createdById, module: "DOCUMENTS", action: "CLONE_CERTIFIED_TEMPLATE", entityType: "DocumentTemplateSet", entityId: set.id, metadata: { sourceTemplateSetId: source.templateSetId, sourceVersionId: source.id, sourceVersion: source.version, definitionId: args.definitionId, draftVersionId: version.id } } });
    return { created: true, set: { ...set, versions: [version] } };
  });
}

export async function createCustomTemplateSet(args: { tenantId: string; definitionId: string; name: string; createdById: string; description?: string | null }) {
  const definition = await platformPrisma.documentDefinition.findFirst({ where: { id: args.definitionId, tenantId: args.tenantId }, select: { id: true } });
  if (!definition) throw new Error("Document definition was not found for the authenticated tenant.");
  const set = await platformPrisma.documentTemplateSet.create({ data: { tenantId: args.tenantId, definitionId: args.definitionId, name: args.name.trim(), description: args.description?.trim() || null, active: true, ownershipType: DocumentTemplateOwnership.CUSTOM, upgradeCompatible: false, restorable: true, editable: true, createdById: args.createdById, updatedById: args.createdById } });
  await platformPrisma.auditLog.create({ data: { tenantId: args.tenantId, actorId: args.createdById, module: "DOCUMENTS", action: "CREATE_CUSTOM_TEMPLATE_SET", entityType: "DocumentTemplateSet", entityId: set.id, metadata: { definitionId: args.definitionId, name: set.name } } });
  return set;
}

export async function restoreTenantTemplateFromCertified(args: { tenantId: string; templateSetId: string; certifiedVersionId: string; createdById: string }) {
  const [set, source] = await Promise.all([
    platformPrisma.documentTemplateSet.findFirst({ where: { id: args.templateSetId, tenantId: args.tenantId, ownershipType: { in: [DocumentTemplateOwnership.TENANT, DocumentTemplateOwnership.CUSTOM] }, active: true }, include: { versions: true } }),
    getCertifiedVersion(args.certifiedVersionId),
  ]);
  if (!set) throw new Error("Tenant template set was not found for the authenticated tenant.");
  if (!set.restorable) throw new Error("This template is not configured for restoration.");
  const maxVersion = Math.max(0, ...set.versions.map((version) => version.version));
  const backup = set.versions.filter((version) => version.status === DocumentTemplateVersionStatus.PUBLISHED).sort((a, b) => b.version - a.version)[0] || null;
  return platformPrisma.$transaction(async (tx) => {
    const draft = await tx.documentTemplateVersion.create({ data: { tenantId: args.tenantId, templateSetId: set.id, version: maxVersion + 1, status: DocumentTemplateVersionStatus.DRAFT, ownershipType: set.ownershipType, schemaVersion: source.schemaVersion, definitionJson: source.definitionJson ?? asJson({}), previewMetadata: asJson({ restoredFromCertified: true, certifiedTemplateSetId: source.templateSetId, certifiedVersionId: source.id, backupPublishedVersionId: backup?.id ?? null, backupPublishedVersion: backup?.version ?? null }), createdById: args.createdById, sourceVersionId: source.id, cloneSourceVersion: source.version, clonedAt: new Date(), upgradeCompatible: set.upgradeCompatible, restorable: set.restorable } });
    await tx.documentTemplateSet.update({ where: { id: set.id }, data: { sourceTemplateSetId: source.templateSetId, sourceTemplateVersionId: source.id, updatedById: args.createdById } });
    await tx.auditLog.create({ data: { tenantId: args.tenantId, actorId: args.createdById, module: "DOCUMENTS", action: "RESTORE_TEMPLATE_FROM_CERTIFIED", entityType: "DocumentTemplateSet", entityId: set.id, metadata: { certifiedTemplateSetId: source.templateSetId, certifiedVersionId: source.id, backupPublishedVersionId: backup?.id ?? null, draftVersionId: draft.id } } });
    return draft;
  });
}

export function assertEditableTemplateOwnership(ownershipType: DocumentTemplateOwnership) {
  if (ownershipType === DocumentTemplateOwnership.CERTIFIED) throw new Error("HOAHub certified templates are read-only. Clone the template before editing.");
}

export function assertTenantTemplateOwnership(tenantId: string, templateTenantId: string) {
  if (tenantId !== templateTenantId) throw new Error("Template does not belong to the authenticated tenant.");
}
