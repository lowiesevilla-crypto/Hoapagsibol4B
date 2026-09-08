import { after, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { createFailedHomeownerActivationBulkRetry, processNextHomeownerActivationBulkJob } from "@/lib/services/homeowner-activation-bulk-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireUser(Role.ADMIN);
  if (process.env.HOMEOWNER_ACTIVATION_BULK_DELIVERY_ENABLED !== "true") {
    return NextResponse.json({ error: "Bulk activation retry is disabled by the rollout control." }, { status: 409 });
  }

  const { id } = await params;
  let idempotencyKey = "";
  try {
    const payload = await request.json() as { idempotencyKey?: unknown };
    idempotencyKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey : "";
  } catch {
    return NextResponse.json({ error: "Invalid retry request." }, { status: 400 });
  }
  if (!idempotencyKey.trim()) return NextResponse.json({ error: "Retry request is missing an idempotency key." }, { status: 400 });

  try {
    const job = await createFailedHomeownerActivationBulkRetry({
      tenantId: admin.tenantId,
      initiatedById: admin.id,
      sourceJobId: id,
      idempotencyKey,
    });
    after(async () => {
      await processNextHomeownerActivationBulkJob(admin.tenantId).catch(() => undefined);
    });
    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Activation retry could not be created." }, { status: 400 });
  }
}
