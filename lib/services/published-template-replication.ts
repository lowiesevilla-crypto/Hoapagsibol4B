import { createHash } from "node:crypto";
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

export const publishedTemplateReplicationSourceTenantId = "tenant_pagsibol4b_default";
export const publishedTemplateReplicationTargetTenantId = "cmrpruwma00063lnps4g7c335";

export const publishedTemplateReplicationRequests = [
  { type: DocumentType.GATE_PASS, sourceVersion: 2 },
  { type: DocumentType.MOVE_IN_OUT_PASS, sourceVersion: 1 },
  { type: DocumentType.CERTIFICATE_OF_RESIDENCY, sourceVersion: 2 },
] as const;

const replicationAdminRoles = [Role.SYSTEM_ADMIN, Role.SUPER_ADMIN] as const;

type ReplicationClient = Pick<
  Prisma.TransactionClient,
  "tenant" | "user" | "documentDefinition" | "documentTemplateVersion" | "auditLog"
>;

type RequestedTemplate = (typeof publishedTemplateReplicationRequests)[number];

export type PublishedTemplateReplicationAction =
  | "ALREADY_ASSIGNED"
  | "ASSIGN_EXISTING_PUBLISHED"
  | "CREATE_PUBLISHED_AND_ASSIGN"
  | "BOOTSTRAP_TARGET_SET_AND_ASSIGN";

type InternalReplicationPlan = {
  type: DocumentType;
  requestedSourceVersion: number;
  action: PublishedTemplateReplicationAction;
  sourceDefinitionId: string;
  sourceTemplateSetId: string;
  sourceVersionId: string;
  sourceSchemaVersion: number;
  sourceContentHash: string;
  sourceDefinitionJson: Prisma.JsonValue;
  targetDefinitionId: string;
  targetDefinitionName: string;
  targetAssignedTemplateVersionId: string | null;
  targetAssignedVersion: number | null;
  targetAssignedContentHash: string | null;
  targetTemplateSetId: string | null;
  targetTemplateSetName: string;
  targetTemplateSetOwnership: DocumentTemplateOwnership;
  targetTemplateSetEditable: boolean;
  targetTemplateSetUpgradeCompatible: boolean;
  targetTemplateSetRestorable: boolean;
  targetTemplateSetWillBeCreated: boolean;
  nextTargetVersion: number;
  matchingPublishedTargetVersionId: string | null;
  matchingPublishedTargetVersion: number | null;
};

export type PublishedTemplateReplicationPlan = Omit<InternalReplicationPlan, "sourceDefinitionJson">;

export type PublishedTemplateReplicationPreview = {
  sourceTenant: { id: string; name: string };
  targetTenant: { id: string; name: string };
  actor: { id: string; role: Role; roles: Role[] };
  requestedTemplates: Array<{ type: DocumentType; sourceVersion: number }>;
  planDigest: string;
  plans: PublishedTemplateReplicationPlan[];
};

export type PublishedTemplateReplicationResult = {
  status: "COMPLETED_AND_VERIFIED";
  sourceTenantId: string;
  targetTenantId: string;
  results: Array<{
    type: DocumentType;
    action: PublishedTemplateReplicationAction;
    assignedVersionId: string;
    assignedVersion: number;
  }>;
  verification: PublishedTemplateReplicationPlan[];
};

