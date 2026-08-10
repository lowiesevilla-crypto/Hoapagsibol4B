import { AiRequestOutcome, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const primaryTenantId = "tenant_pagsibol4b_default";
const secondaryTenantId = "tenant_e2e_browser_isolation";
const primaryHomeownerUserId = "e2e_browser_homeowner_user";
const secondaryHomeownerUserId = "e2e_browser_other_user";
const categoryId = "e2e_ai_category";
const documentId = "e2e_ai_primary_policy";
const secondaryConversationId = "e2e_ai_secondary_conversation";
const providerFileId = "file_hoahub_ci_policy";
const primaryVectorStoreId = "vs_mock_e2e_primary_tenant";
const secondaryVectorStoreId = "vs_mock_e2e_secondary_tenant";
const aiPlanId = "e2e_ai_subscription_plan";
const aiPlanCode = "E2E_AI_BROWSER_PLAN";
const aiSubscriptionId = "e2e_ai_primary_subscription";

function assertSafeDatabase() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) throw new Error("AI browser fixtures are restricted to CI or an explicitly allowed disposable local database.");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for AI browser fixtures.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) throw new Error(`Refusing AI fixtures against non-disposable database host: ${host}`);
}

async function cleanup() {
  assertSafeDatabase();
  await prisma.aiFeedback.deleteMany({ where: { tenantId: { in: [primaryTenantId, secondaryTenantId] } } });
  await prisma.aiMessage.deleteMany({ where: { tenantId: { in: [primaryTenantId, secondaryTenantId] } } });
  await prisma.aiConversation.deleteMany({ where: { tenantId: { in: [primaryTenantId, secondaryTenantId] } } });
  await prisma.aiUsageLedger.deleteMany({ where: { tenantId: { in: [primaryTenantId, secondaryTenantId] } } });
  await prisma.aiKnowledgeBinding.deleteMany({ where: { tenantId: { in: [primaryTenantId, secondaryTenantId] } } });
  await prisma.tenantAiProviderIndex.deleteMany({ where: { tenantId: { in: [primaryTenantId, secondaryTenantId] } } });
  await prisma.tenantAiConfiguration.deleteMany({ where: { tenantId: { in: [primaryTenantId, secondaryTenantId] } } });
  await prisma.repositoryDocument.deleteMany({ where: { tenantId: primaryTenantId, id: documentId } });
  await prisma.repositoryDocumentCategory.deleteMany({ where: { tenantId: primaryTenantId, id: categoryId } });
  await prisma.tenantFeatureEntitlement.deleteMany({
    where: {
      tenantId: { in: [primaryTenantId, secondaryTenantId] },
      featureCode: { in: ["AI_ASSISTANCE", "DOCUMENT_MANAGEMENT"] },
    },
  });
  await prisma.tenantSubscription.deleteMany({ where: { id: aiSubscriptionId } });
  await prisma.subscriptionPlanFeatureEntitlement.deleteMany({ where: { planId: aiPlanId } });
  await prisma.subscriptionPlanModule.deleteMany({ where: { planId: aiPlanId } });
  await prisma.subscriptionPlan.deleteMany({ where: { id: aiPlanId } });
}

