import "server-only";

import {
  BillingGenerationJobItemStatus,
  BillingGenerationJobStatus,
  Prisma,
} from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  generateBillingFromRules,
  previewBillingGeneration,
  type BillingGenerationInput,
  type BillingGenerationRow,
} from "@/lib/services/billing-rules";

const billingJobProcessBatchSize = 250;
const billingJobInsertBatchSize = 500;
const billingJobLeaseMs = 60_000;

export type BillingGenerationJobActor = BillingGenerationInput["actor"];

export type BillingGenerationJobView = {
  id: string;
  reference: string;
  status: BillingGenerationJobStatus;
  coverageYear: number;
  coverageMonth: number;
  scope: string;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  percent: number;
  retryOfJobId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  canRetry: boolean;
};

export function billingGenerationProgressPercent(completed: number, total: number) {
  if (total <= 0) return 100;
  const safeCompleted = Math.max(0, Math.min(completed, total));
  return Math.floor((safeCompleted / total) * 100);
}

export function hashBillingGenerationIdempotencyKey(tenantId: string, idempotencyKey: string) {
  return createHash("sha256").update(`${tenantId}:${idempotencyKey}`).digest("hex");
}

export async function createBillingGenerationJob(input: BillingGenerationInput, idempotencyKey: string) {
  const normalizedKey = normalizeIdempotencyKey(idempotencyKey);
  const idempotencyKeyHash = hashBillingGenerationIdempotencyKey(input.actor.tenantId, normalizedKey);
  const existing = await prisma.billingGenerationJob.findFirst({
    where: { tenantId: input.actor.tenantId, idempotencyKeyHash },
  });
  if (existing) return { job: existing, created: false };

  const preview = await previewBillingGeneration(input);
  const initialItems = preview.rows.map((row) => initialItemState(row));
  const succeeded = 0;
  const failed = initialItems.filter((item) => item.status === BillingGenerationJobItemStatus.FAILED).length;
  const skipped = initialItems.filter((item) => item.status === BillingGenerationJobItemStatus.SKIPPED).length;
  const completed = succeeded + failed + skipped;
  const pending = initialItems.length - completed;
  const initialStatus = pending > 0 ? BillingGenerationJobStatus.QUEUED : terminalStatus(succeeded, failed, skipped);
  const now = new Date();
  const jobId = `bgj_${randomUUID().replaceAll("-", "")}`;
  const reference = billingJobReference(input.coverageYear, input.coverageMonth);

  try {
    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.billingGenerationJob.create({
        data: {
          id: jobId,
          tenantId: input.actor.tenantId,
          actorId: input.actor.id,
          reference,
          idempotencyKeyHash,
          coverageYear: input.coverageYear,
          coverageMonth: input.coverageMonth,
          scope: input.scope,
          targetFilter: generationTargetFilter(input),
          total: initialItems.length,
          completed,
          succeeded,
          failed,
          skipped,
          status: initialStatus,
          completedAt: pending === 0 ? now : null,
          metadata: {
            previewEligibleCount: preview.eligibleCount,
            previewExemptCount: preview.exemptCount,
            previewDuplicateCount: preview.duplicateCount,
            previewInvalidCount: preview.invalidCount,
            projectedNewBillCount: preview.projectedNewBillCount,
            projectedTotalAmount: preview.projectedTotalAmount,
            ruleId: preview.rule?.id ?? null,
            resolutionReference: preview.rule?.resolutionReference ?? null,
            generationMode: preview.rule?.generationMode ?? null,
          },
        },
      });

      for (let index = 0; index < initialItems.length; index += billingJobInsertBatchSize) {
        await tx.billingGenerationJobItem.createMany({
          data: initialItems.slice(index, index + billingJobInsertBatchSize).map((item) => ({
            tenantId: input.actor.tenantId,
            jobId,
            homeownerId: item.homeownerId,
            status: item.status,
            message: item.message,
          })),
          skipDuplicates: true,
        });
      }
      return created;
    }, { maxWait: 5_000, timeout: 30_000 });
    return { job, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.billingGenerationJob.findFirst({
        where: { tenantId: input.actor.tenantId, idempotencyKeyHash },
      });
      if (raced) return { job: raced, created: false };
    }
    throw error;
  }
}

