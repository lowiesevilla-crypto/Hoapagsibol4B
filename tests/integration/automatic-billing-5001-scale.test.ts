import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  BillingGenerationMode,
  BillStatus,
  HomeownerStatus,
  Prisma,
  RecurringChargeType,
  Role,
  TenantModule,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { runAutomaticBillingForTenant } from "@/lib/services/automatic-billing";
import { runWithTenant } from "@/lib/tenant-context";

const runId = `automatic-billing-5001-${process.pid}`;
const tenantId = `${runId}-tenant`;
const isolationTenantId = `${runId}-tenant-isolation`;
const actorId = `${runId}-actor`;
const isolationActorId = `${runId}-isolation-actor`;
const ruleId = `${runId}-rule`;
const isolationRuleId = `${runId}-isolation-rule`;
const activeFixtureCount = 5_001;
const lateIndex = activeFixtureCount + 1;
const billingYear = 2026;
const billingMonth = 9;
const billingMonthDate = new Date(Date.UTC(billingYear, billingMonth - 1, 1));
const dueDate = new Date(Date.UTC(billingYear, billingMonth - 1, 15));
const schedulerNow = new Date("2026-09-14T16:05:00.000Z"); // Sep 15, 00:05 Asia/Manila.

function runBilling(tenantId: string) {
  return runWithTenant(tenantId, () => runAutomaticBillingForTenant(tenantId, schedulerNow), {
    role: Role.BILLING_MANAGER,
    enabledModules: [TenantModule.BILLING],
  });
}

function userId(index: number) {
  return `${runId}-user-${String(index).padStart(5, "0")}`;
}

function homeownerId(index: number) {
  return `${runId}-homeowner-${String(index).padStart(5, "0")}`;
}