export function canRunPublishedTemplateReplication(user: {
  tenantId: string;
  role: Role;
  roles?: readonly Role[];
}) {
  if (user.tenantId !== publishedTemplateReplicationTargetTenantId) return false;
  const roles = user.roles?.length ? user.roles : [user.role];
  return roles.some((role) =>
    replicationAdminRoles.includes(role as (typeof replicationAdminRoles)[number]),
  );
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function hashTemplateDefinition(definition: unknown) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(definition)))
    .digest("hex")}`;
}

async function assertAuthorizedActor(client: ReplicationClient, actorUserId: string) {
  const actor = await client.user.findFirst({
    where: {
      id: actorUserId,
      tenantId: publishedTemplateReplicationTargetTenantId,
      active: true,
      OR: [
        { role: { in: [...replicationAdminRoles] } },
        {
          userRoleAssignments: {
            some: {
              active: true,
              role: { in: [...replicationAdminRoles] },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      role: true,
      userRoleAssignments: {
        where: { active: true },
        select: { role: true },
      },
    },
  });

  if (!actor) {
    throw new Error(
      `Published template replication requires an active SYSTEM_ADMIN or SUPER_ADMIN in ${publishedTemplateReplicationTargetTenantId}.`,
    );
  }

  const roles = Array.from(
    new Set<Role>([actor.role, ...actor.userRoleAssignments.map((assignment) => assignment.role)]),
  );
  return { id: actor.id, role: actor.role, roles };
}

async function readTenantContext(client: ReplicationClient) {
  const [sourceTenant, targetTenant] = await Promise.all([
    client.tenant.findUnique({
      where: { id: publishedTemplateReplicationSourceTenantId },
      select: { id: true, name: true, shortName: true, address: true, email: true },
    }),
    client.tenant.findUnique({
      where: { id: publishedTemplateReplicationTargetTenantId },
      select: { id: true, name: true },
    }),
  ]);

  if (!sourceTenant) {
    throw new Error(
      `Source tenant ${publishedTemplateReplicationSourceTenantId} does not exist.`,
    );
  }
  if (!targetTenant) {
    throw new Error(
      `Target tenant ${publishedTemplateReplicationTargetTenantId} does not exist.`,
    );
  }

  return { sourceTenant, targetTenant };
}

function sourceTenantIdentifiers(sourceTenant: {
  id: string;
  name: string;
  shortName: string;
  address: string | null;
  email: string | null;
}) {
  return [
    sourceTenant.id,
    sourceTenant.name,
    sourceTenant.shortName,
    sourceTenant.address,
    sourceTenant.email,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value && value.length >= 4));
}

function assertTenantNeutralTemplate(
  definitionJson: Prisma.JsonValue,
  identifiers: string[],
  label: string,
) {
  const serialized = JSON.stringify(definitionJson).toLocaleLowerCase();
  const hardcodedIdentifier = identifiers.find((identifier) =>
    serialized.includes(identifier.toLocaleLowerCase()),
  );

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

async function resolveSourceVersion(
  client: ReplicationClient,
  sourceDefinition: {
    id: string;
    assignedTemplateVersion: { templateSetId: string } | null;
    templateSets: Array<{ id: string }>;
  },
  spec: RequestedTemplate,
) {
  const sourceTemplateSetIds = sourceDefinition.templateSets.map((set) => set.id);
  if (!sourceTemplateSetIds.length) {
    throw new Error(`${spec.type} source definition has no template sets.`);
  }

  const candidates = await client.documentTemplateVersion.findMany({
    where: {
      tenantId: publishedTemplateReplicationSourceTenantId,
      templateSetId: { in: sourceTemplateSetIds },
      version: spec.sourceVersion,
      status: DocumentTemplateVersionStatus.PUBLISHED,
    },
    select: {
      id: true,
      templateSetId: true,
      schemaVersion: true,
      definitionJson: true,
      publishedAt: true,
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
  });

  if (!candidates.length) {
    throw new Error(
      `${spec.type} v${spec.sourceVersion} is not PUBLISHED in any template set belonging to the source definition.`,
    );
  }

  const assignedTemplateSetId = sourceDefinition.assignedTemplateVersion?.templateSetId ?? null;
  const assignedCandidate = assignedTemplateSetId
    ? candidates.find((candidate) => candidate.templateSetId === assignedTemplateSetId)
    : undefined;

  if (!assignedCandidate && candidates.length > 1) {
    throw new Error(
      `${spec.type} v${spec.sourceVersion} has multiple PUBLISHED source candidates outside the assigned template set. ` +
        "Replication is blocked until the source version is unambiguous.",
    );
  }

  return assignedCandidate ?? candidates[0];
}

function plannedTargetSetName(targetDefinitionName: string) {
  return `${targetDefinitionName} - Tenant Published Templates`;
}

async function buildPlan(
  client: ReplicationClient,
  spec: RequestedTemplate,
  sourceIdentifiers: string[],
): Promise<InternalReplicationPlan> {
  const sourceDefinition = await client.documentDefinition.findFirst({
    where: {
      tenantId: publishedTemplateReplicationSourceTenantId,
      legacyType: spec.type,
    },
    select: {
      id: true,
      assignedTemplateVersion: { select: { templateSetId: true } },
      templateSets: { select: { id: true } },
    },
  });

  if (!sourceDefinition) {
    throw new Error(
      `${spec.type} definition does not exist for source tenant ${publishedTemplateReplicationSourceTenantId}.`,
    );
  }

  const sourceVersion = await resolveSourceVersion(client, sourceDefinition, spec);
  if (!sourceVersion.publishedAt) {
    throw new Error(
      `${spec.type} v${spec.sourceVersion} is marked PUBLISHED but has no publishedAt timestamp.`,
    );
  }
  if (sourceVersion.definitionJson == null) {
    throw new Error(`${spec.type} v${spec.sourceVersion} has no template definition payload.`);
  }

  assertValidTemplateDefinition(
    sourceVersion.definitionJson,
    `${spec.type} v${spec.sourceVersion}`,
  );
  assertTenantNeutralTemplate(
    sourceVersion.definitionJson,
    sourceIdentifiers,
    `${spec.type} v${spec.sourceVersion}`,
  );
  const sourceContentHash = hashTemplateDefinition(sourceVersion.definitionJson);

  const targetDefinition = await client.documentDefinition.findFirst({
    where: {
      tenantId: publishedTemplateReplicationTargetTenantId,
      legacyType: spec.type,
    },
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
          name: true,
          definitionId: true,
          active: true,
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
              templateSetId: true,
            },
          },
        },
      },
    },
  });

  if (!targetDefinition) {
    throw new Error(
      `${spec.type} definition does not exist for target tenant ${publishedTemplateReplicationTargetTenantId}.`,
    );
  }

  const targetAssigned = targetDefinition.assignedTemplateVersion;
  if (targetAssigned && targetAssigned.status !== DocumentTemplateVersionStatus.PUBLISHED) {
    throw new Error(`${spec.type} target assigned template is not PUBLISHED.`);
  }
  if (targetAssigned && targetAssigned.definitionJson == null) {
    throw new Error(`${spec.type} target assigned template has no definition payload.`);
  }

  const allTargetVersions = targetDefinition.templateSets.flatMap((set) => set.versions);
  const allMatchingPublished = allTargetVersions.filter(
    (version) =>
      version.status === DocumentTemplateVersionStatus.PUBLISHED &&
      version.definitionJson != null &&
      hashTemplateDefinition(version.definitionJson) === sourceContentHash,
  );
  const allMatchingDrafts = allTargetVersions.filter(
    (version) =>
      version.status === DocumentTemplateVersionStatus.DRAFT &&
      version.definitionJson != null &&
      hashTemplateDefinition(version.definitionJson) === sourceContentHash,
  );

  let action: PublishedTemplateReplicationAction;
  let targetSet: (typeof targetDefinition.templateSets)[number] | null = null;
  let targetTemplateSetWillBeCreated = false;
  let matchingPublishedTargetVersionId: string | null = null;
  let matchingPublishedTargetVersion: number | null = null;
  let targetAssignedContentHash: string | null = null;

  if (targetAssigned) {
    targetSet = targetDefinition.templateSets.find(
      (set) => set.id === targetAssigned.templateSetId,
    ) ?? null;
    if (!targetSet || targetSet.definitionId !== targetDefinition.id) {
      throw new Error(
        `${spec.type} target assigned template set does not belong to the target definition.`,
      );
    }

    targetAssignedContentHash = hashTemplateDefinition(targetAssigned.definitionJson);
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

    if (targetAssignedContentHash === sourceContentHash) {
      action = "ALREADY_ASSIGNED";
    } else if (matchingPublished) {
      action = "ASSIGN_EXISTING_PUBLISHED";
      matchingPublishedTargetVersionId = matchingPublished.id;
      matchingPublishedTargetVersion = matchingPublished.version;
    } else {
      if (matchingDraft) {
        throw new Error(
          `${spec.type} already has an unreviewed target DRAFT (v${matchingDraft.version}) matching the requested source content. ` +
            "Refusing to publish or bypass an existing Draft automatically.",
        );
      }
      if (!targetSet.editable || targetSet.ownershipType === DocumentTemplateOwnership.CERTIFIED) {
        throw new Error(
          `${spec.type} target template set is read-only; clone it to a tenant-owned editable set before replication.`,
        );
      }
      action = "CREATE_PUBLISHED_AND_ASSIGN";
    }
  } else if (allMatchingPublished.length === 1) {
    const existing = allMatchingPublished[0];
    targetSet = targetDefinition.templateSets.find((set) => set.id === existing.templateSetId) ?? null;
    if (!targetSet) {
      throw new Error(`${spec.type} matching published target version has no owning template set.`);
    }
    action = "ASSIGN_EXISTING_PUBLISHED";
    matchingPublishedTargetVersionId = existing.id;
    matchingPublishedTargetVersion = existing.version;
  } else if (allMatchingPublished.length > 1) {
    throw new Error(
      `${spec.type} target has multiple unassigned PUBLISHED versions matching the source content. ` +
        "Replication is blocked until the target history is unambiguous.",
    );
  } else {
    if (allMatchingDrafts.length) {
      throw new Error(
        `${spec.type} already has an unreviewed target DRAFT matching the requested source content. ` +
          "Refusing to publish or bypass an existing Draft automatically.",
      );
    }
    if (allTargetVersions.length) {
      throw new Error(
        `${spec.type} has template version history but no assigned published template. ` +
          "Review the target history before bootstrapping a new published assignment.",
      );
    }

    const reusableEmptySets = targetDefinition.templateSets.filter(
      (set) =>
        set.active &&
        set.editable &&
        set.ownershipType === DocumentTemplateOwnership.TENANT &&
        set.versions.length === 0,
    );

    if (reusableEmptySets.length === 1) {
      targetSet = reusableEmptySets[0];
      action = "CREATE_PUBLISHED_AND_ASSIGN";
    } else {
      action = "BOOTSTRAP_TARGET_SET_AND_ASSIGN";
      targetTemplateSetWillBeCreated = true;
    }
  }

  const targetTemplateSetId = targetSet?.id ?? null;
  const targetTemplateSetName =
    targetSet?.name ?? plannedTargetSetName(targetDefinition.displayName);
  const targetTemplateSetOwnership =
    targetSet?.ownershipType ?? DocumentTemplateOwnership.TENANT;
  const targetTemplateSetEditable = targetSet?.editable ?? true;
  const targetTemplateSetUpgradeCompatible = targetSet?.upgradeCompatible ?? true;
  const targetTemplateSetRestorable = targetSet?.restorable ?? true;
  const nextTargetVersion = targetSet
    ? targetSet.versions.reduce((max, version) => Math.max(max, version.version), 0) + 1
    : 1;

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
    targetAssignedTemplateVersionId: targetDefinition.assignedTemplateVersionId,
    targetAssignedVersion: targetAssigned?.version ?? null,
    targetAssignedContentHash,
    targetTemplateSetId,
    targetTemplateSetName,
    targetTemplateSetOwnership,
    targetTemplateSetEditable,
    targetTemplateSetUpgradeCompatible,
    targetTemplateSetRestorable,
    targetTemplateSetWillBeCreated,
    nextTargetVersion,
    matchingPublishedTargetVersionId,
    matchingPublishedTargetVersion,
  };
}

function sanitizePlan(plan: InternalReplicationPlan): PublishedTemplateReplicationPlan {
  const { sourceDefinitionJson: _sourceDefinitionJson, ...safe } = plan;
  return safe;
}

function planDigest(actorUserId: string, plans: InternalReplicationPlan[]) {
  return hashTemplateDefinition({
    operation: "replicate-published-document-templates",
    sourceTenantId: publishedTemplateReplicationSourceTenantId,
    targetTenantId: publishedTemplateReplicationTargetTenantId,
    actorUserId,
    plans: plans.map((plan) => sanitizePlan(plan)),
  });
}

async function buildPlans(client: ReplicationClient, sourceIdentifiers: string[]) {
  const plans: InternalReplicationPlan[] = [];
  for (const spec of publishedTemplateReplicationRequests) {
    plans.push(await buildPlan(client, spec, sourceIdentifiers));
  }
  return plans;
}

async function buildPreview(
  client: ReplicationClient,
  actorUserId: string,
): Promise<{
  preview: PublishedTemplateReplicationPreview;
  plans: InternalReplicationPlan[];
  sourceIdentifiers: string[];
}> {
  const { sourceTenant, targetTenant } = await readTenantContext(client);
  const sourceIdentifiers = sourceTenantIdentifiers(sourceTenant);
  const actor = await assertAuthorizedActor(client, actorUserId);
  const plans = await buildPlans(client, sourceIdentifiers);
  const digest = planDigest(actorUserId, plans);

  return {
    preview: {
      sourceTenant: { id: sourceTenant.id, name: sourceTenant.name },
      targetTenant: { id: targetTenant.id, name: targetTenant.name },
      actor,
      requestedTemplates: publishedTemplateReplicationRequests.map((item) => ({
        type: item.type,
        sourceVersion: item.sourceVersion,
      })),
      planDigest: digest,
      plans: plans.map((plan) => sanitizePlan(plan)),
    },
    plans,
    sourceIdentifiers,
  };
}

export async function previewPublishedTemplateReplication(
  client: ReplicationClient,
  actorUserId: string,
) {
  const { preview } = await buildPreview(client, actorUserId);
  return preview;
}

async function assignVersion(
  tx: Prisma.TransactionClient,
  plan: InternalReplicationPlan,
  newVersionId: string,
) {
  const updated = await tx.documentDefinition.updateMany({
    where: {
      id: plan.targetDefinitionId,
      tenantId: publishedTemplateReplicationTargetTenantId,
      assignedTemplateVersionId: plan.targetAssignedTemplateVersionId,
    },
    data: { assignedTemplateVersionId: newVersionId },
  });

  if (updated.count !== 1) {
    throw new Error(
      `${plan.type} target assignment changed concurrently; transaction aborted.`,
    );
  }
}

async function createTargetTemplateSet(
  tx: Prisma.TransactionClient,
  plan: InternalReplicationPlan,
  actorUserId: string,
) {
  const created = await tx.documentTemplateSet.create({
    data: {
      tenantId: publishedTemplateReplicationTargetTenantId,
      definitionId: plan.targetDefinitionId,
      name: plan.targetTemplateSetName,
      description: "Tenant-owned template set created by the guarded published-template replication operation.",
      active: true,
      ownershipType: DocumentTemplateOwnership.TENANT,
      upgradeCompatible: true,
      restorable: true,
      editable: true,
      createdById: actorUserId,
      updatedById: actorUserId,
    },
    select: { id: true },
  });
  return created.id;
}

async function applyPlan(
  tx: Prisma.TransactionClient,
  plan: InternalReplicationPlan,
  actorUserId: string,
) {
  if (plan.action === "ALREADY_ASSIGNED") {
    if (!plan.targetAssignedTemplateVersionId || plan.targetAssignedVersion == null) {
      throw new Error(`${plan.type} already-assigned plan is missing its target assignment.`);
    }
    return {
      type: plan.type,
      action: plan.action,
      assignedVersionId: plan.targetAssignedTemplateVersionId,
      assignedVersion: plan.targetAssignedVersion,
    };
  }

  let assignedVersionId: string;
  let assignedVersion: number;
  let appliedTargetTemplateSetId = plan.targetTemplateSetId;

  if (plan.action === "ASSIGN_EXISTING_PUBLISHED") {
    if (!plan.matchingPublishedTargetVersionId || plan.matchingPublishedTargetVersion == null) {
      throw new Error(
        `${plan.type} plan is missing the existing published target version.`,
      );
    }
    assignedVersionId = plan.matchingPublishedTargetVersionId;
    assignedVersion = plan.matchingPublishedTargetVersion;
  } else {
    if (plan.action === "BOOTSTRAP_TARGET_SET_AND_ASSIGN") {
      if (plan.targetTemplateSetId || !plan.targetTemplateSetWillBeCreated) {
        throw new Error(`${plan.type} bootstrap plan contains inconsistent target-set state.`);
      }
      appliedTargetTemplateSetId = await createTargetTemplateSet(tx, plan, actorUserId);
    }
    if (!appliedTargetTemplateSetId) {
      throw new Error(`${plan.type} plan has no target template set for version creation.`);
    }

    const created = await tx.documentTemplateVersion.create({
      data: {
        tenantId: publishedTemplateReplicationTargetTenantId,
        templateSetId: appliedTargetTemplateSetId,
        version: plan.nextTargetVersion,
        status: DocumentTemplateVersionStatus.PUBLISHED,
        ownershipType: plan.targetTemplateSetOwnership,
        schemaVersion: plan.sourceSchemaVersion,
        definitionJson: asJson(plan.sourceDefinitionJson),
        previewMetadata: asJson({
          publishedTemplateReplication: {
            sourceTenantId: publishedTemplateReplicationSourceTenantId,
            sourceDefinitionId: plan.sourceDefinitionId,
            sourceTemplateSetId: plan.sourceTemplateSetId,
            sourceVersionId: plan.sourceVersionId,
            sourceVersion: plan.requestedSourceVersion,
            sourceContentHash: plan.sourceContentHash,
            targetTemplateSetBootstrapped:
              plan.action === "BOOTSTRAP_TARGET_SET_AND_ASSIGN",
            replicatedBy: "lib/services/published-template-replication.ts",
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
      tenantId: publishedTemplateReplicationTargetTenantId,
      actorId: actorUserId,
      module: "DOCUMENTS",
      action: "REPLICATE_PUBLISHED_DOCUMENT_TEMPLATE",
      entityType: "DocumentDefinition",
      entityId: plan.targetDefinitionId,
      metadata: asJson({
        sourceTenantId: publishedTemplateReplicationSourceTenantId,
        targetTenantId: publishedTemplateReplicationTargetTenantId,
        documentType: plan.type,
        requestedSourceVersion: plan.requestedSourceVersion,
        sourceVersionId: plan.sourceVersionId,
        sourceContentHash: plan.sourceContentHash,
        previousAssignedVersionId: plan.targetAssignedTemplateVersionId,
        previousAssignedVersion: plan.targetAssignedVersion,
        targetTemplateSetId: appliedTargetTemplateSetId,
        targetTemplateSetCreated: plan.action === "BOOTSTRAP_TARGET_SET_AND_ASSIGN",
        assignedVersionId,
        assignedVersion,
        replicationAction: plan.action,
        timestamp: new Date().toISOString(),
      }),
    },
  });

  return {
    type: plan.type,
    action: plan.action,
    assignedVersionId,
    assignedVersion,
  };
}

export async function applyPublishedTemplateReplication(
  client: PrismaClient,
  actorUserId: string,
  confirmDigest: string,
): Promise<PublishedTemplateReplicationResult> {
  if (!/^sha256:[a-f0-9]{64}$/.test(confirmDigest)) {
    throw new Error("A valid preview plan digest is required before replication can be applied.");
  }

  const { preview } = await buildPreview(client, actorUserId);
  if (confirmDigest !== preview.planDigest) {
    throw new Error(
      "The supplied plan digest does not match the current preflight plan. Preview the replication again.",
    );
  }

  const results = await client.$transaction(async (tx) => {
    const { sourceTenant } = await readTenantContext(tx);
    const transactionIdentifiers = sourceTenantIdentifiers(sourceTenant);
    await assertAuthorizedActor(tx, actorUserId);
    const transactionPlans = await buildPlans(tx, transactionIdentifiers);
    const transactionDigest = planDigest(actorUserId, transactionPlans);

    if (transactionDigest !== confirmDigest) {
      throw new Error(
        "Template state changed after preview. Transaction aborted; preview the replication again.",
      );
    }

    const applied = [];
    for (const plan of transactionPlans) {
      applied.push(await applyPlan(tx, plan, actorUserId));
    }
    return applied;
  });

  const { sourceTenant } = await readTenantContext(client);
  const verificationPlans = await buildPlans(
    client,
    sourceTenantIdentifiers(sourceTenant),
  );
  const incomplete = verificationPlans.filter(
    (plan) => plan.action !== "ALREADY_ASSIGNED",
  );

  if (incomplete.length) {
    throw new Error(
      `Post-apply verification failed for: ${incomplete
        .map((plan) => `${plan.type}:${plan.action}`)
        .join(", ")}.`,
    );
  }

  return {
    status: "COMPLETED_AND_VERIFIED",
    sourceTenantId: publishedTemplateReplicationSourceTenantId,
    targetTenantId: publishedTemplateReplicationTargetTenantId,
    results,
    verification: verificationPlans.map((plan) => sanitizePlan(plan)),
  };
}
