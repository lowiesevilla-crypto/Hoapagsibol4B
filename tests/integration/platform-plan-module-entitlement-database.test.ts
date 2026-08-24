import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { TenantModule } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { getEnabledTenantModules } from "@/lib/tenant";

const runId = `platform-plan-modules-it-${process.pid}`;
const tenantAId = `${runId}-tenant-a`;
const tenantBId = `${runId}-tenant-b`;
const planId = `${runId}-plan`;
const planCode = `${runId}-PLAN`;
const tenantIds = [tenantAId, tenantBId];

async function cleanup() {
  await platformPrisma.tenantModuleEntitlement.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.subscriptionPlanModule.deleteMany({ where: { planId } });
  await platformPrisma.subscriptionPlan.deleteMany({ where: { id: planId } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

before(async () => {
  await cleanup();
  await platformPrisma.subscriptionPlan.create({
    data: {
      id: planId,
      code: planCode,
      name: "Platform Module Authority Integration Plan",
      active: true,
      modules: {
        create: [
          { module: TenantModule.BILLING, enabled: true },
          { module: TenantModule.DOCUMENTS, enabled: true },
        ],
      },
    },
  });
  await platformPrisma.tenant.createMany({ data: [
    { id: tenantAId, name: "Module Tenant A", shortName: "MOD-A", slug: `${runId}-a`, subscriptionPlan: planCode },
    { id: tenantBId, name: "Module Tenant B", shortName: "MOD-B", slug: `${runId}-b`, subscriptionPlan: planCode },
  ] });
  await platformPrisma.tenantSubscription.createMany({ data: [
    { tenantId: tenantAId, planId, status: "ACTIVE" },
    { tenantId: tenantBId, planId, status: "SUSPENDED" },
  ] });

  // Deliberately stale/contradictory legacy tenant rows. Runtime must ignore
  // these as commercial grants and follow the active plan instead.
  await platformPrisma.tenantModuleEntitlement.createMany({ data: [
    { tenantId: tenantAId, module: TenantModule.BILLING, enabled: false },
    { tenantId: tenantAId, module: TenantModule.CHAT, enabled: true },
    { tenantId: tenantBId, module: TenantModule.CHAT, enabled: true },
  ] });
});

after(cleanup);

test("tenant runtime modules come from the active Platform Admin plan, not stale tenant rows", async () => {
  const enabled = await getEnabledTenantModules(tenantAId);
  assert.deepEqual([...enabled].sort(), [TenantModule.BILLING, TenantModule.DOCUMENTS].sort());
  assert.equal(enabled.has(TenantModule.CHAT), false);
});

test("commercially blocked subscription exposes no tenant modules even when stale rows say enabled", async () => {
  const enabled = await getEnabledTenantModules(tenantBId);
  assert.equal(enabled.size, 0);
});
