import "server-only";

import { randomUUID } from "node:crypto";
import {
  HomeownerActivationBulkItemStatus,
  HomeownerActivationBulkJobStatus,
  HomeownerActivationBulkSelectionMode,
  HomeownerActivationStatus,
  HomeownerEmailVerificationStatus,
  HomeownerStatus,
  NotificationStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { homeownerSearchWhere } from "@/lib/homeowner-admin-search";
import { createHomeownerActivationCredential, sendHomeownerActivationEmail } from "@/lib/services/homeowner-activation";
import { homeownerDigitalActivationEligibility, maskAccountNumber } from "@/lib/services/homeowner-digital-activation";

const JOB_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const MAX_SELECTED_IDS = 100;
const TARGET_RESOLUTION_BATCH_SIZE = 500;

type FilterSnapshot = {
  q?: string;
  status?: string;
  digital?: string;
};

type RequestJobInput = {
  tenantId: string;
  initiatedById: string;
  idempotencyKey: string;
  selectionMode: HomeownerActivationBulkSelectionMode;
  selectedHomeownerIds?: string[];
  filters?: FilterSnapshot;
};

export async function requestHomeownerActivationBulkJob(input: RequestJobInput) {
  const idempotencyKey = safeIdempotencyKey(input.idempotencyKey);
  const existing = await prisma.homeownerActivationBulkJob.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey } },
  });
  if (existing) return existing;

  const targetIds = await resolveEligibleTargets(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const job = await tx.homeownerActivationBulkJob.create({
        data: {
          tenantId: input.tenantId,
          initiatedById: input.initiatedById,
          idempotencyKey,
          selectionMode: input.selectionMode,
          filterSnapshot: (input.filters || {}) as Prisma.InputJsonValue,
          totalTargets: targetIds.length,
          eligibleCount: targetIds.length,
          queuedCount: targetIds.length,
          status: targetIds.length ? HomeownerActivationBulkJobStatus.QUEUED : HomeownerActivationBulkJobStatus.SUCCEEDED,
          completedAt: targetIds.length ? null : new Date(),
        },
      });
      if (targetIds.length) {
        await tx.homeownerActivationBulkItem.createMany({
          data: targetIds.map((homeownerId) => ({
            tenantId: input.tenantId,
            jobId: job.id,
            homeownerId,
          })),
          skipDuplicates: true,
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorId: input.initiatedById,
          module: "AUTH",
          action: "HOMEOWNER_ACTIVATION_BULK_QUEUED",
          entityType: "HomeownerActivationBulkJob",
          entityId: job.id,
          metadata: {
            selectionMode: input.selectionMode,
            totalTargets: targetIds.length,
            idempotencyKey,
          },
        },
      });
      return job;
    });
  } catch (error) {
    if (isUniqueCollision(error)) {
      const concurrent = await prisma.homeownerActivationBulkJob.findUnique({
        where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey } },
      });
      if (concurrent) return concurrent;
    }
    throw error;
  }
}

