import {
  DocumentDefinitionStatus,
  DocumentDeliveryMode,
  DocumentSequenceScope,
  PrismaClient,
  type DocumentType,
  type Prisma,
} from "@prisma/client";
import { workflowFieldsForPreset, workflowPresetForDeliveryMode } from "../lib/services/document-workflow-presets";

const prisma = new PrismaClient();
const rollbackSignal = "ROLLBACK_DOCUMENT_DEFINITION_PERSISTENCE_OK";

async function main() {
  const fixture = await prisma.documentTypeConfiguration.findFirst({
    select: { tenantId: true, type: true },
    orderBy: { createdAt: "asc" },
  });
  if (!fixture) throw new Error("Missing document type configuration fixture for verification.");
  const actor = await prisma.user.findFirst({ where: { tenantId: fixture.tenantId }, select: { id: true } });
  if (!actor) throw new Error("Missing tenant user fixture for verification.");

  await prisma.$transaction(async (tx) => {
    const officer = await findOrCreateOfficer(tx, fixture.tenantId, actor.id);
    const custom = await createDefinition(tx, fixture.tenantId, actor.id, `VERIFY_CUSTOM_${Date.now()}`);
    const customBefore = custom.version;
    const customUpdate = definitionUpdateData("FREE_INSTANT", {
      active: false,
      homeownerDownloadEnabled: false,
      qrEnabled: true,
      maxCopies: 7,
      signatoryOfficerId: officer.id,
    });
    await tx.documentDefinition.update({ where: { id: custom.id }, data: { ...customUpdate, version: { increment: 1 } } });
    const customReloaded = await tx.documentDefinition.findFirstOrThrow({ where: { tenantId: fixture.tenantId, id: custom.id } });
    assert(customReloaded.version === customBefore + 1, "Custom definition version increments exactly once.");
    assert(customReloaded.deliveryMode === DocumentDeliveryMode.INSTANT_DOWNLOAD, "FREE_INSTANT delivery mode persists.");
    assert(workflowPresetForDeliveryMode(customReloaded.deliveryMode) === "FREE_INSTANT", "FREE_INSTANT reconstructs from persisted delivery mode.");
    assert(customReloaded.active === false && customReloaded.status === DocumentDefinitionStatus.INACTIVE, "Active true to false persists.");
    assert(customReloaded.homeownerDownloadEnabled === false, "Homeowner visibility/download true to false persists.");
    assert(customReloaded.qrEnabled === true, "QR false to true persists.");
    assert(customReloaded.maxCopies === 7, "Max copies change persists.");
    assert(customReloaded.signatoryOfficerId === officer.id, "Signatory change persists.");

    const legacy = await createDefinition(tx, fixture.tenantId, actor.id, `VERIFY_LEGACY_${Date.now()}`, fixture.type);
    const legacyBefore = legacy.version;
    const legacyUpdate = definitionUpdateData("PAID_APPROVAL", {
      active: true,
      feeAmount: "125.00",
      homeownerDownloadEnabled: true,
      qrEnabled: true,
      maxCopies: 3,
      signatoryOfficerId: officer.id,
    });
    await tx.documentDefinition.update({ where: { id: legacy.id }, data: { ...legacyUpdate, version: { increment: 1 } } });
    const synced = await tx.documentTypeConfiguration.updateMany({
      where: { tenantId: fixture.tenantId, type: fixture.type },
      data: {
        definitionId: legacy.id,
        displayName: legacyUpdate.displayName,
        description: legacyUpdate.description,
        active: legacyUpdate.active,
        deliveryMode: legacyUpdate.deliveryMode,
        approvalRequired: legacyUpdate.approvalRequired,
        paymentRequired: legacyUpdate.paymentRequired,
        paymentBeforeApproval: legacyUpdate.paymentBeforeApproval,
        allowImmediateDownload: legacyUpdate.allowImmediateDownload,
        allowRegeneration: legacyUpdate.allowRegeneration,
        requiresAdminReview: legacyUpdate.requiresAdminReview,
        homeownerDownloadEnabled: legacyUpdate.homeownerDownloadEnabled,
        validityDays: legacyUpdate.validityDays,
        maxCopies: legacyUpdate.maxCopies,
        feeAmount: legacyUpdate.feeAmount,
        allowPayLater: legacyUpdate.allowPayLater,
        signatoryOfficerId: legacyUpdate.signatoryOfficerId,
        updatedById: actor.id,
        version: { increment: 1 },
      },
    });
    assert(synced.count === 1, "Legacy synchronization is tenant/type scoped.");
    const legacyReloaded = await tx.documentDefinition.findFirstOrThrow({ where: { tenantId: fixture.tenantId, id: legacy.id } });
    const configReloaded = await tx.documentTypeConfiguration.findFirstOrThrow({ where: { tenantId: fixture.tenantId, type: fixture.type } });
    assert(legacyReloaded.version === legacyBefore + 1, "Legacy-backed definition version increments exactly once.");
    assert(legacyReloaded.deliveryMode === DocumentDeliveryMode.PAYMENT_AND_APPROVAL_REQUIRED, "Legacy-backed workflow persists to DocumentDefinition.");
    assert(workflowPresetForDeliveryMode(legacyReloaded.deliveryMode) === "PAID_APPROVAL", "Legacy-backed workflow reconstructs from persisted delivery mode.");
    assert(Number(legacyReloaded.feeAmount) === 125, "Legacy-backed paid fee persists.");
    assert(configReloaded.definitionId === legacy.id, "Legacy compatibility configuration links to the saved definition.");
    assert(configReloaded.deliveryMode === legacyReloaded.deliveryMode, "Legacy compatibility delivery mode syncs from definition.");
    assert(configReloaded.tenantId === fixture.tenantId, "Legacy compatibility remains tenant scoped.");

    throw new Error(rollbackSignal);
  }).catch((error) => {
    if (error instanceof Error && error.message === rollbackSignal) return;
    throw error;
  });

  console.log("PASS: document definition persistence, workflow reconstruction, boolean flips, legacy sync, tenant scope, and single version increments verified with rollback.");
}