async function setup() {
  assertSafeDatabase();
  await cleanup();
  const [primaryTenant, secondaryTenant, admin, primaryHomeowner, secondaryHomeowner] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: primaryTenantId }, select: { id: true } }),
    prisma.tenant.findUnique({ where: { id: secondaryTenantId }, select: { id: true } }),
    prisma.user.findFirst({ where: { tenantId: primaryTenantId, role: "SYSTEM_ADMIN", active: true }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: primaryHomeownerUserId }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: secondaryHomeownerUserId }, select: { id: true } }),
  ]);
  if (!primaryTenant || !secondaryTenant || !admin || !primaryHomeowner || !secondaryHomeowner) throw new Error("Critical browser fixtures must be prepared before AI browser fixtures.");

  // Exercise the real commercial-entitlement path without relying on seed-plan
  // state. This plan/subscription exists only inside the disposable E2E database
  // and is removed by cleanup. Existing tenant module entitlements remain the
  // source of normal portal navigation, so non-AI browser scenarios are unchanged.
  await prisma.subscriptionPlan.create({
    data: {
      id: aiPlanId,
      code: aiPlanCode,
      name: "Disposable AI Browser UAT Plan",
      description: "CI-only plan for authenticated AI commercial entitlement tests.",
      active: true,
      currency: "PHP",
      monthlyPrice: 0,
      trialDays: 0,
    },
  });
  await prisma.subscriptionPlanFeatureEntitlement.create({
    data: {
      planId: aiPlanId,
      featureCode: "AI_ASSISTANCE",
      enabled: true,
      configuration: {
        monthlyRequestLimit: 20,
        monthlyInputTokenLimit: 100000,
        monthlyOutputTokenLimit: 100000,
        requestsPerMinute: 50,
        modelTier: "STANDARD",
        overagePolicy: "HARD_STOP",
      },
    },
  });
  await prisma.tenantSubscription.create({
    data: {
      id: aiSubscriptionId,
      tenantId: primaryTenantId,
      planId: aiPlanId,
      status: "ACTIVE",
      billingFrequency: "MONTHLY",
      startedAt: new Date("2099-01-01T00:00:00.000Z"),
      agreedPrice: 0,
      currency: "PHP",
      autoRenew: false,
    },
  });

  await prisma.tenantFeatureEntitlement.create({
    data: {
      tenantId: primaryTenantId,
      featureCode: "AI_ASSISTANCE",
      enabledOverride: true,
      configurationOverride: {
        monthlyRequestLimit: 20,
        monthlyInputTokenLimit: 100000,
        monthlyOutputTokenLimit: 100000,
        requestsPerMinute: 50,
        modelTier: "STANDARD",
        overagePolicy: "HARD_STOP",
      },
      updatedById: admin.id,
    },
  });
  await prisma.tenantFeatureEntitlement.create({
    data: {
      tenantId: primaryTenantId,
      featureCode: "DOCUMENT_MANAGEMENT",
      enabledOverride: true,
      storageLimitMbOverride: 50,
      maxFileSizeMbOverride: 5,
      retainRevisionBinariesOverride: true,
      maxRevisionBinariesOverride: 2,
      updatedById: admin.id,
    },
  });

  const approval = new Date("2026-08-10T00:00:00.000Z");
  await prisma.tenantAiConfiguration.create({
    data: {
      tenantId: primaryTenantId,
      runtimeEnabled: true,
      residentAssistantEnabled: true,
      staffCopilotEnabled: true,
      documentRequestActionsEnabled: false,
      boardApprovedAt: approval,
      piaApprovedAt: approval,
      dpoApprovedAt: approval,
      providerApprovedAt: approval,
      crossBorderReviewApprovedAt: approval,
      privacyNoticeVersion: "E2E-AI-PRIVACY-v1",
      privacyNoticePublishedAt: approval,
      lawfulBasis: "E2E approved lawful-basis evidence reference",
      retentionDays: 30,
      dataSubjectRightsContact: "e2e-dpo@example.invalid",
      approvedById: admin.id,
      updatedById: admin.id,
    },
  });
  await prisma.tenantAiProviderIndex.create({ data: { tenantId: primaryTenantId, vectorStoreId: primaryVectorStoreId, createdById: admin.id } });
  await prisma.tenantAiProviderIndex.create({ data: { tenantId: secondaryTenantId, vectorStoreId: secondaryVectorStoreId } });

  await prisma.repositoryDocumentCategory.create({
    data: { id: categoryId, tenantId: primaryTenantId, code: "E2E_AI_POLICY", name: "E2E AI Policy", categoryGroup: "POLICIES", description: "Disposable approved AI browser source.", active: true, governanceControlled: true, createdById: admin.id },
  });
  await prisma.repositoryDocument.create({
    data: {
      id: documentId,
      tenantId: primaryTenantId,
      categoryId,
      title: "E2E Primary Tenant AI Policy",
      description: "Approved resident-facing policy used only by the AI browser suite.",
      documentReference: "E2E-AI-RES-001",
      visibility: "TENANT_PUBLIC",
      status: "PUBLISHED",
      revisionPolicy: "KEEP_HISTORY",
      originalFileName: "e2e-primary-ai-policy.txt",
      storageKey: "tenants/pagsibol-village-east-4b/documents/repository/e2e/e2e-primary-ai-policy.txt",
      contentType: "text/plain",
      fileExtension: "txt",
      fileSizeBytes: BigInt(128),
      checksumSha256: "a".repeat(64),
      malwareScanStatus: "NOT_CONFIGURED",
      aiEnabled: true,
      privacyClassification: "PUBLIC",
      issuingBody: "E2E HOA Board",
      approvalDate: approval,
      effectiveAt: approval,
      publishedAt: approval,
      uploadedById: admin.id,
      updatedById: admin.id,
    },
  });
  await prisma.aiKnowledgeBinding.create({
    data: { tenantId: primaryTenantId, documentId, revision: 1, providerFileId, vectorStoreId: primaryVectorStoreId, indexStatus: "INDEXED", indexedChecksumSha256: "a".repeat(64), indexedAt: approval, createdById: admin.id, updatedById: admin.id },
  });

  await prisma.aiConversation.create({
    data: { id: secondaryConversationId, tenantId: secondaryTenantId, actorId: secondaryHomeownerUserId, actorRole: "HOMEOWNER", expiresAt: new Date(Date.now() + 86_400_000) },
  });

  await prisma.aiUsageLedger.createMany({
    data: Array.from({ length: 25 }, (_, index) => ({ tenantId: secondaryTenantId, actorId: secondaryHomeownerUserId, requestId: `e2e-secondary-quota-${index}`, outcome: AiRequestOutcome.SUCCEEDED, inputTokens: 100, outputTokens: 100 })),
  });
}

async function main() {
  const mode = process.argv[2];
  if (mode === "setup") await setup();
  else if (mode === "cleanup") await cleanup();
  else throw new Error("Usage: tsx scripts/prepare-ai-assistant-e2e.ts <setup|cleanup>");
}

main().finally(() => prisma.$disconnect());
