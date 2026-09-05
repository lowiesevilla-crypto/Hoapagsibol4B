import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { platformPrisma } from "@/lib/db";
import { processQueuedEmailNotifications } from "@/lib/services/notifications";
import { runWithTenant } from "@/lib/tenant-context";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!authorizeCron(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const tenants = await platformPrisma.tenant.findMany({
    where: { status: "ACTIVE", subscriptionStatus: { not: "CANCELLED" } },
    select: {
      id: true,
      moduleEntitlements: { where: { enabled: true }, select: { module: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const limit = boundedInteger(process.env.EMAIL_DELIVERY_BATCH_SIZE, 25, 1, 100);
  const aggregate = {
    enabled: process.env.EMAIL_BULK_DELIVERY_ENABLED === "true",
    tenantsProcessed: 0,
    tenantsFailed: 0,
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    requeued: 0,
    remaining: 0,
    circuitOpenTenants: 0,
  };

  for (const tenant of tenants) {
    const modules = tenant.moduleEntitlements.map((item) => item.module);
    try {
      const result = await runWithTenant(
        tenant.id,
        () => processQueuedEmailNotifications(tenant.id, { limit }),
        { enabledModules: modules },
      );
      aggregate.tenantsProcessed++;
      aggregate.processed += result.processed;
      aggregate.sent += result.sent;
      aggregate.failed += result.failed;
      aggregate.skipped += result.skipped;
      aggregate.requeued += result.requeued;
      aggregate.remaining += result.remaining;
      if (result.circuitOpen) aggregate.circuitOpenTenants++;
    } catch (error) {
      aggregate.tenantsFailed++;
      console.error("[email-delivery] tenant queue processing failed", {
        error: error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 300) : "Unknown worker error",
      });
    }
  }

  const ok = aggregate.tenantsFailed === 0;
  return NextResponse.json({ ok, ...aggregate }, { status: ok ? 200 : 500 });
}

function boundedInteger(raw: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}
