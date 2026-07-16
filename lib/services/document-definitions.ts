import "server-only";

import { DocumentTemplateVersionStatus, type DocumentType, type Prisma } from "@prisma/client";
import { platformPrisma } from "@/lib/db";

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
