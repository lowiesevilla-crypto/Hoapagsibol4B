import { PrismaClient, TenantModule } from "@prisma/client";

const prisma = new PrismaClient();
const primaryTenantId = "tenant_pagsibol4b_default";

function assertSafeDatabase() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error("Plan-authority E2E finalization is restricted to CI or an explicitly allowed disposable local database.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for plan-authority E2E finalization.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing plan-authority E2E finalization against non-disposable database host: ${host}`);
  }
}

async function main() {
  assertSafeDatabase();

  // The AI fixture intentionally creates the newest subscription so the AI
  // commercial path can be exercised. Under the production control-plane model,
  // that newest subscription is also the tenant's authoritative module plan.
  // Make the disposable browser plan a real full-suite plan rather than relying
  // on stale TenantModuleEntitlement rows that production no longer trusts.
  const subscription = await prisma.tenantSubscription.findFirst({
    where: { tenantId: primaryTenantId },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, planId: true },
  });
  if (!subscription) throw new Error("Primary E2E tenant does not have an authoritative subscription plan.");

  await prisma.tenantSubscription.update({
    where: { id: subscription.id },
    data: { status: "ACTIVE" },
  });
  await prisma.subscriptionPlan.update({
    where: { id: subscription.planId },
    data: { active: true },
  });

  for (const tenantModule of Object.values(TenantModule)) {
    await prisma.subscriptionPlanModule.upsert({
      where: { planId_module: { planId: subscription.planId, module: tenantModule } },
      update: { enabled: true },
      create: { planId: subscription.planId, module: tenantModule, enabled: true },
    });
  }

  await prisma.subscriptionPlanFeatureEntitlement.upsert({
    where: {
      planId_featureCode: {
        planId: subscription.planId,
        featureCode: "DOCUMENT_MANAGEMENT",
      },
    },
    update: {
      enabled: true,
      storageLimitMb: 100,
      maxFileSizeMb: 25,
      retainRevisionBinaries: true,
      maxRevisionBinaries: 5,
    },
    create: {
      planId: subscription.planId,
      featureCode: "DOCUMENT_MANAGEMENT",
      enabled: true,
      storageLimitMb: 100,
      maxFileSizeMb: 25,
      retainRevisionBinaries: true,
      maxRevisionBinaries: 5,
    },
  });

  console.log(`Plan-authority E2E fixtures finalized on plan ${subscription.planId}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
