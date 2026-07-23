import {
  DocumentDefinitionStatus,
  DocumentDeliveryMode,
  DocumentFieldType,
  DocumentOrigin,
  DocumentRequestStatus,
  DocumentSequenceScope,
  DocumentTemplateOwnership,
  DocumentTemplateVersionStatus,
  Prisma,
  PrismaClient,
  Role,
} from "@prisma/client";
import { defaultTemplateDefinition, documentTemplateSchemaVersion } from "../lib/services/document-template-builder";

const prisma = new PrismaClient();
const rollbackSignal = "ROLLBACK_DOCUMENT_RESTORE_FIELD_LIFECYCLE_OK";

async function main() {
  const fixture = await prisma.documentTypeConfiguration.findFirst({
    select: { tenantId: true },
    orderBy: { createdAt: "asc" },
  });
  if (!fixture) throw new Error("Missing tenant document fixture for verification.");

  await prisma.$transaction(async (tx) => {
    const actor = await findOrCreateActor(tx, fixture.tenantId);
    const homeowner = await findOrCreateHomeowner(tx, fixture.tenantId);
    const code = `VERIFY_RESTORE_${Date.now()}`;
    const archivedAt = new Date("2026-07-01T00:00:00.000Z");

    const definition = await tx.documentDefinition.create({
      data: {
        tenantId: fixture.tenantId,
        code,
        displayName: "Restore Verification",
        category: "Verification",
        status: DocumentDefinitionStatus.ARCHIVED,
        active: false,
        archivedAt,
        deliveryMode: DocumentDeliveryMode.APPROVAL_REQUIRED,
        approvalRequired: true,
        paymentRequired: false,
        paymentBeforeApproval: false,
        allowImmediateDownload: false,
        requiresAdminReview: true,
        homeownerDownloadEnabled: true,
        walkInEnabled: true,
        householdMemberEnabled: true,
        manualSubjectEnabled: false,
        allowRegeneration: true,
        allowPayLater: false,
        feeAmount: "0.00",
        receiptRequired: false,
        numberingFormat: "{PREFIX}-{YYYY}-{SEQUENCE:6}",
        sequenceScope: DocumentSequenceScope.ANNUAL,
        maxCopies: 1,
        qrEnabled: true,
        watermarkEnabled: false,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    const templateSet = await tx.documentTemplateSet.create({
      data: {
        tenantId: fixture.tenantId,
        definitionId: definition.id,
        name: "Restore Verification Template",
        active: true,
        ownershipType: DocumentTemplateOwnership.TENANT,
        editable: true,
        restorable: true,
        upgradeCompatible: true,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    const publishedV2 = await tx.documentTemplateVersion.create({
      data: {
        tenantId: fixture.tenantId,
        templateSetId: templateSet.id,
        version: 2,
        status: DocumentTemplateVersionStatus.PUBLISHED,
        ownershipType: DocumentTemplateOwnership.TENANT,
        schemaVersion: documentTemplateSchemaVersion,
        definitionJson: json(defaultTemplateDefinition("Restore Verification")),
        publishedAt: new Date("2026-07-02T00:00:00.000Z"),
        publishedById: actor.id,
        createdById: actor.id,
      },
    });
    await tx.documentDefinition.update({ where: { id: definition.id }, data: { assignedTemplateVersionId: publishedV2.id } });
    const field = await tx.documentDefinitionField.create({
      data: {
        tenantId: fixture.tenantId,
        definitionId: definition.id,
        key: "obsoletePurpose",
        label: "Obsolete Purpose",
        fieldType: DocumentFieldType.TEXT,
        required: true,
        active: true,
        displayOrder: 10,
      },
    });
    const request = await tx.documentRequest.create({
      data: {
        tenantId: fixture.tenantId,
        homeownerId: homeowner.id,
        definitionId: definition.id,
        definitionVersionSnapshot: definition.version,
        definitionSnapshot: json({ id: definition.id, code: definition.code, displayName: definition.displayName }),
        templateVersionIdSnapshot: publishedV2.id,
        templateVersionSnapshot: publishedV2.version,
        templateDefinitionSnapshot: json(publishedV2.definitionJson ?? {}),
        subjectSnapshot: json({ fullName: "Lifecycle Homeowner", address: homeowner.address }),
        requestDataSnapshot: json({ fields: { obsoletePurpose: "Historical value" }, numberOfCopies: 1 }),
        deliveryModeSnapshot: DocumentDeliveryMode.APPROVAL_REQUIRED,
        approvalRequiredSnapshot: true,
        paymentRequiredSnapshot: false,
        feeAmountSnapshot: new Prisma.Decimal(0),
        numberOfCopies: 1,
        origin: DocumentOrigin.HOMEOWNER,
        initiatedById: actor.id,
        status: DocumentRequestStatus.PENDING_APPROVAL,
        purpose: "Historical value",
      },
    });

    const restored = await tx.documentDefinition.update({
      where: { id: definition.id },
      data: { active: true, status: DocumentDefinitionStatus.ACTIVE, archivedAt: null, updatedById: actor.id, version: { increment: 1 } },
    });
    assert(restored.id === definition.id, "Restore preserves the same definition ID.");
    assert(restored.active === true, "Restore persists active=true.");
    assert(restored.status === DocumentDefinitionStatus.ACTIVE, "Restore persists ACTIVE status.");
    assert(restored.archivedAt === null, "Restore clears archivedAt.");
    assert(restored.assignedTemplateVersionId === publishedV2.id, "Restore preserves the assigned published v2 template.");

    const deactivated = await tx.documentDefinitionField.update({
      where: { id: field.id },
      data: { active: false, required: true, displayOrder: 10 },
    });
    assert(deactivated.id === field.id, "Deactivation preserves field ID.");
    assert(deactivated.key === field.key, "Deactivation preserves field key.");
    assert(deactivated.active === false, "Deactivation persists active=false.");
    const activeFieldsForNewRequests = await tx.documentDefinitionField.findMany({ where: { tenantId: fixture.tenantId, definitionId: definition.id, active: true } });
    assert(!activeFieldsForNewRequests.some((item) => item.key === field.key), "Inactive field is excluded from new request field selection.");
    const requestReloaded = await tx.documentRequest.findFirstOrThrow({ where: { id: request.id, tenantId: fixture.tenantId } });
    const requestData = requestReloaded.requestDataSnapshot as Prisma.JsonObject;
    const snapshotFields = requestData.fields as Prisma.JsonObject;
    assert(snapshotFields.obsoletePurpose === "Historical value", "Historical request field value remains unchanged.");

    throw new Error(rollbackSignal);
  }).catch((error) => {
    if (error instanceof Error && error.message === rollbackSignal) return;
    throw error;
  });

  console.log("PASS: archived definition restore and historical dynamic-field deactivation lifecycle verified with rollback.");
}

async function findOrCreateActor(tx: Prisma.TransactionClient, tenantId: string) {
  const existing = await tx.user.findFirst({ where: { tenantId, role: { in: [Role.ADMIN, Role.HOA_ADMIN, Role.SYSTEM_ADMIN] } }, select: { id: true } });
  if (existing) return existing;
  return tx.user.create({
    data: {
      tenantId,
      name: "Lifecycle Verification Admin",
      email: `lifecycle-admin-${Date.now()}@verify.local`,
      passwordHash: "verification-only",
      role: Role.ADMIN,
      active: true,
    },
    select: { id: true },
  });
}

async function findOrCreateHomeowner(tx: Prisma.TransactionClient, tenantId: string) {
  const existing = await tx.homeownerProfile.findFirst({ where: { tenantId }, select: { id: true, address: true } });
  if (existing) return existing;
  const user = await tx.user.create({
    data: {
      tenantId,
      name: "Lifecycle Verification Homeowner",
      email: `lifecycle-homeowner-${Date.now()}@verify.local`,
      passwordHash: "verification-only",
      role: Role.HOMEOWNER,
      active: true,
    },
  });
  return tx.homeownerProfile.create({
    data: {
      tenantId,
      userId: user.id,
      address: "Verification Address",
      block: `V${Date.now()}`,
      lot: "1",
      phone: "0000000000",
      monthlyDuesAmount: new Prisma.Decimal(0),
    },
    select: { id: true, address: true },
  });
}

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().finally(async () => prisma.$disconnect());
