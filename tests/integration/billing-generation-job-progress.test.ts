import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  BillingGenerationMode,
  BillingGenerationJobStatus,
  HomeownerStatus,
  Prisma,
  RecurringChargeType,
  Role,
  TenantModule,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import {
  billingGenerationProgressPercent,
  createBillingGenerationJob,
  createFailedBillingGenerationRetry,
  getBillingGenerationJobView,
  processBillingGenerationJob,
} from "@/lib/services/billing-generation-jobs";
import { runWithTenant } from "@/lib/tenant-context";

const runId = `billing-job-progress-${process.pid}`;
const tenantId = `${runId}-tenant`;
const isolationTenantId = `${runId}-isolation`;
const actorId = `${runId}-actor`;
const isolationActorId = `${runId}-isolation-actor`;
const ruleId = `${runId}-rule`;
const billingYear = 2095;
const homeownerCount = 4;

const actor = {
  id: actorId,
  tenantId,
  name: "Billing Progress Manager",
  email: `${runId}-actor@example.invalid`,
};

function userId(index: number) {
  return `${runId}-user-${index}`;
}

function homeownerId(index: number) {
  return `${runId}-homeowner-${index}`;
}

function withBillingTenant<T>(callback: () => T) {
  return runWithTenant(tenantId, callback, {
    role: Role.BILLING_MANAGER,
    enabledModules: [TenantModule.BILLING],
  });
}

async function cleanFixtures() {
  const tenantIds = [tenantId, isolationTenantId];
  await platformPrisma.billingGenerationJobItem.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.billingGenerationJob.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.notificationLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.bill.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.duesExemption.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.billingRule.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.homeownerProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenantModuleEntitlement.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

before(async () => {
  await cleanFixtures();
  await platformPrisma.tenant.createMany({
    data: [
      { id: tenantId, name: "Billing Job Progress Tenant", shortName: "BJPT", slug: `${runId}-tenant` },
      { id: isolationTenantId, name: "Billing Job Isolation Tenant", shortName: "BJPI", slug: `${runId}-isolation` },
    ],
  });
  await platformPrisma.tenantModuleEntitlement.createMany({
    data: [
      { tenantId, module: TenantModule.BILLING, enabled: true },
      { tenantId: isolationTenantId, module: TenantModule.BILLING, enabled: true },
    ],
  });
  await platformPrisma.user.createMany({
    data: [
      { id: actorId, tenantId, name: actor.name, email: actor.email, passwordHash: "integration-test-only", role: Role.BILLING_MANAGER },
      { id: isolationActorId, tenantId: isolationTenantId, name: "Isolation Billing Manager", email: `${runId}-isolation@example.invalid`, passwordHash: "integration-test-only", role: Role.BILLING_MANAGER },
      ...Array.from({ length: homeownerCount }, (_, offset) => ({
        id: userId(offset + 1),
        tenantId,
        name: `Billing Job Homeowner ${offset + 1}`,
        email: `${runId}-homeowner-${offset + 1}@example.invalid`,
        passwordHash: "integration-test-only",
        role: Role.HOMEOWNER,
      })),
    ],
  });
  await platformPrisma.homeownerProfile.createMany({
    data: Array.from({ length: homeownerCount }, (_, offset) => ({
      id: homeownerId(offset + 1),
      tenantId,
      userId: userId(offset + 1),
      address: `${offset + 1} Durable Progress Street`,
      block: "DP",
      lot: String(offset + 1),
      phone: `0999000000${offset + 1}`,
      accountNumber: `6${String(offset + 1).padStart(10, "0")}`,
      monthlyDuesAmount: new Prisma.Decimal("125.00"),
      status: HomeownerStatus.ACTIVE,
    })),
  });
  await platformPrisma.billingRule.create({
    data: {
      id: ruleId,
      tenantId,
      recurringChargeType: RecurringChargeType.MONTHLY_DUES,
      amount: new Prisma.Decimal("125.00"),
      generationMode: BillingGenerationMode.MANUAL,
      billingDay: 1,
      dueDay: 15,
      effectiveStartYear: billingYear,
      effectiveStartMonth: 1,
      resolutionReference: "DURABLE-PROGRESS-2095-001",
      createdById: actorId,
      updatedById: actorId,
    },
  });
});

after(async () => {
  await cleanFixtures();
  await platformPrisma.$disconnect();
});

test("billing generation jobs persist truthful counts and collapse duplicate submissions by idempotency key", async () => {
  assert.equal(billingGenerationProgressPercent(2, 3), 66);
  assert.equal(billingGenerationProgressPercent(0, 0), 100);

  const idempotencyKey = `${runId}-month-1-request-0001`;
  const first = await withBillingTenant(() => createBillingGenerationJob({
    actor,
    coverageYear: billingYear,
    coverageMonth: 1,
    scope: "ALL",
  }, idempotencyKey));
  const duplicate = await withBillingTenant(() => createBillingGenerationJob({
    actor,
    coverageYear: billingYear,
    coverageMonth: 1,
    scope: "ALL",
  }, idempotencyKey));

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.job.id, first.job.id);
  assert.equal(await platformPrisma.billingGenerationJob.count({ where: { tenantId } }), 1);
  assert.equal(await platformPrisma.billingGenerationJobItem.count({ where: { tenantId, jobId: first.job.id } }), homeownerCount);

  const stored = await platformPrisma.billingGenerationJob.findUniqueOrThrow({ where: { id: first.job.id } });
  assert.notEqual(stored.idempotencyKeyHash, idempotencyKey, "Raw idempotency keys must never be stored.");
  assert.equal(stored.idempotencyKeyHash.length, 64);

  const completed = await withBillingTenant(() => processBillingGenerationJob(first.job.id, actor));
  assert.ok(completed);
  assert.equal(completed?.status, BillingGenerationJobStatus.SUCCEEDED);
  assert.equal(completed?.total, homeownerCount);
  assert.equal(completed?.completed, homeownerCount);
  assert.equal(completed?.succeeded, homeownerCount);
  assert.equal(completed?.failed, 0);
  assert.equal(completed?.percent, 100);
  assert.equal(await platformPrisma.bill.count({ where: { tenantId, coverageYear: billingYear, coverageMonth: 1 } }), homeownerCount);

  const hiddenFromOtherTenant = await runWithTenant(isolationTenantId, () => getBillingGenerationJobView(first.job.id, isolationTenantId), {
    role: Role.BILLING_MANAGER,
    enabledModules: [TenantModule.BILLING],
  });
  assert.equal(hiddenFromOtherTenant, null, "A billing job must never be readable from another tenant context.");
});

