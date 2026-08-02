import "server-only";

import crypto from "node:crypto";
import { DocumentTemplateOwnership, DocumentTemplateVersionStatus, Prisma, Role } from "@prisma/client";
import gatePassPackage from "@/templates/pass-templates/gate-pass-two-copy-a4.json";
import moveInOutPackage from "@/templates/pass-templates/move-in-out-two-copy-a4.json";
import { platformPrisma } from "@/lib/db";
import { allowedDocumentPlaceholders, extractPlaceholders, validateTemplateDefinition } from "@/lib/services/document-template-builder";

export const approvedPassTemplateInstallerPath = "/admin/settings/document-templates/install-approved-passes";
export const approvedPassTemplateInstallerFlag = "ENABLE_APPROVED_PASS_TEMPLATE_INSTALLER";
export const approvedPassTemplateConfirmationPhrase = "INSTALL APPROVED PASS DRAFTS";
export const approvedPassTemplatePreserveDraftsConfirmationPhrase = "PRESERVE EXISTING DRAFTS AND CREATE APPROVED VERSIONS";
export const targetTenantId = "tenant_pagsibol4b_default";

export type ApprovedPassTemplatePackage = {
  packageVersion: 1;
  kind: "HOAHubApprovedPassTemplateDraft";
  layoutId: string;
  displayName: string;
  approvedSource: string;
  contentHash: string;
  definition: unknown;
};

export type TargetPassTemplate = {
  key: "gate-pass" | "move-in-out";
  label: string;
  definitionId: string;
  expectedAssignedVersion: number;
  expectedContentHash: string;
};

export const targetPassTemplates: TargetPassTemplate[] = [
  {
    key: "gate-pass",
    label: "Gate Pass",
    definitionId: "dd_a35620f0864e11f1a28b59f2b5b05598",
    expectedAssignedVersion: 2,
    expectedContentHash: "sha256:cbe90b056ec1f4af0835d5c6ef30c02a5c03d2a5cef891cab8395504d410f1b7",
  },
  {
    key: "move-in-out",
    label: "Move-In/Move-Out",
    definitionId: "dd_a35623c7864e11f1a28b59f2b5b05598",
    expectedAssignedVersion: 1,
    expectedContentHash: "sha256:06d6241c92cf70f6c24c789c872b5c70c7a651a681f861dfc10eade7760fbf93",
  },
];

type JsonRecord = Record<string, unknown>;
type InstallerClient = Pick<Prisma.TransactionClient, "tenant" | "documentDefinition" | "documentTemplateVersion" | "auditLog">;

export type ApprovedPassVersionState = {
  id: string;
  version: number;
  status: DocumentTemplateVersionStatus;
  templateSetId: string;
  definitionJson: unknown;
};

export type ApprovedPassDefinitionState = {
  id: string;
  displayName: string;
  assignedTemplateVersionId: string | null;
  assignedTemplateVersion: ApprovedPassVersionState | null;
  templateSets: Array<{
    id: string;
    definitionId: string;
    editable: boolean;
    ownershipType: DocumentTemplateOwnership;
    versions: ApprovedPassVersionState[];
  }>;
};

export type ApprovedPassTemplatePlan = {
  key: TargetPassTemplate["key"];
  target: string;
  definitionName: string;
  action: "CREATE_DRAFT" | "PRESERVE_EXISTING_DRAFTS_CREATE_NEW" | "ALREADY_INSTALLED" | "BLOCKED";
  blockReason?: string;
  definitionId: string;
  assignedTemplateVersionId: string;
  assignedVersionNumber: number;
  assignedStatus: DocumentTemplateVersionStatus;
  templateSetId: string;
  ownershipType: DocumentTemplateOwnership;
  currentHighestVersion: number;
  nextVersion: number;
  expectedNewDraftVersion: number;
  approvedPackageContentHash: string;
  assignedPublishedVersionNumber: number;
  existingVersionId?: string;
  existingDraftVersionId?: string;
  preservedDraftVersionIds: string[];
  preservedDraftVersions: number[];
  versionStatuses: Array<{
    version: number;
    status: DocumentTemplateVersionStatus;
    matchesApprovedPackage: boolean;
  }>;
};

