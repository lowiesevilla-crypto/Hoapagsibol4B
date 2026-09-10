import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  HomeownerActivationBulkItemStatus,
  HomeownerActivationBulkJobStatus,
  HomeownerActivationBulkSelectionMode,
  HomeownerActivationStatus,
  HomeownerEmailVerificationStatus,
  HomeownerStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import {
  createFailedHomeownerActivationBulkRetry,
  getHomeownerActivationBulkJobProgress,
  processNextHomeownerActivationBulkJob,
  requestHomeownerActivationBulkJob,
} from "@/lib/services/homeowner-activation-bulk-jobs";
import { runWithTenant } from "@/lib/tenant-context";

const runId = `activation-bulk-${process.pid}`;
const tenantId = `${runId}-tenant`;
const isolationTenantId = `${runId}-isolation`;
const circuitTenantId = `${runId}-circuit`;
const scaleTenantId = `${runId}-scale`;
const scaleActorId = `${runId}-scale-actor`;
const scaleFixtureCount = 5_001;
const actorId = `${runId}-actor`;
const isolationActorId = `${runId}-isolation-actor`;
const circuitActorId = `${runId}-circuit-actor`;

function userId(index: number) {
  return `${runId}-user-${index}`;
}

function homeownerId(index: number) {
  return `${runId}-homeowner-${index}`;
}

