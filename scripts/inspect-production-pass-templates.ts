import { PrismaClient } from "@prisma/client";

import {
  assertProductionGuards,
  hashTemplateDefinition,
  loadApprovedPackages,
  loadOptionalEnvFile,
  targetTenantId,
} from "@/scripts/pass-template-packages";

loadOptionalEnvFile();
assertProductionGuards();

const prisma = new PrismaClient();

type VersionRecord = {
  id: string;
  version: number;
  status: string;
  templateSetId: string;
  definitionJson: unknown;
  updatedAt: Date;
  publishedAt: Date | null;
};

function summarizeVersion(version: VersionRecord, approvedHash: string) {
  const contentHash = hashTemplateDefinition(version.definitionJson);
  return {
    versionId: version.id,
    versionNumber: version.version,
    status: version.status,
    templateSetId: version.templateSetId,
    publishedAt: version.publishedAt?.toISOString() ?? null,
    updatedAt: version.updatedAt.toISOString(),
    contentHash,
    matchesApprovedPackage: contentHash === approvedHash,
  };
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: targetTenantId }, select: { id: true } });
  if (!tenant) throw new Error("Target tenant does not exist.");

  const report = [];
  for (const { target, pkg } of loadApprovedPackages()) {
    const definition = await prisma.documentDefinition.findFirst({
      where: { tenantId: targetTenantId, id: target.definitionId },
      select: {
        id: true,
        displayName: true,
        assignedTemplateVersionId: true,
        assignedTemplateVersion: {
          select: {
            id: true,
            version: true,
            status: true,
            templateSetId: true,
            definitionJson: true,
            updatedAt: true,
            publishedAt: true,
          },
        },
        templateSets: {
          select: {
            id: true,
            name: true,
            editable: true,
            versions: {
              select: {
                id: true,
                version: true,
                status: true,
                templateSetId: true,
                definitionJson: true,
                updatedAt: true,
                publishedAt: true,
              },
              orderBy: { version: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!definition) throw new Error(`${target.label} definition does not exist for ${targetTenantId}.`);
    const assignedSetId = definition.assignedTemplateVersion?.templateSetId ?? null;
    const selectedSets = assignedSetId ? definition.templateSets.filter((set) => set.id === assignedSetId) : definition.templateSets;
    const versions = selectedSets.flatMap((set) => set.versions);
    const versionSummaries = versions.map((version) => summarizeVersion(version, pkg.contentHash));
    const draftExists = versionSummaries.some((version) => version.status === "DRAFT");
    const nextSafeVersion = versionSummaries.reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1;

    report.push({
      tenantId: targetTenantId,
      definitionId: definition.id,
      definitionDisplayName: definition.displayName,
      assignedTemplateVersionId: definition.assignedTemplateVersionId,
      templateSetId: assignedSetId,
      templateSetName: selectedSets.map((set) => set.name).join(", "),
      versions: versionSummaries,
      activePublishedVersion: definition.assignedTemplateVersion ? summarizeVersion(definition.assignedTemplateVersion, pkg.contentHash) : null,
      draftExists,
      nextSafeVersion,
      approvedPackageContentHash: pkg.contentHash,
      approvedPackageAlreadyPresent: versionSummaries.some((version) => version.matchesApprovedPackage),
    });
  }

  console.log(JSON.stringify({ mode: "read-only", tenantId: targetTenantId, report }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