export type ApprovedPassTemplateApplyResult = {
  plans: ApprovedPassTemplatePlan[];
  createdVersions: Array<{ target: string; versionId: string; version: number; contentHash: string }>;
};

export function approvedPassTemplateInstallerEnabled(env: Record<string, string | undefined> = process.env) {
  return env[approvedPassTemplateInstallerFlag] === "true";
}

export function loadApprovedPassTemplatePackages() {
  const items = [
    { target: targetPassTemplates[0], pkg: gatePassPackage as ApprovedPassTemplatePackage },
    { target: targetPassTemplates[1], pkg: moveInOutPackage as ApprovedPassTemplatePackage },
  ];
  for (const item of items) validateApprovedPassTemplatePackage(item.pkg, item.target);
  return items;
}

export async function analyzeApprovedPassTemplateInstallation(input: { tenantId: string; client?: InstallerClient } = { tenantId: targetTenantId }) {
  assertTargetTenant(input.tenantId);
  const client = input.client ?? platformPrisma;
  const tenant = await client.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true } });
  if (!tenant) throw new Error("Target tenant does not exist.");
  const packages = loadApprovedPassTemplatePackages();
  const plans: ApprovedPassTemplatePlan[] = [];
  for (const item of packages) plans.push(planApprovedPassTemplateFromState(item.target, item.pkg, await readDefinitionState(client, item.target)));
  return plans;
}

export async function applyApprovedPassTemplateInstallation(input: { actorUserId: string; tenantId: string; dryRunDigest: string }) {
  assertTargetTenant(input.tenantId);
  return platformPrisma.$transaction(async (tx) => {
    const plans = await analyzeApprovedPassTemplateInstallation({ tenantId: input.tenantId, client: tx });
    const transactionDigest = installationPlanDigest({ actorUserId: input.actorUserId, tenantId: input.tenantId, plans });
    if (transactionDigest !== input.dryRunDigest) throw new Error("Production template state changed after dry-run. Run dry-run again before applying.");
    const blocked = plans.find((plan) => plan.action === "BLOCKED");
    if (blocked) throw new Error(blocked.blockReason || "Approved pass template installation is blocked.");

    const packages = new Map(loadApprovedPassTemplatePackages().map((item) => [item.target.key, item]));
    const createdVersions: ApprovedPassTemplateApplyResult["createdVersions"] = [];
    for (const plan of plans) {
      if (plan.action !== "CREATE_DRAFT" && plan.action !== "PRESERVE_EXISTING_DRAFTS_CREATE_NEW") continue;
      const item = packages.get(plan.key);
      if (!item) throw new Error(`Approved package is unavailable for ${plan.target}.`);
      const created = await tx.documentTemplateVersion.create({
        data: {
          tenantId: input.tenantId,
          templateSetId: plan.templateSetId,
          version: plan.nextVersion,
          status: DocumentTemplateVersionStatus.DRAFT,
          ownershipType: plan.ownershipType,
          schemaVersion: 2,
          definitionJson: asJson(item.pkg.definition),
          previewMetadata: asJson(approvedInstallMetadata(item.pkg, "web-installer")),
          publishedAt: null,
          publishedById: null,
          createdById: input.actorUserId,
          sourceVersionId: plan.assignedTemplateVersionId,
          cloneSourceVersion: plan.assignedVersionNumber,
          clonedAt: new Date(),
          upgradeCompatible: true,
          restorable: true,
        },
        select: { id: true, version: true },
      });
      createdVersions.push({ target: plan.target, versionId: created.id, version: created.version, contentHash: plan.approvedPackageContentHash });
    }

    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorUserId,
        module: "DOCUMENTS",
        action: "INSTALL_APPROVED_PASS_TEMPLATE_DRAFTS",
        entityType: "DocumentTemplateVersion",
        metadata: asJson({
          installer: "admin-web",
          dryRunDigest: input.dryRunDigest,
          targetTenantId: input.tenantId,
          createdVersions,
          results: plans.map(sanitizePlanForAudit),
          preservedExistingDrafts: plans.map((plan) => ({
            target: plan.target,
            preservedDraftVersions: plan.preservedDraftVersions,
            preservedDraftVersionIds: plan.preservedDraftVersionIds,
          })),
          timestamp: new Date().toISOString(),
        }),
      },
    });

    return { plans, createdVersions };
  });
}

