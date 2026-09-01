import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  BillingGenerationJobStatus,
  BillingGenerationMode,
  BillStatus,
  HomeownerStatus,
  Prisma,
  RecurringChargeType,
  Role,
  TenantModule,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import {
  createBillingGenerationJob,
  getBillingGenerationJobView,
  processBillingGenerationJob,
} from "@/lib/services/billing-generation-jobs";
import { runWithTenant } from "@/lib/tenant-context";

const runId = `manual-billing-5001-${process.pid}`;
const tenantId = `${runId}-tenant`;
const isolationTenantId = `${runId}-tenant-isolation`;
const actorId = `${runId}-actor`;
const isolationActorId = `${runId}-isolation-actor`;
const ruleId = `${runId}-rule`;
const isolationRuleId = `${runId}-isolation-rule`;
const activeFixtureCount = 5_001;
const billingYear = 2096;
const billingMonth = 10;
const billingMonthDate = new Date(Date.UTC(billingYear, billingMonth - 1, 1));
const dueDate = new Date(Date.UTC(billingYear, billingMonth - 1, 15));

const actor = {
  id: actorId,
  tenantId,
  name: "Manual Billing 5001 Manager",
  email: `${runId}-actor@example.invalid`,
};

function userId(index: number) {
  return `${runId}-user-${String(index).padStart(5, "0")}`;
}

function homeownerId(index: number) {
  return `${runId}-homeowner-${String(index).padStart(5, "0")}`;
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
  await platformPrisma.duesExemption.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.bill.deleteMany({ where: { tenantId: { in: tenantIds } } });
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
      { id: tenantId, name: "Manual Billing 5001 Scale Tenant", shortName: "MB5K", slug: `${runId}-hoa` },
      { id: isolationTenantId, name: "Manual Billing Isolation Tenant", shortName: "MBISO", slug: `${runId}-isolation` },
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
      { id: isolationActorId, tenantId: isolationTenantId, name: "Isolation Billing Manager", email: `${runId}-isolation-actor@example.invalid`, passwordHash: "integration-test-only", role: Role.BILLING_MANAGER },
      { id: `${runId}-isolation-user`, tenantId: isolationTenantId, name: "Isolation Homeowner", email: `${runId}-isolation-homeowner@example.invalid`, passwordHash: "integration-test-only", role: Role.HOMEOWNER },
    ],
  });

  const users: Prisma.UserCreateManyInput[] = Array.from({ length: activeFixtureCount }, (_, offset) => {
    const index = offset + 1;
    const ordinal = String(index).padStart(5, "0");
    return {
      id: userId(index),
      tenantId,
      name: `Manual Billing Homeowner ${ordinal}`,
      email: `${runId}-${ordinal}@example.invalid`,
      passwordHash: "integration-test-only",
      role: Role.HOMEOWNER,
    };
  });
  const profiles: Prisma.HomeownerProfileCreateManyInput[] = Array.from({ length: activeFixtureCount }, (_, offset) => {
    const index = offset + 1;
    const ordinal = String(index).padStart(5, "0");
    return {
      id: homeownerId(index),
      tenantId,
      userId: userId(index),
      address: `${ordinal} Manual Billing Scale Street`,
      block: `M${String(Math.ceil(index / 100)).padStart(3, "0")}`,
      lot: ordinal,
      phone: `08${String(index).padStart(9, "0")}`,
      accountNumber: `9${String(index).padStart(10, "0")}`,
      monthlyDuesAmount: new Prisma.Decimal("125.00"),
      status: HomeownerStatus.ACTIVE,
    };
  });

  for (let offset = 0; offset < users.length; offset += 500) {
    await platformPrisma.user.createMany({ data: users.slice(offset, offset + 500) });
    await platformPrisma.homeownerProfile.createMany({ data: profiles.slice(offset, offset + 500) });
  }

  await platformPrisma.homeownerProfile.create({
    data: {
      id: `${runId}-isolation-homeowner`,
      tenantId: isolationTenantId,
      userId: `${runId}-isolation-user`,
      address: "1 Isolation Street",
      block: "ISO",
      lot: "001",
      phone: "07999999999",
      accountNumber: "69999999999",
      monthlyDuesAmount: new Prisma.Decimal("125.00"),
      status: HomeownerStatus.ACTIVE,
    },
  });

  await platformPrisma.billingRule.createMany({
    data: [
      {
        id: ruleId,
        tenantId,
        recurringChargeType: RecurringChargeType.MONTHLY_DUES,
        amount: new Prisma.Decimal("125.00"),
        generationMode: BillingGenerationMode.MANUAL,
        billingDay: 1,
        dueDay: 15,
        effectiveStartYear: billingYear,
        effectiveStartMonth: billingMonth,
        resolutionReference: "MB-5001-RES-2096-001",
        createdById: actorId,
        updatedById: actorId,
      },
      {
        id: isolationRuleId,
        tenantId: isolationTenantId,
        recurringChargeType: RecurringChargeType.MONTHLY_DUES,
        amount: new Prisma.Decimal("125.00"),
        generationMode: BillingGenerationMode.MANUAL,
        billingDay: 1,
        dueDay: 15,
        effectiveStartYear: billingYear,
        effectiveStartMonth: billingMonth,
        resolutionReference: "MB-ISO-RES-2096-001",
        createdById: isolationActorId,
        updatedById: isolationActorId,
      },
    ],
  });

  await platformPrisma.duesExemption.create({
    data: {
      id: `${runId}-exemption`,
      tenantId,
      homeownerId: homeownerId(1),
      recurringChargeType: RecurringChargeType.MONTHLY_DUES,
      billingMonth: billingMonthDate,
      startYear: billingYear,
      startMonth: billingMonth,
      endYear: billingYear,
      endMonth: billingMonth,
      reason: "Manual scale-test approved exemption",
      resolutionReference: "MB-5001-EX-001",
      createdById: actorId,
    },
  });

  await platformPrisma.bill.create({
    data: {
      id: `${runId}-preexisting-bill`,
      tenantId,
      homeownerId: homeownerId(2),
      billingMonth: billingMonthDate,
      recurringChargeType: RecurringChargeType.MONTHLY_DUES,
      coverageYear: billingYear,
      coverageMonth: billingMonth,
      billingRuleId: ruleId,
      resolutionReference: "MB-5001-RES-2096-001",
      amount: new Prisma.Decimal("125.00"),
      totalAmount: new Prisma.Decimal("125.00"),
      balance: new Prisma.Decimal("125.00"),
      dueDate,
      status: BillStatus.UNPAID,
    },
  });
});