async function cleanFixtures() {
  const tenantIds = [tenantId, isolationTenantId, circuitTenantId, scaleTenantId];
  await platformPrisma.homeownerActivationBulkItem.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.homeownerActivationBulkJob.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.homeownerProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

before(async () => {
  await cleanFixtures();
  await platformPrisma.tenant.createMany({
    data: [
      { id: tenantId, name: "Activation Bulk Tenant", shortName: "ABT", slug: `${runId}-tenant` },
      { id: isolationTenantId, name: "Activation Bulk Isolation", shortName: "ABI", slug: `${runId}-isolation` },
      { id: circuitTenantId, name: "Activation Circuit Tenant", shortName: "ABC", slug: `${runId}-circuit` },
    ],
  });
  await platformPrisma.user.createMany({
    data: [
      { id: actorId, tenantId, name: "Activation Admin", email: `${runId}-admin@example.invalid`, passwordHash: "integration-test-only", role: Role.ADMIN },
      { id: isolationActorId, tenantId: isolationTenantId, name: "Isolation Admin", email: `${runId}-isolation@example.invalid`, passwordHash: "integration-test-only", role: Role.ADMIN },
      { id: circuitActorId, tenantId: circuitTenantId, name: "Circuit Admin", email: `${runId}-circuit@example.invalid`, passwordHash: "integration-test-only", role: Role.ADMIN },
      ...Array.from({ length: 3 }, (_, offset) => ({
        id: userId(offset + 1),
        tenantId,
        name: `Activation Homeowner ${offset + 1}`,
        email: `${runId}-owner-${offset + 1}@example.com`,
        passwordHash: "integration-test-only",
        role: Role.HOMEOWNER,
      })),
    ],
  });
  await platformPrisma.homeownerProfile.createMany({
    data: Array.from({ length: 3 }, (_, offset) => ({
      id: homeownerId(offset + 1),
      tenantId,
      userId: userId(offset + 1),
      address: `${offset + 1} Activation Street`,
      block: "A",
      lot: String(offset + 1),
      phone: `0999000000${offset + 1}`,
      accountNumber: `7${String(offset + 1).padStart(10, "0")}`,
      monthlyDuesAmount: new Prisma.Decimal("100.00"),
      status: HomeownerStatus.ACTIVE,
      activationStatus: HomeownerActivationStatus.NOT_INVITED,
      emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
      activationSentAt: null,
    })),
  });
});

test("activation bulk pauses queued recipients while provider circuit is open", async () => {
  await platformPrisma.user.createMany({
    data: [1, 2].map((index) => ({
      id: `${runId}-circuit-user-${index}`,
      tenantId: circuitTenantId,
      name: `Circuit Owner ${index}`,
      email: `${runId}-circuit-owner-${index}@example.com`,
      passwordHash: "integration-test-only",
      role: Role.HOMEOWNER,
    })),
  });
  await platformPrisma.homeownerProfile.createMany({
    data: [1, 2].map((index) => ({
      id: `${runId}-circuit-homeowner-${index}`,
      tenantId: circuitTenantId,
      userId: `${runId}-circuit-user-${index}`,
      address: `${index} Circuit Street`,
      block: "C",
      lot: String(index),
      phone: `0999333333${index}`,
      accountNumber: `6${String(index).padStart(10, "0")}`,
      monthlyDuesAmount: new Prisma.Decimal("100.00"),
      status: HomeownerStatus.ACTIVE,
      activationStatus: HomeownerActivationStatus.NOT_INVITED,
      emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
      activationSentAt: null,
    })),
  });
  await platformPrisma.auditLog.create({
    data: {
      tenantId: circuitTenantId,
      module: "EMAIL",
      action: "EMAIL_PROVIDER_CIRCUIT_OPENED",
      entityType: "EmailProviderCircuit",
      entityId: circuitTenantId,
      metadata: { retryAfter: new Date(Date.now() + 60 * 60 * 1000).toISOString(), reason: "Integration test circuit" },
    },
  });
  const job = await runWithTenant(circuitTenantId, () => requestHomeownerActivationBulkJob({
    tenantId: circuitTenantId,
    initiatedById: circuitActorId,
    idempotencyKey: `${runId}-circuit-pause`,
    selectionMode: HomeownerActivationBulkSelectionMode.SELECTED,
    selectedHomeownerIds: [`${runId}-circuit-homeowner-1`, `${runId}-circuit-homeowner-2`],
  }), { role: Role.ADMIN });

  const progress = await runWithTenant(circuitTenantId, () => processNextHomeownerActivationBulkJob(circuitTenantId, { batchSize: 2 }), { role: Role.ADMIN });
  assert.equal(progress?.status, HomeownerActivationBulkJobStatus.RUNNING);
  assert.equal(progress?.processedCount, 0);
  assert.equal(progress?.queuedCount, 2);
  assert.match(progress?.lastError || "", /provider circuit/i);
  assert.equal(await platformPrisma.homeownerActivationBulkItem.count({ where: { tenantId: circuitTenantId, jobId: job.id, status: HomeownerActivationBulkItemStatus.SKIPPED } }), 0);
  assert.equal(await platformPrisma.homeownerActivationCredential.count({ where: { tenantId: circuitTenantId } }), 0);
});

after(async () => {
  await cleanFixtures();
  await platformPrisma.$disconnect();
});

test("activation bulk request is tenant-scoped and idempotent", async () => {
  const first = await runWithTenant(tenantId, () => requestHomeownerActivationBulkJob({
    tenantId,
    initiatedById: actorId,
    idempotencyKey: `${runId}-request-1`,
    selectionMode: HomeownerActivationBulkSelectionMode.SELECTED,
    selectedHomeownerIds: [homeownerId(1), homeownerId(2)],
  }), { role: Role.ADMIN });
  const duplicate = await runWithTenant(tenantId, () => requestHomeownerActivationBulkJob({
    tenantId,
    initiatedById: actorId,
    idempotencyKey: `${runId}-request-1`,
    selectionMode: HomeownerActivationBulkSelectionMode.SELECTED,
    selectedHomeownerIds: [homeownerId(1), homeownerId(2)],
  }), { role: Role.ADMIN });

  assert.equal(duplicate.id, first.id);
  assert.equal(first.totalTargets, 2);
  assert.equal(await platformPrisma.homeownerActivationBulkItem.count({ where: { tenantId, jobId: first.id } }), 2);

  const hidden = await runWithTenant(isolationTenantId, () => getHomeownerActivationBulkJobProgress(isolationTenantId, first.id), { role: Role.ADMIN });
  assert.equal(hidden, null, "Activation jobs must not be readable from another tenant.");
  await platformPrisma.homeownerActivationBulkJob.update({ where: { id: first.id }, data: { status: HomeownerActivationBulkJobStatus.SUCCEEDED, completedAt: new Date() } });
});

test("activation bulk queues 5,001 first-time eligible homeowners without sending inline email", async () => {
  await platformPrisma.tenant.create({
    data: { id: scaleTenantId, name: "Activation Bulk Scale Tenant", shortName: "ABS", slug: `${runId}-scale` },
  });
  await platformPrisma.user.create({
    data: { id: scaleActorId, tenantId: scaleTenantId, name: "Scale Activation Admin", email: `${runId}-scale-admin@example.invalid`, passwordHash: "integration-test-only", role: Role.ADMIN },
  });

  const users: Prisma.UserCreateManyInput[] = Array.from({ length: scaleFixtureCount }, (_, offset) => {
    const index = offset + 1;
    const ordinal = String(index).padStart(4, "0");
    return {
      id: `${runId}-scale-user-${ordinal}`,
      tenantId: scaleTenantId,
      name: `Activation Scale Homeowner ${ordinal}`,
      email: `${runId}-scale-owner-${ordinal}@example.com`,
      passwordHash: "integration-test-only",
      role: Role.HOMEOWNER,
    };
  });
  const profiles: Prisma.HomeownerProfileCreateManyInput[] = Array.from({ length: scaleFixtureCount }, (_, offset) => {
    const index = offset + 1;
    const ordinal = String(index).padStart(4, "0");
    return {
      id: `${runId}-scale-homeowner-${ordinal}`,
      tenantId: scaleTenantId,
      userId: `${runId}-scale-user-${ordinal}`,
      address: `${ordinal} Activation Scale Street`,
      block: "S",
      lot: String(index),
      phone: `09${String(index).padStart(9, "0")}`,
      accountNumber: `8${String(index).padStart(10, "0")}`,
      monthlyDuesAmount: new Prisma.Decimal("100.00"),
      status: HomeownerStatus.ACTIVE,
      activationStatus: HomeownerActivationStatus.NOT_INVITED,
      emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
      activationSentAt: null,
    };
  });
  for (let offset = 0; offset < scaleFixtureCount; offset += 500) {
    await platformPrisma.user.createMany({ data: users.slice(offset, offset + 500) });
    await platformPrisma.homeownerProfile.createMany({ data: profiles.slice(offset, offset + 500) });
  }

  const startedAt = performance.now();
  const job = await runWithTenant(scaleTenantId, () => requestHomeownerActivationBulkJob({
    tenantId: scaleTenantId,
    initiatedById: scaleActorId,
    idempotencyKey: `${runId}-scale-5001`,
    selectionMode: HomeownerActivationBulkSelectionMode.FILTERED,
    filters: { status: "all", digital: "eligible" },
  }), { role: Role.ADMIN });
  const duplicate = await runWithTenant(scaleTenantId, () => requestHomeownerActivationBulkJob({
    tenantId: scaleTenantId,
    initiatedById: scaleActorId,
    idempotencyKey: `${runId}-scale-5001`,
    selectionMode: HomeownerActivationBulkSelectionMode.FILTERED,
    filters: { status: "all", digital: "eligible" },
  }), { role: Role.ADMIN });

  assert.equal(duplicate.id, job.id);
  assert.equal(job.totalTargets, scaleFixtureCount);
  assert.equal(job.queuedCount, scaleFixtureCount);
  assert.equal(job.status, HomeownerActivationBulkJobStatus.QUEUED);
  assert.equal(await platformPrisma.homeownerActivationBulkItem.count({ where: { tenantId: scaleTenantId, jobId: job.id } }), scaleFixtureCount);
  assert.equal(await platformPrisma.notificationLog.count({ where: { tenantId: scaleTenantId } }), 0, "Queue creation must not send or log SMTP delivery attempts.");
  assert.ok(performance.now() - startedAt < 60_000, "5,001-homeowner activation queue creation exceeded the 60-second target in CI.");
  await platformPrisma.homeownerActivationBulkJob.update({ where: { id: job.id }, data: { status: HomeownerActivationBulkJobStatus.SUCCEEDED, completedAt: new Date() } });
});

test("activation retry creates a new job without accepted recipients", async () => {
  const source = await platformPrisma.homeownerActivationBulkJob.create({
    data: {
      tenantId,
      initiatedById: actorId,
      idempotencyKey: `${runId}-source-failed-only`,
      selectionMode: HomeownerActivationBulkSelectionMode.SELECTED,
      status: HomeownerActivationBulkJobStatus.PARTIAL,
      totalTargets: 3,
      eligibleCount: 3,
      queuedCount: 0,
      processedCount: 3,
      acceptedCount: 1,
      skippedCount: 1,
      failedCount: 1,
      filterSnapshot: { source: "integration-test" },
    },
  });
  await platformPrisma.homeownerActivationBulkItem.createMany({
    data: [
      { tenantId, jobId: source.id, homeownerId: homeownerId(1), status: HomeownerActivationBulkItemStatus.ACCEPTED },
      { tenantId, jobId: source.id, homeownerId: homeownerId(2), status: HomeownerActivationBulkItemStatus.SKIPPED },
      { tenantId, jobId: source.id, homeownerId: homeownerId(3), status: HomeownerActivationBulkItemStatus.FAILED },
    ],
  });

  const retry = await runWithTenant(tenantId, () => createFailedHomeownerActivationBulkRetry({
    tenantId,
    initiatedById: actorId,
    sourceJobId: source.id,
    idempotencyKey: `${runId}-retry-failed-only`,
  }), { role: Role.ADMIN });
  const duplicate = await runWithTenant(tenantId, () => createFailedHomeownerActivationBulkRetry({
    tenantId,
    initiatedById: actorId,
    sourceJobId: source.id,
    idempotencyKey: `${runId}-retry-failed-only`,
  }), { role: Role.ADMIN });

  assert.equal(duplicate.id, retry.id);
  assert.equal(retry.totalTargets, 2);
  assert.equal(retry.status, HomeownerActivationBulkJobStatus.QUEUED);
  const retryItems = await platformPrisma.homeownerActivationBulkItem.findMany({ where: { tenantId, jobId: retry.id }, select: { homeownerId: true } });
  assert.deepEqual(retryItems.map((item) => item.homeownerId), [homeownerId(2), homeownerId(3)]);
});

test("selected activation reissue queues only previously invited homeowners who are not activated", async () => {
  await platformPrisma.user.createMany({
    data: [
      { id: `${runId}-reissue-user-expired`, tenantId, name: "Expired Activation Owner", email: `${runId}-expired@example.com`, passwordHash: "integration-test-only", role: Role.HOMEOWNER },
      { id: `${runId}-reissue-user-active`, tenantId, name: "Activated Owner", email: `${runId}-activated@example.com`, passwordHash: "integration-test-only", role: Role.HOMEOWNER },
    ],
  });
  await platformPrisma.homeownerProfile.createMany({
    data: [
      {
        id: `${runId}-homeowner-reissue-expired`,
        tenantId,
        userId: `${runId}-reissue-user-expired`,
        address: "10 Expired Street",
        block: "R",
        lot: "1",
        phone: "09991111111",
        accountNumber: "91234567890",
        monthlyDuesAmount: new Prisma.Decimal("100.00"),
        status: HomeownerStatus.ACTIVE,
        activationStatus: HomeownerActivationStatus.EXPIRED,
        emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
        activationSentAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      },
      {
        id: `${runId}-homeowner-reissue-active`,
        tenantId,
        userId: `${runId}-reissue-user-active`,
        address: "11 Activated Street",
        block: "R",
        lot: "2",
        phone: "09992222222",
        accountNumber: "92345678901",
        monthlyDuesAmount: new Prisma.Decimal("100.00"),
        status: HomeownerStatus.ACTIVE,
        activationStatus: HomeownerActivationStatus.ACTIVE,
        emailStatus: HomeownerEmailVerificationStatus.VERIFIED,
        activationSentAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        activatedAt: new Date(),
      },
    ],
  });

  const firstTimeJob = await runWithTenant(tenantId, () => requestHomeownerActivationBulkJob({
    tenantId,
    initiatedById: actorId,
    idempotencyKey: `${runId}-reissue-first-time-reject`,
    selectionMode: HomeownerActivationBulkSelectionMode.SELECTED,
    selectedHomeownerIds: [`${runId}-homeowner-reissue-expired`],
  }), { role: Role.ADMIN });
  assert.equal(firstTimeJob.totalTargets, 0);

  const reissueJob = await runWithTenant(tenantId, () => requestHomeownerActivationBulkJob({
    tenantId,
    initiatedById: actorId,
    idempotencyKey: `${runId}-reissue-selected`,
    selectionMode: HomeownerActivationBulkSelectionMode.SELECTED,
    sendMode: "reissue",
    selectedHomeownerIds: [`${runId}-homeowner-reissue-expired`, `${runId}-homeowner-reissue-active`],
  }), { role: Role.ADMIN });
  assert.equal(reissueJob.totalTargets, 1);
  const reissueItems = await platformPrisma.homeownerActivationBulkItem.findMany({ where: { tenantId, jobId: reissueJob.id }, select: { homeownerId: true } });
  assert.deepEqual(reissueItems.map((item) => item.homeownerId), [`${runId}-homeowner-reissue-expired`]);
});

test("concurrent activation workers cannot claim the same queued job twice", async () => {
  await platformPrisma.homeownerActivationBulkJob.updateMany({
    where: { tenantId, status: { in: [HomeownerActivationBulkJobStatus.QUEUED, HomeownerActivationBulkJobStatus.RUNNING] } },
    data: { status: HomeownerActivationBulkJobStatus.SUCCEEDED, completedAt: new Date() },
  });
  const job = await platformPrisma.homeownerActivationBulkJob.create({
    data: {
      tenantId,
      initiatedById: actorId,
      idempotencyKey: `${runId}-concurrent-worker`,
      selectionMode: HomeownerActivationBulkSelectionMode.SELECTED,
      status: HomeownerActivationBulkJobStatus.QUEUED,
      totalTargets: 0,
      eligibleCount: 0,
      queuedCount: 0,
    },
  });

  const [first, second] = await Promise.all([
    runWithTenant(tenantId, () => processNextHomeownerActivationBulkJob(tenantId), { role: Role.ADMIN }),
    runWithTenant(tenantId, () => processNextHomeownerActivationBulkJob(tenantId), { role: Role.ADMIN }),
  ]);
  const results = [first, second].filter(Boolean);

  assert.equal(results.length, 1, "Only one worker should claim a queued activation job.");
  assert.equal(results[0]?.id, job.id);
  assert.equal(results[0]?.status, HomeownerActivationBulkJobStatus.SUCCEEDED);
});