export function planApprovedPassTemplateFromState(target: TargetPassTemplate, pkg: ApprovedPassTemplatePackage, definition: ApprovedPassDefinitionState | null): ApprovedPassTemplatePlan {
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
  if (templateSet.ownershipType !== DocumentTemplateOwnership.TENANT) throw new Error(`PRODUCTION TEMPLATE STATE CHANGED: ${target.label} template set is not tenant-owned.`);

  const versionSummaries = templateSet.versions.map((version) => ({
    id: version.id,
    version: version.version,
    status: version.status,
    contentHash: hashTemplateDefinition(version.definitionJson),
    matchesApprovedPackage: hashTemplateDefinition(version.definitionJson) === pkg.contentHash,
  }));
  const drafts = versionSummaries.filter((version) => version.status === DocumentTemplateVersionStatus.DRAFT);
  const exactDraft = drafts.find((version) => version.matchesApprovedPackage);
  const differentDrafts = drafts.filter((version) => !version.matchesApprovedPackage);
  const alreadyPresent = versionSummaries.find((version) => version.matchesApprovedPackage);
  const currentHighestVersion = versionSummaries.reduce((max, version) => Math.max(max, version.version), 0);
  const common = {
    key: target.key,
    target: target.label,
    definitionName: definition.displayName,
    definitionId: target.definitionId,
    assignedTemplateVersionId: assigned.id,
    assignedVersionNumber: assigned.version,
    assignedStatus: assigned.status,
    templateSetId: templateSet.id,
    ownershipType: templateSet.ownershipType,
    currentHighestVersion,
    nextVersion: currentHighestVersion + 1,
    expectedNewDraftVersion: currentHighestVersion + 1,
    approvedPackageContentHash: pkg.contentHash,
    assignedPublishedVersionNumber: assigned.version,
    preservedDraftVersionIds: differentDrafts.map((version) => version.id),
    preservedDraftVersions: differentDrafts.map((version) => version.version).sort((left, right) => left - right),
    versionStatuses: versionSummaries.map((version) => ({
      version: version.version,
      status: version.status,
      matchesApprovedPackage: version.matchesApprovedPackage,
    })),
  };
  if (exactDraft || alreadyPresent) {
    return {
      ...common,
      action: "ALREADY_INSTALLED",
      existingVersionId: (exactDraft ?? alreadyPresent)?.id,
      existingDraftVersionId: exactDraft?.id,
    };
  }
  if (differentDrafts.length) return { ...common, action: "PRESERVE_EXISTING_DRAFTS_CREATE_NEW" };
  return { ...common, action: "CREATE_DRAFT" };
}

export function validateApprovedPassTemplatePackage(pkg: ApprovedPassTemplatePackage, target: TargetPassTemplate) {
  if (pkg.packageVersion !== 1) throw new Error(`${target.label} package has an unsupported packageVersion.`);
  if (pkg.kind !== "HOAHubApprovedPassTemplateDraft") throw new Error(`${target.label} package kind is invalid.`);
  if (pkg.contentHash !== target.expectedContentHash) throw new Error(`${target.label} package contentHash is not the approved hash.`);
  const contentHash = hashTemplateDefinition(pkg.definition);
  if (pkg.contentHash !== contentHash) throw new Error(`${target.label} package contentHash does not match its definition.`);
  const validation = validateTemplateDefinition(pkg.definition, { allowedPlaceholders: new Set(allowedDocumentPlaceholders) });
  if (!validation.valid) throw new Error(`${target.label} package template is invalid: ${validation.errors.join("; ")}`);
  const placeholders = new Set(flattenStrings(pkg.definition).flatMap((value) => extractPlaceholders(value)));
  const unsupported = [...placeholders].filter((placeholder) => !allowedDocumentPlaceholders.includes(placeholder as never));
  if (unsupported.length) throw new Error(`${target.label} package contains unsupported placeholders: ${unsupported.join(", ")}`);
  assertNoSensitiveContent(pkg, target);
  assertRequiredLayout(pkg, target);
}