export async function processNextHomeownerActivationBulkJob(tenantId: string, options?: { batchSize?: number }) {
  const now = new Date();
  const candidate = await prisma.homeownerActivationBulkJob.findFirst({
    where: {
      tenantId,
      status: { in: [HomeownerActivationBulkJobStatus.QUEUED, HomeownerActivationBulkJobStatus.RUNNING] },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
    },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return null;

  const leaseOwner = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + JOB_LEASE_MS);
  const claimed = await prisma.homeownerActivationBulkJob.updateMany({
    where: {
      id: candidate.id,
      tenantId,
      status: { in: [HomeownerActivationBulkJobStatus.QUEUED, HomeownerActivationBulkJobStatus.RUNNING] },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
    },
    data: {
      status: HomeownerActivationBulkJobStatus.RUNNING,
      leaseOwner,
      leaseExpiresAt,
      startedAt: candidate.startedAt ?? now,
    },
  });
  if (claimed.count !== 1) return null;

  // A worker can die after SMTP acceptance but before item persistence. Never
  // automatically resend those ambiguous PROCESSING records. Mark them failed
  // for explicit administrator review/reissue instead of risking duplicates.
  await prisma.homeownerActivationBulkItem.updateMany({
    where: { tenantId, jobId: candidate.id, status: HomeownerActivationBulkItemStatus.PROCESSING },
    data: {
      status: HomeownerActivationBulkItemStatus.FAILED,
      completedAt: now,
      reason: "Previous worker stopped with an ambiguous delivery outcome. Manual review/reissue is required to avoid a duplicate email.",
    },
  });

  const batchSize = boundedInteger(options?.batchSize, DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE);
  const items = await prisma.homeownerActivationBulkItem.findMany({
    where: { tenantId, jobId: candidate.id, status: HomeownerActivationBulkItemStatus.PENDING },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  for (const item of items) {
    const claimedItem = await prisma.homeownerActivationBulkItem.updateMany({
      where: { id: item.id, tenantId, jobId: candidate.id, status: HomeownerActivationBulkItemStatus.PENDING },
      data: { status: HomeownerActivationBulkItemStatus.PROCESSING, attemptedAt: new Date() },
    });
    if (claimedItem.count !== 1) continue;
    const outcome = await processRecipient(tenantId, candidate.initiatedById, item.homeownerId);
    await prisma.homeownerActivationBulkItem.updateMany({
      where: { id: item.id, tenantId, jobId: candidate.id, status: HomeownerActivationBulkItemStatus.PROCESSING },
      data: {
        status: outcome.status,
        notificationId: outcome.notificationId,
        reason: outcome.reason,
        completedAt: new Date(),
      },
    });
  }

  return refreshJobCounters(tenantId, candidate.id, leaseOwner);
}

export async function getHomeownerActivationBulkJobProgress(tenantId: string, jobId: string) {
  return prisma.homeownerActivationBulkJob.findFirst({
    where: { id: jobId, tenantId },
    select: {
      id: true,
      tenantId: true,
      selectionMode: true,
      status: true,
      totalTargets: true,
      eligibleCount: true,
      queuedCount: true,
      processedCount: true,
      acceptedCount: true,
      skippedCount: true,
      failedCount: true,
      lastError: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function createFailedHomeownerActivationBulkRetry(input: {
  tenantId: string;
  initiatedById: string;
  sourceJobId: string;
  idempotencyKey: string;
}) {
  const idempotencyKey = safeIdempotencyKey(input.idempotencyKey);
  const existing = await prisma.homeownerActivationBulkJob.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey } },
  });
  if (existing) return existing;

  const source = await prisma.homeownerActivationBulkJob.findFirst({
    where: { id: input.sourceJobId, tenantId: input.tenantId },
  });
  if (!source) throw new Error("Activation bulk job was not found.");
  const terminalStatuses = new Set<HomeownerActivationBulkJobStatus>([
    HomeownerActivationBulkJobStatus.SUCCEEDED,
    HomeownerActivationBulkJobStatus.PARTIAL,
    HomeownerActivationBulkJobStatus.FAILED,
  ]);
  if (!terminalStatuses.has(source.status)) {
    throw new Error("Only a completed activation job can be retried.");
  }

  const failedItems = await prisma.homeownerActivationBulkItem.findMany({
    where: { tenantId: input.tenantId, jobId: source.id, status: HomeownerActivationBulkItemStatus.FAILED },
    select: { homeownerId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (!failedItems.length) throw new Error("This activation job has no failed records to retry.");

  try {
    return await prisma.$transaction(async (tx) => {
      const job = await tx.homeownerActivationBulkJob.create({
        data: {
          tenantId: input.tenantId,
          initiatedById: input.initiatedById,
          idempotencyKey,
          selectionMode: HomeownerActivationBulkSelectionMode.SELECTED,
          filterSnapshot: { retryFailedOnly: true, sourceJobId: source.id } as Prisma.InputJsonValue,
          totalTargets: failedItems.length,
          eligibleCount: failedItems.length,
          queuedCount: failedItems.length,
          status: HomeownerActivationBulkJobStatus.QUEUED,
        },
      });
      await tx.homeownerActivationBulkItem.createMany({
        data: failedItems.map((item) => ({
          tenantId: input.tenantId,
          jobId: job.id,
          homeownerId: item.homeownerId,
        })),
        skipDuplicates: true,
      });
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorId: input.initiatedById,
          module: "AUTH",
          action: "HOMEOWNER_ACTIVATION_BULK_FAILED_ONLY_RETRY_QUEUED",
          entityType: "HomeownerActivationBulkJob",
          entityId: job.id,
          metadata: { retryFailedOnly: true, sourceJobId: source.id, totalTargets: failedItems.length, idempotencyKey },
        },
      });
      return job;
    });
  } catch (error) {
    if (isUniqueCollision(error)) {
      const concurrent = await prisma.homeownerActivationBulkJob.findUnique({
        where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey } },
      });
      if (concurrent) return concurrent;
    }
    throw error;
  }
}

export async function previewHomeownerActivationBulkSelection(input: Omit<RequestJobInput, "idempotencyKey">) {
  const ids = await resolveEligibleTargets(input);
  return { eligible: ids.length };
}

async function resolveEligibleTargets(input: Omit<RequestJobInput, "idempotencyKey"> | RequestJobInput) {
  const where = firstTimeEligibilityWhere(input.tenantId, input.filters);
  if (input.selectionMode === HomeownerActivationBulkSelectionMode.SELECTED) {
    const selected = Array.from(new Set((input.selectedHomeownerIds || []).filter(Boolean))).slice(0, MAX_SELECTED_IDS);
    if (!selected.length) return [];
    const rows = await prisma.homeownerProfile.findMany({
      where: { AND: [where, { id: { in: selected } }] },
      select: { id: true },
      orderBy: { id: "asc" },
      take: MAX_SELECTED_IDS,
    });
    return rows.map((row) => row.id);
  }
  const rows = await prisma.homeownerProfile.findMany({
    where,
    select: { id: true },
    orderBy: { id: "asc" },
    take: TARGET_RESOLUTION_BATCH_SIZE,
  });
  const ids = rows.map((row) => row.id);
  let cursor = ids.at(-1);
  while (cursor && rows.length === TARGET_RESOLUTION_BATCH_SIZE) {
    const nextRows = await prisma.homeownerProfile.findMany({
      where,
      select: { id: true },
      orderBy: { id: "asc" },
      cursor: { id: cursor },
      skip: 1,
      take: TARGET_RESOLUTION_BATCH_SIZE,
    });
    ids.push(...nextRows.map((row) => row.id));
    cursor = nextRows.at(-1)?.id;
    if (nextRows.length < TARGET_RESOLUTION_BATCH_SIZE) break;
  }
  return ids;
}

function firstTimeEligibilityWhere(tenantId: string, filters?: FilterSnapshot): Prisma.HomeownerProfileWhereInput {
  const conditions: Prisma.HomeownerProfileWhereInput[] = [
    {
      tenantId,
      status: HomeownerStatus.ACTIVE,
      accountNumber: { not: null },
      activationStatus: HomeownerActivationStatus.NOT_INVITED,
      activationSentAt: null,
      user: { active: true, email: { not: "" } },
    },
  ];
  if (filters?.q?.trim()) conditions.push(homeownerSearchWhere(filters.q));
  if (filters?.status && filters.status !== "all") {
    if (filters.status === HomeownerStatus.ACTIVE) conditions.push({ status: HomeownerStatus.ACTIVE });
    else conditions.push({ id: "__no_first_time_targets__" });
  }
  if (filters?.digital && !["all", "eligible", "not_invited"].includes(filters.digital)) {
    conditions.push({ id: "__no_first_time_targets__" });
  }
  return { AND: conditions };
}

async function processRecipient(tenantId: string, actorId: string, homeownerId: string): Promise<{
  status: HomeownerActivationBulkItemStatus;
  notificationId?: string;
  reason?: string;
}> {
  const profile = await prisma.homeownerProfile.findFirst({
    where: { id: homeownerId, tenantId },
    include: { user: true },
  });
  if (!profile) return { status: HomeownerActivationBulkItemStatus.SKIPPED, reason: "Homeowner no longer exists in this tenant." };
  const eligibility = homeownerDigitalActivationEligibility(profile);
  if (!eligibility.eligible) return { status: HomeownerActivationBulkItemStatus.SKIPPED, reason: eligibility.reason };

  const accountNumber = homeownerAccountNumber(profile);
  try {
    const activation = await prisma.$transaction(async (tx) => {
      const created = await createHomeownerActivationCredential({ tenantId, userId: profile.userId, createdById: actorId, tx });
      await tx.homeownerProfile.update({
        where: { tenantId_id: { tenantId, id: profile.id } },
        data: {
          activationStatus: HomeownerActivationStatus.INVITATION_SENT,
          emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
          activationSentAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId,
          module: "AUTH",
          action: "HOMEOWNER_ACTIVATION_BULK_INVITATION_CREATED",
          entityType: "User",
          entityId: profile.userId,
          metadata: { homeownerId: profile.id, accountMasked: maskAccountNumber(accountNumber) },
        },
      });
      return created;
    });

    const delivery = await sendHomeownerActivationEmail({
      tenantId,
      userId: profile.userId,
      name: profile.user.name,
      email: profile.user.email,
      accountNumber,
      temporaryPassword: activation.temporaryPassword,
      emailVerificationToken: activation.emailVerificationToken,
      expiresAt: activation.expiresAt,
      actorId,
    });
    if ("status" in delivery && delivery.status === NotificationStatus.SENT) {
      return { status: HomeownerActivationBulkItemStatus.ACCEPTED, notificationId: "id" in delivery ? String(delivery.id) : undefined };
    }
    if ("status" in delivery && delivery.status === NotificationStatus.SKIPPED) {
      return { status: HomeownerActivationBulkItemStatus.SKIPPED, notificationId: "id" in delivery ? String(delivery.id) : undefined, reason: "Email delivery was skipped by delivery safety controls." };
    }
    return {
      status: HomeownerActivationBulkItemStatus.FAILED,
      notificationId: "id" in delivery ? String(delivery.id) : undefined,
      reason: "Email was not accepted by the configured provider. Explicit review/reissue is required.",
    };
  } catch (error) {
    return {
      status: HomeownerActivationBulkItemStatus.FAILED,
      reason: error instanceof Error ? error.message.slice(0, 300) : "Activation invitation processing failed.",
    };
  }
}

async function refreshJobCounters(tenantId: string, jobId: string, leaseOwner: string) {
  const grouped = await prisma.homeownerActivationBulkItem.groupBy({
    by: ["status"],
    where: { tenantId, jobId },
    _count: { _all: true },
  });
  const counts = new Map(grouped.map((row) => [row.status, row._count._all]));
  const pending = counts.get(HomeownerActivationBulkItemStatus.PENDING) || 0;
  const processing = counts.get(HomeownerActivationBulkItemStatus.PROCESSING) || 0;
  const accepted = counts.get(HomeownerActivationBulkItemStatus.ACCEPTED) || 0;
  const skipped = counts.get(HomeownerActivationBulkItemStatus.SKIPPED) || 0;
  const failed = counts.get(HomeownerActivationBulkItemStatus.FAILED) || 0;
  const processed = accepted + skipped + failed;
  const terminal = pending === 0 && processing === 0;
  const status = terminal
    ? failed || skipped
      ? HomeownerActivationBulkJobStatus.PARTIAL
      : HomeownerActivationBulkJobStatus.SUCCEEDED
    : HomeownerActivationBulkJobStatus.RUNNING;
  const now = new Date();

  await prisma.homeownerActivationBulkJob.updateMany({
    where: { id: jobId, tenantId, leaseOwner },
    data: {
      status,
      queuedCount: pending,
      processedCount: processed,
      acceptedCount: accepted,
      skippedCount: skipped,
      failedCount: failed,
      completedAt: terminal ? now : null,
      leaseOwner: terminal ? null : leaseOwner,
      leaseExpiresAt: terminal ? null : new Date(now.getTime() + JOB_LEASE_MS),
    },
  });
  return getHomeownerActivationBulkJobProgress(tenantId, jobId);
}

function safeIdempotencyKey(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 191) throw new Error("A valid idempotency key is required.");
  return normalized;
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value!)));
}

function isUniqueCollision(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
