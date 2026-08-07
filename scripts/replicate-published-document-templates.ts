import {
  DocumentTemplateOwnership,
  DocumentTemplateVersionStatus,
  DocumentType,
  Prisma,
  PrismaClient,
  Role,
} from "@prisma/client";

import {
  allowedDocumentPlaceholders,
  validateTemplateDefinition,
} from "@/lib/services/document-template-builder";
import {
  expectedDatabaseHost,
  expectedDatabaseName,
  hashTemplateDefinition,
  loadOptionalEnvFile,
  parseDatabaseUrl,
} from "@/scripts/pass-template-packages";

const SOURCE_TENANT_ID = "tenant_pagsibol4b_default";
const TARGET_TENANT_ID = "cmrpruwma00063lnps4g7c335";
const CONFIRMATION_ENV = "CONFIRM_HOSTINGER_TEMPLATE_REPLICATION";
const ACTOR_ENV = "CONFIRM_TEMPLATE_REPLICATION_ACTOR_USER_ID";

const requestedTemplates = [
  { type: DocumentType.GATE_PASS, sourceVersion: 1 },
  { type: DocumentType.MOVE_IN_OUT_PASS, sourceVersion: 1 },
  { type: DocumentType.CERTIFICATE_OF_RESIDENCY, sourceVersion: 2 },
] as const;

const args = process.argv.slice(2);
loadOptionalEnvFile(args);
assertProductionGuards();

const apply = args.includes("--apply");
const explicitDryRun = args.includes("--dry-run");
const confirmDigest = args.find((argument) => argument.startsWith("--confirm-digest="))?.slice("--confirm-digest=".length).trim() || null;
const prisma = new PrismaClient();

type ReplicationClient = Pick<
  Prisma.TransactionClient,
  "tenant" | "user" | "documentDefinition" | "documentTemplateVersion" | "auditLog"
>;

type RequestedTemplate = (typeof requestedTemplates)[number];

type ReplicationAction =
  | "ALREADY_ASSIGNED"
  | "ASSIGN_EXISTING_PUBLISHED"
  | "CREATE_PUBLISHED_AND_ASSIGN";