export function hashTemplateDefinition(definition: unknown) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(canonicalize(definition))).digest("hex")}`;
}

export function installationPlanDigest(input: { actorUserId: string; tenantId: string; plans: ApprovedPassTemplatePlan[] }) {
  return hashTemplateDefinition({
    actorUserId: input.actorUserId,
    tenantId: input.tenantId,
    plans: input.plans.map((plan) => ({
      key: plan.key,
      action: plan.action,
      definitionId: plan.definitionId,
      assignedTemplateVersionId: plan.assignedTemplateVersionId,
      templateSetId: plan.templateSetId,
      nextVersion: plan.nextVersion,
      contentHash: plan.approvedPackageContentHash,
    })),
  });
}

export function assertTargetTenant(tenantId: string) {
  if (tenantId !== targetTenantId) throw new Error("Approved pass template installer is restricted to the Pagsibol 4B tenant.");
}

export function assertApprovedPassTemplateInstallerRole(role: Role) {
  if (role !== Role.SYSTEM_ADMIN && role !== Role.SUPER_ADMIN) {
    throw new Error("Approved pass template installer requires System Administrator authority.");
  }
}

export function assertInstallerConfirmation(input: { phrase: FormDataEntryValue | null; preservePhrase: FormDataEntryValue | null; acknowledged: FormDataEntryValue | null; preserveAcknowledged: FormDataEntryValue | null }) {
  if (String(input.phrase || "").trim() !== approvedPassTemplateConfirmationPhrase) throw new Error("The confirmation phrase did not match.");
  if (input.acknowledged !== "on") throw new Error("Confirm that published templates will not be changed.");
  if (String(input.preservePhrase || "").trim() !== approvedPassTemplatePreserveDraftsConfirmationPhrase) throw new Error("The preserve-existing-drafts confirmation phrase did not match.");
  if (input.preserveAcknowledged !== "on") throw new Error("Confirm that existing Drafts will be preserved and new approved Draft versions will be created.");
}

export function sanitizePlanForDisplay(plan: ApprovedPassTemplatePlan) {
  return {
    key: plan.key,
    target: plan.target,
    definitionName: plan.definitionName,
    action: plan.action,
    blockReason: plan.blockReason,
    definitionId: plan.definitionId,
    assignedTemplateVersionId: plan.assignedTemplateVersionId,
    assignedPublishedVersionNumber: plan.assignedPublishedVersionNumber,
    assignedStatus: plan.assignedStatus,
    templateSetId: plan.templateSetId,
    currentHighestVersion: plan.currentHighestVersion,
    nextVersion: plan.nextVersion,
    approvedPackageContentHash: plan.approvedPackageContentHash,
    existingDraftVersionId: plan.existingDraftVersionId,
    existingVersionId: plan.existingVersionId,
    preservedDraftVersionIds: plan.preservedDraftVersionIds,
    preservedDraftVersions: plan.preservedDraftVersions,
    versionStatuses: plan.versionStatuses,
  };
}

function approvedInstallMetadata(pkg: ApprovedPassTemplatePackage, installer: "web-installer") {
  return {
    approvedPassTemplateInstall: {
      layoutId: pkg.layoutId,
      contentHash: pkg.contentHash,
      installedBy: installer,
    },
  };
}

async function readDefinitionState(client: InstallerClient, target: TargetPassTemplate): Promise<ApprovedPassDefinitionState | null> {
  return client.documentDefinition.findFirst({
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
}

function sanitizePlanForAudit(plan: ApprovedPassTemplatePlan) {
  return {
    target: plan.target,
    definitionName: plan.definitionName,
    action: plan.action,
    blockReason: plan.blockReason,
    definitionId: plan.definitionId,
    assignedTemplateVersionId: plan.assignedTemplateVersionId,
    assignedPublishedVersionNumber: plan.assignedPublishedVersionNumber,
    templateSetId: plan.templateSetId,
    currentHighestVersion: plan.currentHighestVersion,
    nextVersion: plan.nextVersion,
    approvedPackageContentHash: plan.approvedPackageContentHash,
    createdDraftExpected: plan.action === "CREATE_DRAFT" || plan.action === "PRESERVE_EXISTING_DRAFTS_CREATE_NEW",
    preservedDraftVersions: plan.preservedDraftVersions,
    preservedDraftVersionIds: plan.preservedDraftVersionIds,
  };
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => flattenStrings(item));
  if (value && typeof value === "object") return Object.values(value).flatMap((item) => flattenStrings(item));
  return [];
}

function assertRequiredLayout(pkg: ApprovedPassTemplatePackage, target: TargetPassTemplate) {
  const definition = asRecord(pkg.definition);
  const page = asRecord(definition.page);
  if (page.format !== "A4" || page.orientation !== "portrait") throw new Error(`${target.label} package must be A4 portrait.`);
  const allText = flattenStrings(pkg.definition).join("\n");
  assertCount(allText, "MARSHAL'S COPY", 1, `${target.label} must contain Marshal's Copy.`);
  assertCount(allText, "HOMEOWNER'S COPY", 1, `${target.label} must contain Homeowner's Copy.`);
  assertCount(allText, "{{tenant.name}}", 2, `${target.label} must include a dynamic tenant header on both copies.`);
  assertCount(allText, "{{document.number}}", 2, `${target.label} must include document-control rows on both copies.`);
  assertCount(allText, "SCAN TO VERIFY", 2, `${target.label} must include QR labels on both copies.`);
  if (!allText.includes("CUT HERE")) throw new Error(`${target.label} must include a cut-line label.`);
  if (!allText.includes("#071f4f") || !allText.includes("#c79318")) throw new Error(`${target.label} must use the navy-and-gold layout.`);
  const blocks = flattenBlocks(definition);
  const qrBlocks = blocks.filter((block) => block.type === "qrVerification");
  if (qrBlocks.length !== 2) throw new Error(`${target.label} must contain exactly two QR blocks.`);
  const dashedLines = blocks.filter((block) => block.type === "horizontalLine" && asRecord(block.style).lineStyle === "dashed");
  if (!dashedLines.length) throw new Error(`${target.label} must include a dashed cut line.`);
}