after(async () => {
  await cleanFixtures();
  await platformPrisma.$disconnect();
});

test("manual billing durably processes 5,001 homeowners with truthful progress and duplicate protection", async () => {
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const requestKey = `${runId}-manual-all-request-0001`;
  const created = await withBillingTenant(() => createBillingGenerationJob({
    actor,
    coverageYear: billingYear,
    coverageMonth: billingMonth,
    scope: "ALL",
  }, requestKey));

  assert.equal(created.created, true);
  assert.equal(created.job.total, activeFixtureCount);
  assert.equal(created.job.completed, 2, "The pre-existing duplicate and exemption must be durably classified before processing starts.");
  assert.equal(created.job.skipped, 2);
  assert.equal(created.job.succeeded, 0);
  assert.equal(created.job.failed, 0);

  const completed = await withBillingTenant(() => processBillingGenerationJob(created.job.id, actor));
  const runtimeMs = performance.now() - startedAt;
  const heapAfter = process.memoryUsage().heapUsed;

  assert.ok(completed);
  assert.equal(completed?.status, BillingGenerationJobStatus.SUCCEEDED);
  assert.equal(completed?.total, activeFixtureCount);
  assert.equal(completed?.completed, activeFixtureCount);
  assert.equal(completed?.succeeded, 4_999);
  assert.equal(completed?.skipped, 2);
  assert.equal(completed?.failed, 0);
  assert.equal(completed?.percent, 100);
  assert.ok(runtimeMs <= 180_000, `5,001-homeowner manual billing exceeded the 180-second target: ${Math.round(runtimeMs)} ms.`);

  const [billCount, notificationCount, duplicateGroups, isolationBillCount] = await Promise.all([
    platformPrisma.bill.count({ where: { tenantId, recurringChargeType: RecurringChargeType.MONTHLY_DUES, coverageYear: billingYear, coverageMonth: billingMonth } }),
    platformPrisma.notificationLog.count({ where: { tenantId } }),
    platformPrisma.bill.groupBy({
      by: ["homeownerId", "recurringChargeType", "coverageYear", "coverageMonth"],
      where: { tenantId, coverageYear: billingYear, coverageMonth: billingMonth },
      _count: { _all: true },
      having: { id: { _count: { gt: 1 } } },
    }),
    platformPrisma.bill.count({ where: { tenantId: isolationTenantId } }),
  ]);
  assert.equal(billCount, 5_000, "One exemption remains unbilled while the pre-existing duplicate plus 4,999 newly generated bills are retained.");
  assert.equal(notificationCount, 4_999, "Only newly created manual bills receive a billing notification.");
  assert.equal(duplicateGroups.length, 0, "Manual large-batch processing must never create duplicate homeowner/charge/coverage records.");
  assert.equal(isolationBillCount, 0, "The 5,001-homeowner manual run must not contaminate another tenant.");

  const duplicateSubmission = await withBillingTenant(() => createBillingGenerationJob({
    actor,
    coverageYear: billingYear,
    coverageMonth: billingMonth,
    scope: "ALL",
  }, requestKey));
  assert.equal(duplicateSubmission.created, false);
  assert.equal(duplicateSubmission.job.id, created.job.id, "Repeated client delivery with the same idempotency key must resolve to one durable business job.");

  const repeatedManualRun = await withBillingTenant(() => createBillingGenerationJob({
    actor,
    coverageYear: billingYear,
    coverageMonth: billingMonth,
    scope: "ALL",
  }, `${runId}-manual-all-request-0002`));
  const repeatedView = await withBillingTenant(() => getBillingGenerationJobView(repeatedManualRun.job.id, tenantId));
  assert.ok(repeatedView);
  assert.equal(repeatedView?.status, BillingGenerationJobStatus.SUCCEEDED);
  assert.equal(repeatedView?.completed, activeFixtureCount);
  assert.equal(repeatedView?.succeeded, 0);
  assert.equal(repeatedView?.skipped, activeFixtureCount, "A later manual request for the same covered population must classify all existing bills/exemptions without creating duplicates.");
  assert.equal(repeatedView?.failed, 0);
  assert.equal(repeatedView?.percent, 100);
  assert.equal(await platformPrisma.bill.count({ where: { tenantId, coverageYear: billingYear, coverageMonth: billingMonth } }), billCount);
  assert.equal(await platformPrisma.notificationLog.count({ where: { tenantId } }), notificationCount, "A duplicate-only manual rerun must not send duplicate notifications.");

  console.info("[manual-billing-5001-metrics]", {
    activeHomeowners: activeFixtureCount,
    durableProcessBatchSize: 250,
    durableBatches: Math.ceil(4_999 / 250),
    runtimeMs: Math.round(runtimeMs),
    heapDeltaBytes: heapAfter - heapBefore,
    succeeded: completed?.succeeded,
    skipped: completed?.skipped,
    failed: completed?.failed,
    billCount,
    notificationCount,
  });
});