function definitionUpdateData(preset: string, overrides: Partial<Prisma.DocumentDefinitionUncheckedUpdateInput>) {
  const workflow = workflowFieldsForPreset(preset);
  if (!workflow) throw new Error(`Invalid workflow fixture ${preset}.`);
  const active = Boolean(overrides.active);
  return {
    displayName: "Verification Definition",
    description: "Rollback persistence verification",
    category: "Verification",
    displayOrder: 99,
    active,
    status: active ? DocumentDefinitionStatus.ACTIVE : DocumentDefinitionStatus.INACTIVE,
    legacyType: overrides.legacyType,
    ...workflow,
    feeAmount: overrides.feeAmount ?? "0.00",
    currency: "PHP",
    receiptRequired: false,
    financeClassification: null,
    allowPayLater: false,
    releaseRequired: false,
    homeownerDownloadEnabled: overrides.homeownerDownloadEnabled ?? true,
    walkInEnabled: false,
    householdMemberEnabled: true,
    manualSubjectEnabled: false,
    allowRegeneration: true,
    numberingFormat: "{PREFIX}-{YYYY}-{SEQUENCE:6}",
    sequenceScope: DocumentSequenceScope.ANNUAL,
    validityDays: null,
    maxCopies: overrides.maxCopies ?? 1,
    qrEnabled: overrides.qrEnabled ?? false,
    watermarkEnabled: false,
    signatoryOfficerId: overrides.signatoryOfficerId,
  } satisfies Prisma.DocumentDefinitionUncheckedUpdateInput;
}

async function createDefinition(tx: Prisma.TransactionClient, tenantId: string, actorId: string, code: string, legacyType?: DocumentType) {
  return tx.documentDefinition.create({
    data: {
      tenantId,
      code,
      displayName: "Verification Definition",
      status: DocumentDefinitionStatus.ACTIVE,
      active: true,
      legacyType,
      deliveryMode: DocumentDeliveryMode.APPROVAL_REQUIRED,
      approvalRequired: true,
      paymentRequired: false,
      paymentBeforeApproval: false,
      allowImmediateDownload: false,
      requiresAdminReview: true,
      releaseRequired: false,
      homeownerDownloadEnabled: true,
      walkInEnabled: false,
      householdMemberEnabled: true,
      manualSubjectEnabled: false,
      allowRegeneration: true,
      allowPayLater: false,
      feeAmount: "0.00",
      receiptRequired: false,
      numberingFormat: "{PREFIX}-{YYYY}-{SEQUENCE:6}",
      sequenceScope: DocumentSequenceScope.ANNUAL,
      maxCopies: 1,
      qrEnabled: false,
      watermarkEnabled: false,
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

async function findOrCreateOfficer(tx: Prisma.TransactionClient, tenantId: string, actorId: string) {
  const existing = await tx.organizationOfficer.findFirst({ where: { tenantId, active: true, archivedAt: null }, select: { id: true } });
  if (existing) return existing;
  return tx.organizationOfficer.create({
    data: {
      tenantId,
      fullName: "Verification Officer",
      position: "Document Officer",
      displayOrder: 9999,
      active: true,
      effectiveDate: new Date("2026-01-01T00:00:00.000Z"),
      updatedById: actorId,
    },
    select: { id: true },
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().finally(async () => prisma.$disconnect());