type ReplicationPlan = {
  type: DocumentType;
  requestedSourceVersion: number;
  action: ReplicationAction;
  sourceDefinitionId: string;
  sourceTemplateSetId: string;
  sourceVersionId: string;
  sourceSchemaVersion: number;
  sourceContentHash: string;
  sourceDefinitionJson: Prisma.JsonValue;
  targetDefinitionId: string;
  targetDefinitionName: string;
  targetAssignedTemplateVersionId: string;
  targetAssignedVersion: number;
  targetAssignedContentHash: string;
  targetTemplateSetId: string;
  targetTemplateSetOwnership: DocumentTemplateOwnership;
  targetTemplateSetEditable: boolean;
  targetTemplateSetUpgradeCompatible: boolean;
  targetTemplateSetRestorable: boolean;
  nextTargetVersion: number;
  matchingPublishedTargetVersionId: string | null;
  matchingPublishedTargetVersion: number | null;
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function assertProductionGuards() {
  if (process.platform === "win32") {
    throw new Error("Refusing to run production template replication from the local Windows development environment.");
  }
  if (process.env[CONFIRMATION_ENV] !== "YES") {
    throw new Error(`${CONFIRMATION_ENV}=YES is required.`);
  }
  if (process.env.CONFIRM_SOURCE_TENANT_ID !== SOURCE_TENANT_ID) {
    throw new Error(`CONFIRM_SOURCE_TENANT_ID=${SOURCE_TENANT_ID} is required.`);
  }
  if (process.env.CONFIRM_TARGET_TENANT_ID !== TARGET_TENANT_ID) {
    throw new Error(`CONFIRM_TARGET_TENANT_ID=${TARGET_TENANT_ID} is required.`);
  }
  if (!process.env[ACTOR_ENV]?.trim()) {
    throw new Error(`${ACTOR_ENV}=<target-system-admin-user-id> is required.`);
  }
  if (process.env.EXPECTED_DATABASE_HOST !== expectedDatabaseHost) {
    throw new Error(`EXPECTED_DATABASE_HOST=${expectedDatabaseHost} is required.`);
  }
  if (process.env.EXPECTED_DATABASE_NAME !== expectedDatabaseName) {
    throw new Error(`EXPECTED_DATABASE_NAME=${expectedDatabaseName} is required.`);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Production DATABASE_URL is unavailable.");
  const parsed = parseDatabaseUrl(databaseUrl);
  if (parsed.protocol !== "mysql:") throw new Error("DATABASE_URL must use mysql://.");
  if (parsed.host === "localhost" || parsed.host === "::1") {
    throw new Error("DATABASE_URL host must not be localhost or ::1.");
  }
  if (parsed.host !== expectedDatabaseHost) {
    throw new Error("DATABASE_URL host does not match EXPECTED_DATABASE_HOST.");
  }
  if (parsed.database === "hoahub_prodclone_local" || parsed.database === "hoa_portal") {
    throw new Error("Refusing to run against a non-production database.");
  }
  if (parsed.database !== expectedDatabaseName) {
    throw new Error("DATABASE_URL database does not match EXPECTED_DATABASE_NAME.");
  }
  if (SOURCE_TENANT_ID === TARGET_TENANT_ID) {
    throw new Error("Source and target tenant IDs must be different.");
  }
}

async function assertAuthorizedActor(client: ReplicationClient, actorUserId: string) {
  const actor = await client.user.findFirst({
    where: {
      id: actorUserId,
      tenantId: TARGET_TENANT_ID,
      active: true,
      role: { in: [Role.SYSTEM_ADMIN, Role.SUPER_ADMIN] },
    },
    select: { id: true, role: true },
  });
  if (!actor) {
    throw new Error(
      `${ACTOR_ENV} must identify an active SYSTEM_ADMIN or SUPER_ADMIN belonging to ${TARGET_TENANT_ID}.`,
    );
  }
  return actor;
}

async function readTenantContext(client: ReplicationClient) {
  const [sourceTenant, targetTenant] = await Promise.all([
    client.tenant.findUnique({
      where: { id: SOURCE_TENANT_ID },
      select: { id: true, name: true, shortName: true, address: true, email: true },
    }),
    client.tenant.findUnique({
      where: { id: TARGET_TENANT_ID },
      select: { id: true, name: true },
    }),
  ]);
  if (!sourceTenant) throw new Error(`Source tenant ${SOURCE_TENANT_ID} does not exist.`);
  if (!targetTenant) throw new Error(`Target tenant ${TARGET_TENANT_ID} does not exist.`);
  return { sourceTenant, targetTenant };
}

function sourceTenantIdentifiers(sourceTenant: {
  id: string;
  name: string;
  shortName: string;
  address: string | null;
  email: string | null;
}) {
  return [sourceTenant.id, sourceTenant.name, sourceTenant.shortName, sourceTenant.address, sourceTenant.email]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value && value.length >= 4));
}

function assertTenantNeutralTemplate(definitionJson: Prisma.JsonValue, identifiers: string[], label: string) {
  const serialized = JSON.stringify(definitionJson).toLocaleLowerCase();
  const hardcodedIdentifier = identifiers.find((identifier) => serialized.includes(identifier.toLocaleLowerCase()));
  if (hardcodedIdentifier) {
    throw new Error(
      `${label} contains a hardcoded source-tenant identifier (${JSON.stringify(hardcodedIdentifier)}). ` +
        "Replication is blocked to prevent tenant-specific content leakage; replace it with tenant placeholders first.",
    );
  }
}

function assertValidTemplateDefinition(definitionJson: Prisma.JsonValue, label: string) {
  const validation = validateTemplateDefinition(definitionJson, {
    allowedPlaceholders: new Set(allowedDocumentPlaceholders),
  });
  if (!validation.valid) {
    throw new Error(`${label} source template is invalid: ${validation.errors.join("; ")}`);
  }
}

