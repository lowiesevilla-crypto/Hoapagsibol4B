import {
  DocumentDefinitionStatus,
  DocumentDeliveryMode,
  DocumentFieldType,
  DocumentOutstandingBalancePolicy,
  DocumentSequenceScope,
  DocumentTemplateVersionStatus,
  DocumentType,
  Prisma,
  PrismaClient,
  Role,
} from "@prisma/client";
import {
  defaultTemplateDefinition,
  documentTemplateSchemaVersion,
} from "@/lib/services/document-template-builder";
import { defaultNumberingFormat } from "@/lib/services/document-definitions";

const prisma = new PrismaClient();

const tenantId = "tenant_pagsibol4b_default";
const primaryHomeownerId = "e2e_browser_homeowner";
const definitionId = "e2e_browser_document_workflow_definition";
const definitionFieldId = "e2e_browser_document_workflow_purpose";
const templateSetId = "e2e_browser_document_workflow_template_set";
const templateVersionId = "e2e_browser_document_workflow_template_version";
const requestPurpose = "E2E homeowner approval and generated document";

function assertSafeDatabase() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error(
      "Document workflow fixtures are restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.",
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for document workflow fixtures.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing document workflow fixture operations against non-disposable host: ${host}`);
  }
}

async function removeFixtures() {
  const requests = await prisma.documentRequest.findMany({
    where: {
      tenantId,
      OR: [
        { definitionId },
        { purpose: requestPurpose },
      ],
    },
    select: { id: true },
  });
  const requestIds = requests.map((request) => request.id);
  const versions = requestIds.length
    ? await prisma.documentVersion.findMany({
        where: { tenantId, requestId: { in: requestIds } },
        select: { id: true },
      })
    : [];
  const versionIds = versions.map((version) => version.id);

  if (requestIds.length) {
    await prisma.documentVerificationToken.deleteMany({
      where: { tenantId, requestId: { in: requestIds } },
    });
    await prisma.documentGenerationAttempt.deleteMany({
      where: { tenantId, requestId: { in: requestIds } },
    });
    await prisma.documentRequestEditAudit.deleteMany({
      where: { tenantId, requestId: { in: requestIds } },
    });
    await prisma.documentRequestHistory.deleteMany({
      where: { tenantId, requestId: { in: requestIds } },
    });
    await prisma.documentVersion.deleteMany({
      where: { tenantId, requestId: { in: requestIds } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        tenantId,
        entityId: { in: [...requestIds, ...versionIds] },
      },
    });
    await prisma.documentRequest.deleteMany({
      where: { tenantId, id: { in: requestIds } },
    });
  }

  await prisma.documentDefinition.updateMany({
    where: { tenantId, id: definitionId },
    data: { assignedTemplateVersionId: null },
  });
  await prisma.documentDefinitionCounter.deleteMany({
    where: { tenantId, definitionId },
  });
  await prisma.documentDefinitionField.deleteMany({
    where: { tenantId, definitionId },
  });
  await prisma.documentTemplateVersion.deleteMany({
    where: { tenantId, templateSetId },
  });
  await prisma.documentTemplateSet.deleteMany({
    where: { tenantId, id: templateSetId },
  });
  await prisma.auditLog.deleteMany({
    where: {
      tenantId,
      entityId: { in: [definitionId, definitionFieldId, templateSetId, templateVersionId] },
    },
  });
  await prisma.documentDefinition.deleteMany({
    where: { tenantId, id: definitionId },
  });
}

async function setup() {
  assertSafeDatabase();
  const administratorEmail = process.env.SEED_SYSTEM_ADMIN_EMAIL?.trim().toLowerCase();
  if (!administratorEmail) throw new Error("SEED_SYSTEM_ADMIN_EMAIL is required for document workflow fixtures.");

  const [administrator, homeowner] = await Promise.all([
    prisma.user.findFirst({
      where: { tenantId, email: administratorEmail, role: Role.SYSTEM_ADMIN, active: true },
    }),
    prisma.homeownerProfile.findFirst({
      where: { tenantId, id: primaryHomeownerId, user: { role: Role.HOMEOWNER, active: true } },
      include: { user: true },
    }),
  ]);
  if (!administrator) throw new Error("The seeded system administrator was not found.");
  if (!homeowner) throw new Error("The primary critical-path homeowner fixture was not found.");

  await removeFixtures();

  await prisma.documentDefinition.create({
    data: {
      id: definitionId,
      tenantId,
      code: "E2E_CLEARANCE_CERTIFICATE",
      displayName: "E2E Clearance Certificate",
      description: "Disposable approval-required definition for the production browser suite.",
      category: "E2E Testing",
      status: DocumentDefinitionStatus.ACTIVE,
      active: true,
      displayOrder: -100,
      legacyType: DocumentType.CLEARANCE_CERTIFICATE,
      deliveryMode: DocumentDeliveryMode.APPROVAL_REQUIRED,
      approvalRequired: true,
      paymentRequired: false,
      paymentBeforeApproval: false,
      allowImmediateDownload: false,
      requiresAdminReview: true,
      releaseRequired: false,
      homeownerDownloadEnabled: true,
      walkInEnabled: false,
      householdMemberEnabled: false,
      manualSubjectEnabled: false,
      allowRegeneration: true,
      allowPayLater: false,
      feeAmount: 0,
      receiptRequired: false,
      numberingFormat: defaultNumberingFormat("E2E"),
      sequenceScope: DocumentSequenceScope.ANNUAL,
      maxCopies: 3,
      qrEnabled: true,
      outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE,
      createdById: administrator.id,
      updatedById: administrator.id,
    },
  });

  await prisma.documentDefinitionField.create({
    data: {
      id: definitionFieldId,
      tenantId,
      definitionId,
      key: "purpose",
      label: "Purpose",
      fieldType: DocumentFieldType.TEXTAREA,
      required: true,
      active: true,
      displayOrder: 1,
      options: [],
      validation: { minLength: 3, maxLength: 500 },
    },
  });

  await prisma.documentTemplateSet.create({
    data: {
      id: templateSetId,
      tenantId,
      definitionId,
      name: "E2E Clearance Certificate Template",
      description: "Disposable published template for the browser workflow test.",
      active: true,
    },
  });

  const definitionJson = JSON.parse(
    JSON.stringify(defaultTemplateDefinition("E2E Clearance Certificate")),
  ) as Prisma.InputJsonValue;
  await prisma.documentTemplateVersion.create({
    data: {
      id: templateVersionId,
      tenantId,
      templateSetId,
      version: 1,
      status: DocumentTemplateVersionStatus.PUBLISHED,
      schemaVersion: documentTemplateSchemaVersion,
      definitionJson,
      publishedAt: new Date(),
      publishedById: administrator.id,
      createdById: administrator.id,
    },
  });

  await prisma.documentDefinition.update({
    where: { id: definitionId },
    data: { assignedTemplateVersionId: templateVersionId },
  });

  console.log("Document workflow browser fixtures prepared.");
  console.log(`Definition: ${definitionId}`);
  console.log(`Homeowner: ${homeowner.user.email}`);
}

async function cleanup() {
  assertSafeDatabase();
  await removeFixtures();
  console.log("Document workflow browser fixtures removed.");
}

const operation = process.argv[2] || "setup";

(operation === "cleanup" ? cleanup() : setup())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
