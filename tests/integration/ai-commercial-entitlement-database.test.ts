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
const planId = `${runId}-plan`;
const planCode = `${runId}-PLAN`;
const tenantIds = [tenantAId, tenantBId];

function inTenant<T>(tenantId: string, callback: () => T) {
  return runWithTenant(tenantId, callback, { role: Role.HOA_ADMIN });
}

async function cleanup() {
  await platformPrisma.tenantFeatureEntitlement.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.subscriptionPlanFeatureEntitlement.deleteMany({ where: { planId } });
  await platformPrisma.subscriptionPlan.deleteMany({ where: { id: planId } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

before(async () => {
  await cleanup();
  await platformPrisma.subscriptionPlan.create({ data: { id: planId, code: planCode, name: "AI Commercial Integration Plan", active: true } });
  await platformPrisma.tenant.createMany({ data: [
    { id: tenantAId, name: "AI Tenant A", shortName: "AI-A", slug: `${runId}-a`, subscriptionPlan: planCode },
    { id: tenantBId, name: "AI Tenant B", shortName: "AI-B", slug: `${runId}-b`, subscriptionPlan: planCode },
  ] });
  await platformPrisma.tenantSubscription.createMany({ data: tenantIds.map((tenantId) => ({ tenantId, planId, status: "ACTIVE" })) });
  await platformPrisma.subscriptionPlanFeatureEntitlement.create({
    data: {
      planId,
      featureCode: AI_ASSISTANCE_FEATURE_CODE,
      enabled: true,
      configuration: { monthlyRequestLimit: 1000, requestsPerMinute: 10, modelTier: "STANDARD", overagePolicy: "HARD_STOP" },
    },
  });
  await platformPrisma.tenantFeatureEntitlement.createMany({ data: [
    { tenantId: tenantAId, featureCode: AI_ASSISTANCE_FEATURE_CODE, configurationOverride: { monthlyRequestLimit: 250 } },
    { tenantId: tenantBId, featureCode: AI_ASSISTANCE_FEATURE_CODE, enabledOverride: false },
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

test("non-platform AI entitlement lookup cannot switch tenant authority", async () => {
  await inTenant(tenantAId, async () => {
    await assert.rejects(() => resolveAiAssistanceEntitlement(tenantBId), /Cross-tenant AI entitlement lookup blocked/i);
  });
});