async function buildPlan(
  client: ReplicationClient,
  spec: RequestedTemplate,
  sourceIdentifiers: string[],
): Promise<ReplicationPlan> {
  const sourceDefinition = await client.documentDefinition.findFirst({
    where: { tenantId: SOURCE_TENANT_ID, legacyType: spec.type },
    select: {
      id: true,
      displayName: true,
      assignedTemplateVersionId: true,
      assignedTemplateVersion: { select: { templateSetId: true } },
    },
  });
  if (!sourceDefinition) {
    throw new Error(`${spec.type} definition does not exist for source tenant ${SOURCE_TENANT_ID}.`);
  }
  if (!sourceDefinition.assignedTemplateVersionId || !sourceDefinition.assignedTemplateVersion) {
    throw new Error(`${spec.type} source definition has no assigned template set to anchor version lookup.`);
  }

  const sourceVersion = await client.documentTemplateVersion.findFirst({
    where: {
      tenantId: SOURCE_TENANT_ID,
      templateSetId: sourceDefinition.assignedTemplateVersion.templateSetId,
      version: spec.sourceVersion,
      status: DocumentTemplateVersionStatus.PUBLISHED,
    },
    select: {
      id: true,
      templateSetId: true,
      version: true,
      status: true,
      schemaVersion: true,
      definitionJson: true,
      publishedAt: true,
    },
  });
  if (!sourceVersion) {
    throw new Error(
      `${spec.type} v${spec.sourceVersion} is not PUBLISHED in the source definition's assigned template set.`,
    );
  }
  if (!sourceVersion.publishedAt) {
    throw new Error(`${spec.type} v${spec.sourceVersion} is marked PUBLISHED but has no publishedAt timestamp.`);
  }
  if (sourceVersion.definitionJson == null) {
    throw new Error(`${spec.type} v${spec.sourceVersion} has no template definition payload.`);
  }

  assertValidTemplateDefinition(sourceVersion.definitionJson, `${spec.type} v${spec.sourceVersion}`);
  assertTenantNeutralTemplate(sourceVersion.definitionJson, sourceIdentifiers, `${spec.type} v${spec.sourceVersion}`);
  const sourceContentHash = hashTemplateDefinition(sourceVersion.definitionJson);

  const targetDefinition = await client.documentDefinition.findFirst({
    where: { tenantId: TARGET_TENANT_ID, legacyType: spec.type },
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
          upgradeCompatible: true,
          restorable: true,
          versions: {
            select: {
              id: true,
              version: true,
              status: true,
              definitionJson: true,
            },
          },
        },
      },
    },
  });
  if (!targetDefinition) {
    throw new Error(`${spec.type} definition does not exist for target tenant ${TARGET_TENANT_ID}.`);
  }
  if (!targetDefinition.assignedTemplateVersionId || !targetDefinition.assignedTemplateVersion) {
    throw new Error(`${spec.type} target definition has no assigned template version; refusing to guess a target template set.`);
  }
  const targetAssigned = targetDefinition.assignedTemplateVersion;
  if (targetAssigned.status !== DocumentTemplateVersionStatus.PUBLISHED) {
    throw new Error(`${spec.type} target assigned template is not PUBLISHED.`);
  }
  if (targetAssigned.definitionJson == null) {
    throw new Error(`${spec.type} target assigned template has no definition payload.`);
  }
  const targetSet = targetDefinition.templateSets.find((set) => set.id === targetAssigned.templateSetId);
  if (!targetSet || targetSet.definitionId !== targetDefinition.id) {
    throw new Error(`${spec.type} target assigned template set does not belong to the target definition.`);
  }

  const targetAssignedContentHash = hashTemplateDefinition(targetAssigned.definitionJson);
  const maxTargetVersion = targetSet.versions.reduce((max, version) => Math.max(max, version.version), 0);
  const matchingPublished = targetSet.versions.find(
    (version) =>
      version.status === DocumentTemplateVersionStatus.PUBLISHED &&
      version.definitionJson != null &&
      hashTemplateDefinition(version.definitionJson) === sourceContentHash,
  );
  const matchingDraft = targetSet.versions.find(
    (version) =>
      version.status === DocumentTemplateVersionStatus.DRAFT &&
      version.definitionJson != null &&
      hashTemplateDefinition(version.definitionJson) === sourceContentHash,
  );

  let action: ReplicationAction;
  if (targetAssignedContentHash === sourceContentHash) {
    action = "ALREADY_ASSIGNED";
  } else if (matchingPublished) {
    action = "ASSIGN_EXISTING_PUBLISHED";
  } else {
    if (matchingDraft) {
      throw new Error(
        `${spec.type} already has an unreviewed target DRAFT (v${matchingDraft.version}) matching the requested source content. ` +
          "Refusing to publish or bypass an existing Draft automatically.",
      );
    }
    if (!targetSet.editable || targetSet.ownershipType === DocumentTemplateOwnership.CERTIFIED) {
      throw new Error(`${spec.type} target template set is read-only; clone it to a tenant-owned editable set before replication.`);
    }
    action = "CREATE_PUBLISHED_AND_ASSIGN";
  }

  return {
    type: spec.type,
    requestedSourceVersion: spec.sourceVersion,
    action,
    sourceDefinitionId: sourceDefinition.id,
    sourceTemplateSetId: sourceVersion.templateSetId,
    sourceVersionId: sourceVersion.id,
    sourceSchemaVersion: sourceVersion.schemaVersion,
    sourceContentHash,
    sourceDefinitionJson: sourceVersion.definitionJson,
    targetDefinitionId: targetDefinition.id,
    targetDefinitionName: targetDefinition.displayName,
    targetAssignedTemplateVersionId: targetAssigned.id,
    targetAssignedVersion: targetAssigned.version,
    targetAssignedContentHash,
    targetTemplateSetId: targetSet.id,
    targetTemplateSetOwnership: targetSet.ownershipType,
    targetTemplateSetEditable: targetSet.editable,
    targetTemplateSetUpgradeCompatible: targetSet.upgradeCompatible,
    targetTemplateSetRestorable: targetSet.restorable,
    nextTargetVersion: maxTargetVersion + 1,
    matchingPublishedTargetVersionId: matchingPublished?.id ?? null,
    matchingPublishedTargetVersion: matchingPublished?.version ?? null,
  };
}