test("failed-only retry creates a new job containing only failed homeowner records", async () => {
  const source = await withBillingTenant(() => createBillingGenerationJob({
    actor,
    coverageYear: billingYear,
    coverageMonth: 2,
    scope: "ALL",
  }, `${runId}-month-2-request-0001`));
  assert.equal(source.job.total, homeownerCount);

  await platformPrisma.homeownerProfile.update({ where: { id: homeownerId(homeownerCount) }, data: { status: HomeownerStatus.INACTIVE } });
  const partial = await withBillingTenant(() => processBillingGenerationJob(source.job.id, actor));
  assert.ok(partial);
  assert.equal(partial?.status, BillingGenerationJobStatus.PARTIAL);
  assert.equal(partial?.completed, homeownerCount);
  assert.equal(partial?.succeeded, homeownerCount - 1);
  assert.equal(partial?.failed, 1);
  assert.equal(partial?.percent, 100);

  await platformPrisma.homeownerProfile.update({ where: { id: homeownerId(homeownerCount) }, data: { status: HomeownerStatus.ACTIVE } });
  const retryKey = `${runId}-month-2-retry-0001`;
  const retry = await withBillingTenant(() => createFailedBillingGenerationRetry({
    actor,
    sourceJobId: source.job.id,
    idempotencyKey: retryKey,
  }));
  const duplicateRetry = await withBillingTenant(() => createFailedBillingGenerationRetry({
    actor,
    sourceJobId: source.job.id,
    idempotencyKey: retryKey,
  }));

  assert.equal(retry.job.total, 1);
  assert.equal(retry.job.retryOfJobId, source.job.id);
  assert.equal(duplicateRetry.job.id, retry.job.id);
  assert.equal(await platformPrisma.billingGenerationJobItem.count({ where: { tenantId, jobId: retry.job.id } }), 1);

  const retried = await withBillingTenant(() => processBillingGenerationJob(retry.job.id, actor));
  assert.equal(retried?.status, BillingGenerationJobStatus.SUCCEEDED);
  assert.equal(retried?.total, 1);
  assert.equal(retried?.succeeded, 1);
  assert.equal(retried?.failed, 0);
  assert.equal(await platformPrisma.bill.count({ where: { tenantId, coverageYear: billingYear, coverageMonth: 2 } }), homeownerCount);
});
