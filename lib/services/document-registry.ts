import "server-only";

import { DocumentDefinitionStatus, type Prisma } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { evaluateDocumentDefinitionVisibility, documentDefinitionInclude } from "@/lib/services/document-definitions";
import { defaultNumberingFormat } from "@/lib/services/document-numbering";
import { writeDocumentAudit } from "@/lib/services/document-runtime-audit";
import { assertDocumentTenant, requireDocumentPermission, type DocumentExecutionContext } from "@/lib/services/document-runtime-context";
import { resolveDocumentCapabilities } from "@/lib/services/document-capabilities";

export async function listDocumentDefinitions(context: DocumentExecutionContext, options: { search?: string; status?: DocumentDefinitionStatus; page?: number; pageSize?: number } = {}) {
  requireDocumentPermission(context, "VIEW_DEFINITIONS");
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize || 25));
  const search = options.search?.trim();
  const where: Prisma.DocumentDefinitionWhereInput = {
    tenantId: context.tenantId,
    ...(options.status ? { status: options.status } : {}),
    ...(search ? { OR: [{ code: { contains: search } }, { displayName: { contains: search } }, { description: { contains: search } }] } : {}),
  };
  const [items, total] = await Promise.all([
    platformPrisma.documentDefinition.findMany({ where, include: documentDefinitionInclude, orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
    platformPrisma.documentDefinition.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getDocumentDefinition(context: DocumentExecutionContext, input: { definitionId?: string; code?: string }) {
  requireDocumentPermission(context, "VIEW_DEFINITIONS");
  if (!input.definitionId && !input.code) throw new Error("A document definition ID or code is required.");
  const definition = await platformPrisma.documentDefinition.findFirst({ where: { tenantId: context.tenantId, ...(input.definitionId ? { id: input.definitionId } : { code: input.code }) }, include: documentDefinitionInclude });
  if (!definition) throw new Error("Document definition was not found for the authenticated tenant.");
  return definition;
}

export async function resolveEffectiveDocumentDefinition(context: DocumentExecutionContext, input: { definitionId?: string; code?: string }) {
  const definition = await getDocumentDefinition(context, input);
  return { definition, capabilities: resolveDocumentCapabilities(definition), visibility: evaluateDocumentDefinitionVisibility(definition) };
}

export async function createDocumentDefinition(context: DocumentExecutionContext, data: { code: string; displayName: string; description?: string; category?: string; systemKey?: string; numberingFormat?: string }) {
  requireDocumentPermission(context, "MANAGE_DEFINITIONS");
  const code = data.code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,80}$/.test(code)) throw new Error("Document code must contain only letters, numbers, underscores, or hyphens.");
  const existing = await platformPrisma.documentDefinition.findFirst({ where: { tenantId: context.tenantId, code }, select: { id: true } });
  if (existing) throw new Error("A document definition with this code already exists for the tenant.");
  const created = await platformPrisma.documentDefinition.create({ data: { tenantId: context.tenantId, code, displayName: data.displayName.trim(), description: data.description?.trim() || null, category: data.category?.trim() || null, systemKey: data.systemKey?.trim() || null, numberingFormat: data.numberingFormat?.trim() || defaultNumberingFormat(code), createdById: context.authenticatedUserId, updatedById: context.authenticatedUserId } });
  await writeDocumentAudit({ context, action: "CREATE_DEFINITION", entityType: "DocumentDefinition", entityId: created.id, after: { code: created.code, displayName: created.displayName } });
  return created;
}

export async function updateDocumentDefinition(context: DocumentExecutionContext, definitionId: string, data: Prisma.DocumentDefinitionUpdateInput) {
  requireDocumentPermission(context, "MANAGE_DEFINITIONS");
  const existing = await platformPrisma.documentDefinition.findFirst({ where: { tenantId: context.tenantId, id: definitionId } });
  if (!existing) throw new Error("Document definition was not found for the authenticated tenant.");
  assertDocumentTenant(context, existing.tenantId);
  const updated = await platformPrisma.documentDefinition.update({ where: { id: existing.id }, data: { ...data, updatedBy: { connect: { id: context.authenticatedUserId } }, version: { increment: 1 } } });
  await writeDocumentAudit({ context, action: "UPDATE_DEFINITION", entityType: "DocumentDefinition", entityId: updated.id, before: { version: existing.version, active: existing.active }, after: { version: updated.version, active: updated.active } });
  return updated;
}

export async function setDocumentDefinitionStatus(context: DocumentExecutionContext, definitionId: string, status: DocumentDefinitionStatus) {
  return updateDocumentDefinition(context, definitionId, { status, active: status === DocumentDefinitionStatus.ACTIVE, archivedAt: status === DocumentDefinitionStatus.ARCHIVED ? new Date() : null });
}