function sanitizePlan(plan: ReplicationPlan) {
  const { sourceDefinitionJson: _sourceDefinitionJson, ...safe } = plan;
  return safe;
}

function planDigest(actorUserId: string, plans: ReplicationPlan[]) {
  return hashTemplateDefinition({
    operation: "replicate-published-document-templates",
    sourceTenantId: SOURCE_TENANT_ID,
    targetTenantId: TARGET_TENANT_ID,
    actorUserId,
    plans: plans.map((plan) => sanitizePlan(plan)),
  });
}

async function buildPlans(client: ReplicationClient, sourceIdentifiers: string[]) {
  const plans: ReplicationPlan[] = [];
  for (const spec of requestedTemplates) {
    plans.push(await buildPlan(client, spec, sourceIdentifiers));
  }
  return plans;
}

async function assignVersion(
  tx: Prisma.TransactionClient,
  plan: ReplicationPlan,
  newVersionId: string,
) {
  const updated = await tx.documentDefinition.updateMany({
    where: {
      id: plan.targetDefinitionId,
      tenantId: TARGET_TENANT_ID,
      assignedTemplateVersionId: plan.targetAssignedTemplateVersionId,
    },
    data: { assignedTemplateVersionId: newVersionId },
  });
  if (updated.count !== 1) {
    throw new Error(`${plan.type} target assignment changed concurrently; transaction aborted.`);
  }
}

