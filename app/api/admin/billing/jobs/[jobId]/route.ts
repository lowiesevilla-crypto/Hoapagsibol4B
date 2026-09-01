import { TenantModule } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { isUxActionProgressEnabled } from "@/lib/feature-flags/ux-action-progress";
import {
  getBillingGenerationJobView,
  processBillingGenerationJob,
} from "@/lib/services/billing-generation-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type JobRouteContext = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, context: JobRouteContext) {
  const admin = await requirePermission(Permission.BILLING_GENERATE);
  const { jobId } = await context.params;
  const job = await getBillingGenerationJobView(jobId, admin.tenantId);
  if (!job) return NextResponse.json({ error: "Billing generation job was not found." }, { status: 404 });
  return NextResponse.json(job, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(_request: Request, context: JobRouteContext) {
  const admin = await requirePermission(Permission.BILLING_GENERATE);
  const enabled = isUxActionProgressEnabled({ tenantId: admin.tenantId, module: TenantModule.BILLING, role: admin.role });
  if (!enabled) return NextResponse.json({ error: "Billing job processing is disabled by the rollout control." }, { status: 409 });

  const { jobId } = await context.params;
  const job = await getBillingGenerationJobView(jobId, admin.tenantId);
  if (!job) return NextResponse.json({ error: "Billing generation job was not found." }, { status: 404 });

  after(async () => {
    await processBillingGenerationJob(jobId, admin).catch(() => undefined);
  });
  return NextResponse.json({ accepted: true, job }, { status: 202, headers: { "Cache-Control": "no-store, max-age=0" } });
}