function assertNoSensitiveContent(pkg: ApprovedPassTemplatePackage, target: TargetPassTemplate) {
  const allText = flattenStrings(pkg).join("\n");
  const forbiddenPatterns = [
    /mysql:\/\//i,
    /DATABASE_URL/i,
    /u309242896/i,
    /hoahub_prodclone_local/i,
    /Pagsibol Village East 4B/i,
    /Sabang,\s*Naic/i,
    /office@example/i,
    /0917\s*\d{3}\s*\d{4}/i,
    /Juan\s+Miguel/i,
    /Maria\s+Santos/i,
    /Pedro\s+Santos/i,
    /DOC-UAT/i,
    /uat-token/i,
    /Certificate of Residency/i,
    /HOA Office Copy/i,
  ];
  const match = forbiddenPatterns.find((pattern) => pattern.test(allText));
  if (match) throw new Error(`${target.label} package contains forbidden sensitive or hardcoded content: ${match}`);
}

function assertCount(text: string, needle: string, expectedMinimum: number, message: string) {
  const count = text.split(needle).length - 1;
  if (count < expectedMinimum) throw new Error(message);
}

function flattenBlocks(definition: JsonRecord): JsonRecord[] {
  const sections = asRecord(definition.sections);
  return ["header", "body", "footer"].flatMap((section) => {
    const blocks = sections[section];
    return Array.isArray(blocks) ? blocks.filter(isRecord) : [];
  });
}

function asRecord(value: unknown): JsonRecord {
  if (!isRecord(value)) throw new Error("Expected a JSON object.");
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}
