import { TenantModule } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { isUxActionProgressEnabled } from "@/lib/feature-flags/ux-action-progress";
import {
  createFailedBillingGenerationRetry,
  processBillingGenerationJob,
} from "@/lib/services/billing-generation-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

type JobRouteContext = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, context: JobRouteContext) {
  const admin = await requirePermission(Permission.BILLING_GENERATE);
  const enabled = isUxActionProgressEnabled({ tenantId: admin.tenantId, module: TenantModule.BILLING, role: admin.role });
  if (!enabled) return NextResponse.json({ error: "Billing job retry is disabled by the rollout control." }, { status: 409 });

  const { jobId } = await context.params;
  let idempotencyKey = "";
  try {
    const payload = await request.json() as { idempotencyKey?: unknown };
    idempotencyKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey : "";
  } catch {
    return NextResponse.json({ error: "Invalid retry request." }, { status: 400 });
  }

  try {
    const { job } = await createFailedBillingGenerationRetry({
      actor: admin,
      sourceJobId: jobId,
      idempotencyKey,
    });
    after(async () => {
      await processBillingGenerationJob(job.id, admin).catch(() => undefined);
    });
    return NextResponse.json({ jobId: job.id, reference: job.reference }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Billing retry could not be created." }, { status: 400 });
  }
}
