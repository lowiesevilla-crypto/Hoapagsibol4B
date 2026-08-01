import { DocumentTemplateVersionStatus, Prisma, PrismaClient } from "@prisma/client";

import {
  type ApprovedPassTemplatePackage,
  approvedInstallMetadata,
  assertProductionGuards,
  hashTemplateDefinition,
  loadApprovedPackages,
  loadOptionalEnvFile,
  type TargetPassTemplate,
  targetTenantId,
} from "@/scripts/pass-template-packages";

loadOptionalEnvFile();
assertProductionGuards();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dryRun = !apply || args.includes("--dry-run");
const prisma = new PrismaClient();

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
type InstallPlan = Awaited<ReturnType<typeof buildPlan>> & {
  item: { target: TargetPassTemplate; pkg: ApprovedPassTemplatePackage };
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function statusMessage(value: string) {
  console.log(value);
}

async function main() {
  if (apply && args.includes("--dry-run")) throw new Error("Use only one mode: --dry-run or --apply.");
  statusMessage(dryRun ? "DRY RUN ONLY - no records will be created." : "APPLY MODE - creating approved Draft template versions only.");

  const packages = loadApprovedPackages();
  const tenant = await prisma.tenant.findUnique({ where: { id: targetTenantId }, select: { id: true } });
  if (!tenant) throw new Error("Target tenant does not exist.");

  const planned: InstallPlan[] = [];
  for (const item of packages) {
    const plan = await buildPlan(prisma, item.target, item.pkg);
    planned.push({ ...plan, item });
  }

  const blockingDraft = planned.find((plan) => plan.action === "EXISTING_PRODUCTION_DRAFT_REQUIRES_REVIEW");
  if (blockingDraft) {
    console.log(JSON.stringify(planned.map(sanitizePlan), null, 2));
    throw new Error("EXISTING PRODUCTION DRAFT REQUIRES REVIEW");
  }

  console.log(JSON.stringify(planned.map(sanitizePlan), null, 2));
  if (dryRun) return;

  await prisma.$transaction(async (tx) => {
    for (const plan of planned) {
      if (plan.action !== "CREATE_DRAFT") continue;
      const refreshed = await buildPlan(tx as Tx, plan.item.target, plan.item.pkg);
      if (refreshed.action !== "CREATE_DRAFT") throw new Error(`Production state changed before creating ${plan.item.target.label}.`);
      await tx.documentTemplateVersion.create({
        data: {
          tenantId: targetTenantId,
          templateSetId: refreshed.templateSetId,
          version: refreshed.nextVersion,
          status: DocumentTemplateVersionStatus.DRAFT,
          ownershipType: refreshed.ownershipType,
          schemaVersion: 2,
          definitionJson: asJson(plan.item.pkg.definition),
          previewMetadata: asJson(approvedInstallMetadata(plan.item.pkg)),
          publishedAt: null,
          publishedById: null,
          createdById: null,
          sourceVersionId: refreshed.assignedTemplateVersionId,
          cloneSourceVersion: refreshed.assignedVersionNumber,
          clonedAt: new Date(),
          upgradeCompatible: true,
          restorable: true,
        },
      });
    }
  });
  statusMessage("Approved pass template Draft installation completed. Existing published assignments were not changed.");
}

async function buildPlan(client: Tx | PrismaClient, target: TargetPassTemplate, pkg: ApprovedPassTemplatePackage) {
  const definition = await client.documentDefinition.findFirst({
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
        },
      },
      templateSets: {
        select: {
          id: true,
          definitionId: true,
          editable: true,
          ownershipType: true,
          versions: {
            select: {
              id: true,
              version: true,
              status: true,
              definitionJson: true,
              templateSetId: true,
            },
          },
        },
      },
    },
  });
  if (!definition) throw new Error(`${target.label} definition does not belong to ${targetTenantId}.`);
  if (!definition.assignedTemplateVersionId || !definition.assignedTemplateVersion) {
    throw new Error(`PRODUCTION TEMPLATE STATE CHANGED: ${target.label} has no assigned template version.`);
  }
  const assigned = definition.assignedTemplateVersion;
  if (assigned.status !== DocumentTemplateVersionStatus.PUBLISHED) {
    throw new Error(`PRODUCTION TEMPLATE STATE CHANGED: ${target.label} assigned version is not PUBLISHED.`);
  }
  if (assigned.version !== target.expectedAssignedVersion) {
    throw new Error(`PRODUCTION TEMPLATE STATE CHANGED: ${target.label} assigned published version is v${assigned.version}, expected v${target.expectedAssignedVersion}.`);
  }
  const templateSet = definition.templateSets.find((set) => set.id === assigned.templateSetId);
  if (!templateSet || templateSet.definitionId !== target.definitionId) {
    throw new Error(`PRODUCTION TEMPLATE STATE CHANGED: ${target.label} assigned template set is not tied to the expected definition.`);
  }
  if (!templateSet.editable) throw new Error(`PRODUCTION TEMPLATE STATE CHANGED: ${target.label} template set is not editable.`);

  const versionSummaries = templateSet.versions.map((version) => ({
    id: version.id,
    version: version.version,
    status: version.status,
    contentHash: hashTemplateDefinition(version.definitionJson),
    matchesApprovedPackage: hashTemplateDefinition(version.definitionJson) === pkg.contentHash,
  }));
  const drafts = versionSummaries.filter((version) => version.status === DocumentTemplateVersionStatus.DRAFT);
  const exactDraft = drafts.find((version) => version.matchesApprovedPackage);
  const differentDraft = drafts.find((version) => !version.matchesApprovedPackage);
  const alreadyPresent = versionSummaries.find((version) => version.matchesApprovedPackage);
  const maxVersion = versionSummaries.reduce((max, version) => Math.max(max, version.version), 0);

  if (differentDraft) {
    return {
      target: target.label,
      action: "EXISTING_PRODUCTION_DRAFT_REQUIRES_REVIEW" as const,
      definitionId: target.definitionId,
      assignedTemplateVersionId: assigned.id,
      assignedVersionNumber: assigned.version,
      templateSetId: templateSet.id,
      ownershipType: templateSet.ownershipType,
      existingDraftVersionId: differentDraft.id,
      nextVersion: maxVersion + 1,
      approvedPackageContentHash: pkg.contentHash,
    };
  }
  if (exactDraft || alreadyPresent) {
    return {
      target: target.label,
      action: "ALREADY_INSTALLED" as const,
      definitionId: target.definitionId,
      assignedTemplateVersionId: assigned.id,
      assignedVersionNumber: assigned.version,
      templateSetId: templateSet.id,
      ownershipType: templateSet.ownershipType,
      existingVersionId: (exactDraft ?? alreadyPresent)?.id,
      nextVersion: maxVersion + 1,
      approvedPackageContentHash: pkg.contentHash,
    };
  }
  return {
    target: target.label,
    action: "CREATE_DRAFT" as const,
    definitionId: target.definitionId,
    assignedTemplateVersionId: assigned.id,
    assignedVersionNumber: assigned.version,
    templateSetId: templateSet.id,
    ownershipType: templateSet.ownershipType,
    nextVersion: maxVersion + 1,
    approvedPackageContentHash: pkg.contentHash,
  };
}

function sanitizePlan(plan: Awaited<ReturnType<typeof buildPlan>> & { item?: unknown }) {
  const { item: _item, ...safe } = plan;
  return safe;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
