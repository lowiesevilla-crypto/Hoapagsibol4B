import fs from "node:fs/promises";
import { DocumentTemplateOwnership, DocumentTemplateVersionStatus, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function assertCondition(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

async function main() {
  const [sets, versions, legacyTemplates, documentVersions, ownershipService, schema] = await Promise.all([
    prisma.documentTemplateSet.findMany({ include: { versions: true } }),
    prisma.documentTemplateVersion.findMany({ include: { templateSet: true } }),
    prisma.documentTemplate.findMany({ select: { id: true, tenantId: true, ownershipType: true, editable: true, version: true } }),
    prisma.documentVersion.findMany({ select: { id: true, requestId: true, documentNumber: true, generatedContent: true } }),
    fs.readFile("lib/services/document-template-ownership.ts", "utf8"),
    fs.readFile("prisma/schema.prisma", "utf8"),
  ]);
  for (const set of sets) {
    assertCondition(set.editable === (set.ownershipType !== DocumentTemplateOwnership.CERTIFIED), `certified set ${set.id} must be read-only`);
    for (const version of set.versions) assertCondition(version.ownershipType === set.ownershipType, `version ownership mismatch for set ${set.id}`);
    if (set.sourceTemplateSetId || set.sourceTemplateVersionId) {
      assertCondition(set.ownershipType !== DocumentTemplateOwnership.CERTIFIED, `certified set ${set.id} cannot have a source template`);
    }
  }
  for (const template of legacyTemplates) {
    assertCondition(template.editable === (template.ownershipType !== DocumentTemplateOwnership.CERTIFIED), `legacy certified template ${template.id} must be read-only`);
  }
  for (const version of versions) {
    assertCondition(version.templateSet.tenantId === version.tenantId, `template version ${version.id} crosses tenant scope`);
    if (version.ownershipType === DocumentTemplateOwnership.CERTIFIED) assertCondition(version.status !== DocumentTemplateVersionStatus.DRAFT, `certified version ${version.id} cannot be a draft`);
    if (version.sourceVersionId) {
      const source = await prisma.documentTemplateVersion.findUnique({ where: { id: version.sourceVersionId }, select: { tenantId: true, templateSetId: true, ownershipType: true, status: true } });
      assertCondition(Boolean(source), `clone source ${version.sourceVersionId} was not found`);
      if (source?.ownershipType === DocumentTemplateOwnership.CERTIFIED) {
        assertCondition(source.status === DocumentTemplateVersionStatus.PUBLISHED, `certified clone source ${version.sourceVersionId} is not published`);
      } else {
        assertCondition(source?.tenantId === version.tenantId && source.templateSetId === version.templateSetId && source.ownershipType === version.ownershipType, `tenant draft source ${version.sourceVersionId} crosses tenant/template ownership`);
      }
    }
  }
  assertCondition(documentVersions.every((version) => Boolean(version.id && version.requestId && version.documentNumber)), "historical document version identity is incomplete");
  assertCondition(ownershipService.includes("cloneCertifiedTemplateForTenant") && ownershipService.includes("restoreTenantTemplateFromCertified") && ownershipService.includes("createCustomTemplateSet"), "ownership foundation service is incomplete");
  assertCondition(schema.includes("enum DocumentTemplateOwnership") && schema.includes("sourceTemplateVersionId") && schema.includes("sourceVersionId"), "ownership schema metadata is incomplete");
  console.log(`PASS: certified template foundation verified ${sets.length} template sets, ${versions.length} versions, ${legacyTemplates.length} legacy templates, tenant ownership, source lineage, certified immutability, and historical document references.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
