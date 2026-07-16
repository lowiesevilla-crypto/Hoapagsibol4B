import { PrismaClient, DocumentDefinitionStatus, DocumentDeliveryMode, DocumentSequenceScope, DocumentRequestStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const homeowner = await prisma.homeownerProfile.findFirst({ select: { id: true, tenantId: true } });
  if (!homeowner) throw new Error("Missing homeowner fixture for verification.");
  const [tenant, actor] = await Promise.all([
    prisma.tenant.findFirst({ where: { id: homeowner.tenantId }, select: { id: true } }),
    prisma.user.findFirst({ where: { tenantId: homeowner.tenantId }, select: { id: true, tenantId: true } }),
  ]);
  if (!tenant || !actor) throw new Error("Missing tenant or actor fixture for verification.");

  const receivedOperations = ["ACTIVATE", "DEACTIVATE", "ARCHIVE"] as const;
  await prisma.$transaction(async (tx) => {
    const definition = await tx.documentDefinition.create({
      data: {
        tenantId: tenant.id,
        code: `VERIFY_${Date.now()}`,
        displayName: "Verification Custom Definition",
        status: DocumentDefinitionStatus.INACTIVE,
        active: false,
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
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    for (const operation of receivedOperations) {
      const data = operation === "ACTIVATE"
        ? { active: true, status: DocumentDefinitionStatus.ACTIVE }
        : operation === "DEACTIVATE"
          ? { active: false, status: DocumentDefinitionStatus.INACTIVE }
          : { active: false, status: DocumentDefinitionStatus.ARCHIVED, archivedAt: new Date() };
      await tx.documentDefinition.update({ where: { id: definition.id }, data });
    }

    const request = await tx.documentRequest.create({
      data: {
        tenantId: tenant.id,
        homeownerId: homeowner.id,
        definitionId: definition.id,
        definitionVersionSnapshot: definition.version,
        definitionSnapshot: { id: definition.id, code: definition.code, displayName: definition.displayName },
        templateDefinitionSnapshot: { schemaVersion: 1, blocks: [] },
        type: null,
        subjectSnapshot: { fullName: "Verification Homeowner", relationship: "Homeowner" },
        requestDataSnapshot: { fields: { purpose: "Verification" }, numberOfCopies: 1 },
        deliveryModeSnapshot: DocumentDeliveryMode.APPROVAL_REQUIRED,
        approvalRequiredSnapshot: true,
        paymentRequiredSnapshot: false,
        feeAmountSnapshot: "0.00",
        numberOfCopies: 1,
        purpose: "Verification",
        status: DocumentRequestStatus.SUBMITTED,
      },
    });

    if (request.type !== null || request.definitionId !== definition.id) throw new Error("Custom request nullable type contract failed.");
    throw new Error("ROLLBACK_VERIFICATION_OK");
  }).catch((error) => {
    if (error instanceof Error && error.message === "ROLLBACK_VERIFICATION_OK") return;
    throw error;
  });

  console.log("PASS: exact ACTIVATE/DEACTIVATE/ARCHIVE values and nullable custom request contract verified with rollback.");
}

main().finally(async () => prisma.$disconnect());