async function applyPlan(
  tx: Prisma.TransactionClient,
  plan: ReplicationPlan,
  actorUserId: string,
) {
  if (plan.action === "ALREADY_ASSIGNED") {
    return {
      type: plan.type,
      action: plan.action,
      assignedVersionId: plan.targetAssignedTemplateVersionId,
      assignedVersion: plan.targetAssignedVersion,
    };
  }

  let assignedVersionId: string;
  let assignedVersion: number;

  if (plan.action === "ASSIGN_EXISTING_PUBLISHED") {
    if (!plan.matchingPublishedTargetVersionId || plan.matchingPublishedTargetVersion == null) {
      throw new Error(`${plan.type} plan is missing the existing published target version.`);
    }
    assignedVersionId = plan.matchingPublishedTargetVersionId;
    assignedVersion = plan.matchingPublishedTargetVersion;
  } else {
    const created = await tx.documentTemplateVersion.create({
      data: {
        tenantId: TARGET_TENANT_ID,
        templateSetId: plan.targetTemplateSetId,
        version: plan.nextTargetVersion,
        status: DocumentTemplateVersionStatus.PUBLISHED,
        ownershipType: plan.targetTemplateSetOwnership,
        schemaVersion: plan.sourceSchemaVersion,
        definitionJson: asJson(plan.sourceDefinitionJson),
        previewMetadata: asJson({
          publishedTemplateReplication: {
            sourceTenantId: SOURCE_TENANT_ID,
            sourceDefinitionId: plan.sourceDefinitionId,
            sourceTemplateSetId: plan.sourceTemplateSetId,
            sourceVersionId: plan.sourceVersionId,
            sourceVersion: plan.requestedSourceVersion,
            sourceContentHash: plan.sourceContentHash,
            replicatedBy: "scripts/replicate-published-document-templates.ts",
          },
        }),
        publishedAt: new Date(),
        publishedById: actorUserId,
        createdById: actorUserId,
        cloneSourceVersion: plan.requestedSourceVersion,
        clonedAt: new Date(),
        upgradeCompatible: plan.targetTemplateSetUpgradeCompatible,
        restorable: plan.targetTemplateSetRestorable,
      },
      select: { id: true, version: true },
    });
    assignedVersionId = created.id;
    assignedVersion = created.version;
  }

  await assignVersion(tx, plan, assignedVersionId);
  await tx.auditLog.create({
    data: {
      tenantId: TARGET_TENANT_ID,
      actorId: actorUserId,
      module: "DOCUMENTS",
      action: "REPLICATE_PUBLISHED_DOCUMENT_TEMPLATE",
      entityType: "DocumentDefinition",
      entityId: plan.targetDefinitionId,
      metadata: asJson({
        sourceTenantId: SOURCE_TENANT_ID,
        targetTenantId: TARGET_TENANT_ID,
        documentType: plan.type,
        requestedSourceVersion: plan.requestedSourceVersion,
        sourceVersionId: plan.sourceVersionId,
        sourceContentHash: plan.sourceContentHash,
        previousAssignedVersionId: plan.targetAssignedTemplateVersionId,
        previousAssignedVersion: plan.targetAssignedVersion,
        assignedVersionId,
        assignedVersion,
        replicationAction: plan.action,
        timestamp: new Date().toISOString(),
      }),
    },
  });

  return { type: plan.type, action: plan.action, assignedVersionId, assignedVersion };
}

async function main() {
  if (apply && explicitDryRun) throw new Error("Use only one mode: --dry-run or --apply.");
  if (apply && !confirmDigest) {
    throw new Error("--apply requires --confirm-digest=<digest-from-the-latest-dry-run>.");
  }

  const actorUserId = process.env[ACTOR_ENV]!.trim();
  const { sourceTenant, targetTenant } = await readTenantContext(prisma);
  const identifiers = sourceTenantIdentifiers(sourceTenant);
  const actor = await assertAuthorizedActor(prisma, actorUserId);
  const plans = await buildPlans(prisma, identifiers);
  const digest = planDigest(actorUserId, plans);

  console.log(
    JSON.stringify(
      {
        mode: apply ? "APPLY" : "DRY_RUN",
        sourceTenant: { id: sourceTenant.id, name: sourceTenant.name },
        targetTenant: { id: targetTenant.id, name: targetTenant.name },
        actor: { id: actor.id, role: actor.role },
        requestedTemplates: requestedTemplates.map((item) => ({ type: item.type, sourceVersion: item.sourceVersion })),
        planDigest: digest,
        plans: plans.map(sanitizePlan),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log(`DRY RUN ONLY. To apply this exact plan, rerun with --apply --confirm-digest=${digest}`);
    return;
  }
  if (confirmDigest !== digest) {
    throw new Error("The supplied --confirm-digest does not match the current preflight plan. Run dry-run again.");
  }

  const results = await prisma.$transaction(async (tx) => {
    await assertAuthorizedActor(tx, actorUserId);
    const transactionPlans = await buildPlans(tx, identifiers);
    const transactionDigest = planDigest(actorUserId, transactionPlans);
    if (transactionDigest !== confirmDigest) {
      throw new Error("Production template state changed after dry-run. Transaction aborted; run dry-run again.");
    }
    const applied = [];
    for (const plan of transactionPlans) applied.push(await applyPlan(tx, plan, actorUserId));
    return applied;
  });

  const verificationPlans = await buildPlans(prisma, identifiers);
  const incomplete = verificationPlans.filter((plan) => plan.action !== "ALREADY_ASSIGNED");
  if (incomplete.length) {
    throw new Error(
      `Post-apply verification failed for: ${incomplete.map((plan) => `${plan.type}:${plan.action}`).join(", ")}.`,
    );
  }

  console.log(
    JSON.stringify(
      {
        status: "COMPLETED_AND_VERIFIED",
        sourceTenantId: SOURCE_TENANT_ID,
        targetTenantId: TARGET_TENANT_ID,
        results,
        verification: verificationPlans.map(sanitizePlan),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
