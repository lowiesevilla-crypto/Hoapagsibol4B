import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Role } from "@prisma/client";
import { AI_ASSISTANCE_FEATURE_CODE } from "@/lib/ai-assistance/commercial";
import { resolveAiAssistanceEntitlement } from "@/lib/ai-assistance/entitlement";
import { platformPrisma } from "@/lib/db";
import { runWithTenant } from "@/lib/tenant-context";

const runId = `ai-commercial-it-${process.pid}`;
const tenantAId = `${runId}-tenant-a`;
const tenantBId = `${runId}-tenant-b`;
const tenantCId = `${runId}-tenant-c`;
const planId = `${runId}-plan`;
const planCode = `${runId}-PLAN`;
const excludedPlanId = `${runId}-excluded-plan`;
const excludedPlanCode = `${runId}-EXCLUDED`;
const tenantIds = [tenantAId, tenantBId, tenantCId];
const planIds = [planId, excludedPlanId];

function inTenant<T>(tenantId: string, callback: () => T) {
  return runWithTenant(tenantId, callback, { role: Role.HOA_ADMIN });
}

async function cleanup() {
  await platformPrisma.tenantFeatureEntitlement.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.subscriptionPlanFeatureEntitlement.deleteMany({ where: { planId: { in: planIds } } });
  await platformPrisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

before(async () => {
  await cleanup();
  await platformPrisma.subscriptionPlan.createMany({
    data: [
      { id: planId, code: planCode, name: "AI Commercial Integration Plan", active: true },
      { id: excludedPlanId, code: excludedPlanCode, name: "AI Excluded Integration Plan", active: true },
    ],
  });
  await platformPrisma.tenant.createMany({ data: [
    { id: tenantAId, name: "AI Tenant A", shortName: "AI-A", slug: `${runId}-a`, subscriptionPlan: planCode },
    { id: tenantBId, name: "AI Tenant B", shortName: "AI-B", slug: `${runId}-b`, subscriptionPlan: planCode },
    { id: tenantCId, name: "AI Tenant C", shortName: "AI-C", slug: `${runId}-c`, subscriptionPlan: excludedPlanCode },
  ] });
  await platformPrisma.tenantSubscription.createMany({ data: [
    { tenantId: tenantAId, planId, status: "ACTIVE" },
    { tenantId: tenantBId, planId, status: "ACTIVE" },
    { tenantId: tenantCId, planId: excludedPlanId, status: "ACTIVE" },
  ] });
  await platformPrisma.subscriptionPlanFeatureEntitlement.createMany({ data: [
    {
      planId,
      featureCode: AI_ASSISTANCE_FEATURE_CODE,
      enabled: true,
      configuration: { monthlyRequestLimit: 1000, requestsPerMinute: 10, modelTier: "STANDARD", overagePolicy: "HARD_STOP" },
    },
    {
      planId: excludedPlanId,
      featureCode: AI_ASSISTANCE_FEATURE_CODE,
      enabled: false,
      configuration: { monthlyRequestLimit: 100, requestsPerMinute: 5, modelTier: "ECONOMY", overagePolicy: "HARD_STOP" },
    },
  ] });
  await platformPrisma.tenantFeatureEntitlement.createMany({ data: [
    { tenantId: tenantAId, featureCode: AI_ASSISTANCE_FEATURE_CODE, configurationOverride: { monthlyRequestLimit: 250 } },
    { tenantId: tenantBId, featureCode: AI_ASSISTANCE_FEATURE_CODE, enabledOverride: false },
    // Simulate a legacy/manual true override. Runtime must still refuse elevation
    // when the active plan excludes the capability.
    { tenantId: tenantCId, featureCode: AI_ASSISTANCE_FEATURE_CODE, enabledOverride: true },
  ] });
});

after(cleanup);

test("AI commercial limits inherit plan values and merge only the active tenant override", async () => {
  await inTenant(tenantAId, async () => {
    const entitlement = await resolveAiAssistanceEntitlement();
    assert.equal(entitlement.enabled, true);
    assert.equal(entitlement.configuration.monthlyRequestLimit, 250);
    assert.equal(entitlement.configuration.requestsPerMinute, 10);
    assert.equal(entitlement.configuration.modelTier, "STANDARD");
  });
});

test("tenant-specific AI disablement cannot be bypassed by the plan", async () => {
  await inTenant(tenantBId, async () => {
    const entitlement = await resolveAiAssistanceEntitlement();
    assert.equal(entitlement.enabled, false);
    assert.equal(entitlement.enabledSource, "TENANT_OVERRIDE");
  });
});

test("tenant true override cannot elevate AI above an active plan that excludes it", async () => {
  await inTenant(tenantCId, async () => {
    const entitlement = await resolveAiAssistanceEntitlement();
    assert.equal(entitlement.enabled, false);
    assert.equal(entitlement.enabledSource, "DISABLED");
  });
});

test("non-platform AI entitlement lookup cannot switch tenant authority", async () => {
  await inTenant(tenantAId, async () => {
    await assert.rejects(() => resolveAiAssistanceEntitlement(tenantBId), /Cross-tenant AI entitlement lookup blocked/i);
  });
});