export async function createFailedBillingGenerationRetry(input: {
  actor: BillingGenerationJobActor;
  sourceJobId: string;
  idempotencyKey: string;
}) {
  const normalizedKey = normalizeIdempotencyKey(input.idempotencyKey);
  const idempotencyKeyHash = hashBillingGenerationIdempotencyKey(input.actor.tenantId, normalizedKey);
  const existing = await prisma.billingGenerationJob.findFirst({
    where: { tenantId: input.actor.tenantId, idempotencyKeyHash },
  });
  if (existing) return { job: existing, created: false };

  const source = await prisma.billingGenerationJob.findFirst({
    where: { id: input.sourceJobId, tenantId: input.actor.tenantId },
  });
  if (!source) throw new Error("Billing generation job was not found.");
  if (!isTerminalStatus(source.status)) throw new Error("Only a completed billing job can be retried.");

  const failedItems = await prisma.billingGenerationJobItem.findMany({
    where: {
      tenantId: input.actor.tenantId,
      jobId: source.id,
      status: BillingGenerationJobItemStatus.FAILED,
    },
    select: { homeownerId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (!failedItems.length) throw new Error("This billing generation job has no failed records to retry.");

  const jobId = `bgj_${randomUUID().replaceAll("-", "")}`;
  const reference = billingJobReference(source.coverageYear, source.coverageMonth);
  try {
    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.billingGenerationJob.create({
        data: {
          id: jobId,
          tenantId: input.actor.tenantId,
          actorId: input.actor.id,
          reference,
          idempotencyKeyHash,
          coverageYear: source.coverageYear,
          coverageMonth: source.coverageMonth,
          scope: "SELECTED",
          targetFilter: { retryFailedOnly: true, sourceJobReference: source.reference },
          total: failedItems.length,
          retryOfJobId: source.id,
          metadata: { retryFailedOnly: true, sourceJobReference: source.reference },
        },
      });
      for (let index = 0; index < failedItems.length; index += billingJobInsertBatchSize) {
        await tx.billingGenerationJobItem.createMany({
          data: failedItems.slice(index, index + billingJobInsertBatchSize).map((item) => ({
            tenantId: input.actor.tenantId,
            jobId,
            homeownerId: item.homeownerId,
          })),
          skipDuplicates: true,
        });
      }
      return created;
    }, { maxWait: 5_000, timeout: 30_000 });
    return { job, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.billingGenerationJob.findFirst({
        where: { tenantId: input.actor.tenantId, idempotencyKeyHash },
      });
      if (raced) return { job: raced, created: false };
    }
    throw error;
  }
}

export async function processBillingGenerationJob(jobId: string, actor: BillingGenerationJobActor) {
  const leaseToken = randomUUID();
  const now = new Date();
  const claimed = await prisma.billingGenerationJob.updateMany({
    where: {
      id: jobId,
      tenantId: actor.tenantId,
      status: { in: [BillingGenerationJobStatus.QUEUED, BillingGenerationJobStatus.RUNNING] },
      OR: [
        { leaseToken: null },
        { leaseExpiresAt: null },
        { leaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      status: BillingGenerationJobStatus.RUNNING,
      leaseToken,
      leaseExpiresAt: new Date(now.getTime() + billingJobLeaseMs),
      heartbeatAt: now,
      startedAt: now,
      lastError: null,
    },
  });
  if (!claimed.count) return getBillingGenerationJobView(jobId, actor.tenantId);

  try {
    while (true) {
      const pending = await prisma.billingGenerationJobItem.findMany({
        where: {
          tenantId: actor.tenantId,
          jobId,
          status: BillingGenerationJobItemStatus.PENDING,
        },
        select: { id: true, homeownerId: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: billingJobProcessBatchSize,
      });
      if (!pending.length) break;

      const job = await prisma.billingGenerationJob.findFirst({
        where: { id: jobId, tenantId: actor.tenantId, leaseToken },
      });
      if (!job) return getBillingGenerationJobView(jobId, actor.tenantId);

      try {
        const result = await generateBillingFromRules({
          actor,
          coverageYear: job.coverageYear,
          coverageMonth: job.coverageMonth,
          scope: "SELECTED",
          homeownerIds: pending.map((item) => item.homeownerId),
        });
        const rowByHomeowner = new Map(result.rows.map((row) => [row.homeownerId, row]));
        const succeededIds: string[] = [];
        const skippedIds: string[] = [];
        const failedIds: string[] = [];

        for (const item of pending) {
          const row = rowByHomeowner.get(item.homeownerId);
          if (row?.action === "CREATE" && row.billId) succeededIds.push(item.id);
          else if (row?.action === "SKIP_DUPLICATE" || row?.action === "SKIP_EXEMPT") skippedIds.push(item.id);
          else failedIds.push(item.id);
        }

        await updateBillingJobItems(actor.tenantId, jobId, succeededIds, skippedIds, failedIds);
      } catch (error) {
        const message = safeErrorMessage(error, "Billing batch failed.");
        await prisma.billingGenerationJobItem.updateMany({
          where: { tenantId: actor.tenantId, jobId, id: { in: pending.map((item) => item.id) } },
          data: { status: BillingGenerationJobItemStatus.FAILED, attempts: { increment: 1 }, message },
        });
      }

      const state = await syncBillingGenerationJobCounts(jobId, actor.tenantId, leaseToken);
      if (!state || isTerminalStatus(state.status)) return state;
    }

    return syncBillingGenerationJobCounts(jobId, actor.tenantId, leaseToken, true);
  } catch (error) {
    const message = safeErrorMessage(error, "Billing generation job stopped unexpectedly.");
    await prisma.billingGenerationJob.updateMany({
      where: { id: jobId, tenantId: actor.tenantId, leaseToken },
      data: {
        status: BillingGenerationJobStatus.RUNNING,
        lastError: message,
        leaseToken: null,
        leaseExpiresAt: null,
        heartbeatAt: new Date(),
      },
    }).catch(() => undefined);
    throw error;
  }
}

export async function getBillingGenerationJobView(jobId: string, tenantId: string): Promise<BillingGenerationJobView | null> {
  const job = await prisma.billingGenerationJob.findFirst({ where: { id: jobId, tenantId } });
  return job ? serializeBillingJob(job) : null;
}

export async function listRecentBillingGenerationJobs(tenantId: string, take = 5): Promise<BillingGenerationJobView[]> {
  const jobs = await prisma.billingGenerationJob.findMany({
    where: { tenantId },
    orderBy: { updatedAt: "desc" },
    take: Math.max(1, Math.min(take, 20)),
  });
  return jobs.map(serializeBillingJob);
}

async function updateBillingJobItems(
  tenantId: string,
  jobId: string,
  succeededIds: string[],
  skippedIds: string[],
  failedIds: string[],
) {
  await prisma.$transaction([
    prisma.billingGenerationJobItem.updateMany({
      where: { tenantId, jobId, id: { in: succeededIds } },
      data: { status: BillingGenerationJobItemStatus.SUCCEEDED, attempts: { increment: 1 }, message: "Bill created." },
    }),
    prisma.billingGenerationJobItem.updateMany({
      where: { tenantId, jobId, id: { in: skippedIds } },
      data: { status: BillingGenerationJobItemStatus.SKIPPED, attempts: { increment: 1 }, message: "Skipped because the billing state changed after the job was created." },
    }),
    prisma.billingGenerationJobItem.updateMany({
      where: { tenantId, jobId, id: { in: failedIds } },
      data: { status: BillingGenerationJobItemStatus.FAILED, attempts: { increment: 1 }, message: "Billing could not be completed for this homeowner." },
    }),
  ]);
}

async function syncBillingGenerationJobCounts(jobId: string, tenantId: string, leaseToken: string, forceTerminal = false) {
  const [job, grouped] = await Promise.all([
    prisma.billingGenerationJob.findFirst({ where: { id: jobId, tenantId, leaseToken } }),
    prisma.billingGenerationJobItem.groupBy({
      by: ["status"],
      where: { tenantId, jobId },
      _count: { _all: true },
    }),
  ]);
  if (!job) return getBillingGenerationJobView(jobId, tenantId);

  const counts = new Map(grouped.map((entry) => [entry.status, entry._count._all]));
  const succeeded = counts.get(BillingGenerationJobItemStatus.SUCCEEDED) ?? 0;
  const failed = counts.get(BillingGenerationJobItemStatus.FAILED) ?? 0;
  const skipped = counts.get(BillingGenerationJobItemStatus.SKIPPED) ?? 0;
  const pending = counts.get(BillingGenerationJobItemStatus.PENDING) ?? 0;
  const completed = succeeded + failed + skipped;
  const terminal = forceTerminal || pending === 0 || completed >= job.total;
  const status = terminal ? terminalStatus(succeeded, failed, skipped) : BillingGenerationJobStatus.RUNNING;
  const timestamp = new Date();

  const updated = await prisma.billingGenerationJob.update({
    where: { id: job.id },
    data: {
      completed,
      succeeded,
      failed,
      skipped,
      status,
      heartbeatAt: timestamp,
      leaseExpiresAt: terminal ? null : new Date(timestamp.getTime() + billingJobLeaseMs),
      leaseToken: terminal ? null : leaseToken,
      completedAt: terminal ? timestamp : null,
    },
  });
  return serializeBillingJob(updated);
}

function initialItemState(row: BillingGenerationRow) {
  if (row.action === "CREATE") return { homeownerId: row.homeownerId, status: BillingGenerationJobItemStatus.PENDING, message: "Queued for billing." };
  if (row.action === "ERROR") return { homeownerId: row.homeownerId, status: BillingGenerationJobItemStatus.FAILED, message: row.message };
  return { homeownerId: row.homeownerId, status: BillingGenerationJobItemStatus.SKIPPED, message: row.message };
}

function terminalStatus(succeeded: number, failed: number, skipped: number) {
  if (failed === 0) return BillingGenerationJobStatus.SUCCEEDED;
  if (succeeded + skipped > 0) return BillingGenerationJobStatus.PARTIAL;
  return BillingGenerationJobStatus.FAILED;
}

function serializeBillingJob(job: {
  id: string;
  reference: string;
  status: BillingGenerationJobStatus;
  coverageYear: number;
  coverageMonth: number;
  scope: string;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  retryOfJobId: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}): BillingGenerationJobView {
  return {
    id: job.id,
    reference: job.reference,
    status: job.status,
    coverageYear: job.coverageYear,
    coverageMonth: job.coverageMonth,
    scope: job.scope,
    total: job.total,
    completed: job.completed,
    succeeded: job.succeeded,
    failed: job.failed,
    skipped: job.skipped,
    percent: billingGenerationProgressPercent(job.completed, job.total),
    retryOfJobId: job.retryOfJobId,
    lastError: job.lastError,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    canRetry: job.failed > 0 && isTerminalStatus(job.status),
  };
}

function isTerminalStatus(status: BillingGenerationJobStatus) {
  return status === BillingGenerationJobStatus.SUCCEEDED
    || status === BillingGenerationJobStatus.PARTIAL
    || status === BillingGenerationJobStatus.FAILED;
}

function normalizeIdempotencyKey(value: string) {
  const normalized = value.trim();
  if (normalized.length < 16 || normalized.length > 200) throw new Error("Billing request identity is invalid. Refresh the billing preview and try again.");
  return normalized;
}

function generationTargetFilter(input: BillingGenerationInput) {
  return {
    scope: input.scope,
    homeownerIds: input.homeownerIds ?? [],
    block: input.block || null,
    phase: input.phase || null,
  };
}

function billingJobReference(year: number, month: number) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return `BG-${year}${String(month).padStart(2, "0")}-${suffix}`;
}

function safeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message.slice(0, 2_000);
  return fallback;
}