async function cleanFixtures() {
  const tenantIds = [tenantId, isolationTenantId];
  await platformPrisma.notificationLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.duesExemption.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.bill.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.billingRule.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.homeownerProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

before(async () => {
  await cleanFixtures();

  await platformPrisma.tenant.createMany({
    data: [
      { id: tenantId, name: "Automatic Billing 5001 Scale Tenant", shortName: "AB5K", slug: `${runId}-hoa` },
      { id: isolationTenantId, name: "Automatic Billing Isolation Tenant", shortName: "ABISO", slug: `${runId}-isolation` },
    ],
  });

  await platformPrisma.user.createMany({
    data: [
      { id: actorId, tenantId, name: "Scale Billing Manager", email: `${runId}-actor@example.invalid`, passwordHash: "integration-test-only", role: Role.BILLING_MANAGER },
      { id: isolationActorId, tenantId: isolationTenantId, name: "Isolation Billing Manager", email: `${runId}-isolation-actor@example.invalid`, passwordHash: "integration-test-only", role: Role.BILLING_MANAGER },
      { id: `${runId}-isolation-user`, tenantId: isolationTenantId, name: "Isolation Homeowner", email: `${runId}-isolation-homeowner@example.invalid`, passwordHash: "integration-test-only", role: Role.HOMEOWNER },
    ],
  });

  const users: Prisma.UserCreateManyInput[] = Array.from({ length: activeFixtureCount + 1 }, (_, offset) => {
    const index = offset + 1;
    const ordinal = String(index).padStart(5, "0");
    return {
      id: userId(index),
      tenantId,
      name: `Automatic Billing Homeowner ${ordinal}`,
      email: `${runId}-${ordinal}@example.invalid`,
      passwordHash: "integration-test-only",
      role: Role.HOMEOWNER,
    };
  });
  const profiles: Prisma.HomeownerProfileCreateManyInput[] = Array.from({ length: activeFixtureCount + 1 }, (_, offset) => {
    const index = offset + 1;
    const ordinal = String(index).padStart(5, "0");
    return {
      id: homeownerId(index),
      tenantId,
      userId: userId(index),
      address: `${ordinal} Automatic Billing Scale Street`,
      block: `S${String(Math.ceil(index / 100)).padStart(3, "0")}`,
      lot: ordinal,
      phone: `09${String(index).padStart(9, "0")}`,
      accountNumber: `8${String(index).padStart(10, "0")}`,
      monthlyDuesAmount: new Prisma.Decimal("100.00"),
      status: index === lateIndex ? HomeownerStatus.INACTIVE : HomeownerStatus.ACTIVE,
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
      phone: "09999999999",
      accountNumber: "79999999999",
      monthlyDuesAmount: new Prisma.Decimal("100.00"),
      status: HomeownerStatus.ACTIVE,
    },
  });

  await platformPrisma.billingRule.createMany({
    data: [
      {
        id: ruleId,
        tenantId,
        recurringChargeType: RecurringChargeType.MONTHLY_DUES,
        amount: new Prisma.Decimal("100.00"),
        generationMode: BillingGenerationMode.AUTOMATIC,
        billingDay: 1,
        dueDay: 15,
        effectiveStartYear: billingYear,
        effectiveStartMonth: billingMonth,
        resolutionReference: "AB-5001-RES-2026-001",
        createdById: actorId,
        updatedById: actorId,
      },
      {
        id: isolationRuleId,
        tenantId: isolationTenantId,
        recurringChargeType: RecurringChargeType.MONTHLY_DUES,
        amount: new Prisma.Decimal("100.00"),
        generationMode: BillingGenerationMode.AUTOMATIC,
        billingDay: 1,
        dueDay: 15,
        effectiveStartYear: billingYear,
        effectiveStartMonth: billingMonth,
        resolutionReference: "AB-ISO-RES-2026-001",
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
      reason: "Scale-test approved exemption",
      resolutionReference: "AB-5001-EX-001",
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
      resolutionReference: "AB-5001-RES-2026-001",
      amount: new Prisma.Decimal("100.00"),
      totalAmount: new Prisma.Decimal("100.00"),
      balance: new Prisma.Decimal("100.00"),
      dueDate,
      status: BillStatus.UNPAID,
    },
  });
});

after(async () => {
  await cleanFixtures();
  await platformPrisma.$disconnect();
});

test("automatic billing reconciles 5,001 active homeowners without duplicate billing and remains safe for late eligibility", async () => {
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const first = await runBilling(tenantId);
  const firstRuntimeMs = performance.now() - startedAt;
  const heapAfter = process.memoryUsage().heapUsed;

  assert.equal(first.monthlyDues.eligible, activeFixtureCount);
  assert.equal(first.monthlyDues.created, 4_999);
  assert.equal(first.monthlyDues.duplicates, 1);
  assert.equal(first.monthlyDues.exemptions, 1);
  assert.equal(first.monthlyDues.failed, 0);
  assert.ok(firstRuntimeMs <= 180_000, `5,001-homeowner automatic billing exceeded the 180-second target: ${Math.round(firstRuntimeMs)} ms.`);

  const [firstBillCount, firstNotificationCount, firstCompletionAudit] = await Promise.all([
    platformPrisma.bill.count({ where: { tenantId, recurringChargeType: RecurringChargeType.MONTHLY_DUES, coverageYear: billingYear, coverageMonth: billingMonth } }),
    platformPrisma.notificationLog.count({ where: { tenantId } }),
    platformPrisma.auditLog.findFirst({ where: { tenantId, action: "AUTOMATIC_MONTHLY_DUES_COMPLETED", entityType: "BillingRule", entityId: ruleId }, orderBy: { createdAt: "desc" } }),
  ]);
  assert.equal(firstBillCount, 5_000);
  assert.equal(firstNotificationCount, 4_999, "Exactly one notification log must be created for every newly created bill.");
  assert.ok(firstCompletionAudit, "The completed reconciliation must be auditable.");

  const repeated = await runBilling(tenantId);
  assert.equal(repeated.monthlyDues.created, 0);
  assert.equal(repeated.monthlyDues.duplicates, 5_000);
  assert.equal(repeated.monthlyDues.exemptions, 1);
  assert.equal(repeated.monthlyDues.failed, 0);
  assert.equal(await platformPrisma.bill.count({ where: { tenantId, coverageYear: billingYear, coverageMonth: billingMonth } }), 5_000);
  assert.equal(await platformPrisma.notificationLog.count({ where: { tenantId } }), firstNotificationCount, "A same-month reconciliation must not send duplicate billing notifications.");

  await platformPrisma.homeownerProfile.update({ where: { id: homeownerId(lateIndex) }, data: { status: HomeownerStatus.ACTIVE } });
  const lateEligibility = await runBilling(tenantId);
  assert.equal(lateEligibility.monthlyDues.eligible, activeFixtureCount + 1);
  assert.equal(lateEligibility.monthlyDues.created, 1, "A homeowner becoming eligible after a completed run must be billed on the next reconciliation.");
  assert.equal(lateEligibility.monthlyDues.duplicates, 5_000);
  assert.equal(lateEligibility.monthlyDues.exemptions, 1);
  assert.equal(lateEligibility.monthlyDues.failed, 0);

  const [finalBillCount, finalNotificationCount, duplicateGroups, isolationCountBefore] = await Promise.all([
    platformPrisma.bill.count({ where: { tenantId, coverageYear: billingYear, coverageMonth: billingMonth } }),
    platformPrisma.notificationLog.count({ where: { tenantId } }),
    platformPrisma.bill.groupBy({
      by: ["homeownerId", "recurringChargeType", "coverageYear", "coverageMonth"],
      where: { tenantId, coverageYear: billingYear, coverageMonth: billingMonth },
      _count: { _all: true },
      having: { id: { _count: { gt: 1 } } },
    }),
    platformPrisma.bill.count({ where: { tenantId: isolationTenantId } }),
  ]);
  assert.equal(finalBillCount, 5_001);
  assert.equal(finalNotificationCount, firstNotificationCount + 1);
  assert.equal(duplicateGroups.length, 0, "The database must contain no duplicate homeowner/charge/coverage rows.");
  assert.equal(isolationCountBefore, 0, "Running the scale tenant must not contaminate another tenant.");

  const isolationRun = await runBilling(isolationTenantId);
  assert.equal(isolationRun.monthlyDues.created, 1);
  assert.equal(isolationRun.monthlyDues.failed, 0);
  assert.equal(await platformPrisma.bill.count({ where: { tenantId: isolationTenantId, coverageYear: billingYear, coverageMonth: billingMonth } }), 1);

  console.info("[automatic-billing-5001-metrics]", {
    activeHomeowners: activeFixtureCount,
    schedulerBatchSize: 250,
    schedulerBatches: Math.ceil(activeFixtureCount / 250),
    firstRuntimeMs: Math.round(firstRuntimeMs),
    heapDeltaBytes: heapAfter - heapBefore,
    firstCreated: first.monthlyDues.created,
    firstDuplicates: first.monthlyDues.duplicates,
    firstExemptions: first.monthlyDues.exemptions,
    finalBillCount,
    finalNotificationCount,
  });
});
