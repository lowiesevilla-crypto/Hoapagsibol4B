import { after, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { drainHomeownerActivationBulkJobs, getHomeownerActivationBulkJobProgress } from "@/lib/services/homeowner-activation-bulk-jobs";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireUser(Role.ADMIN);
  const { id } = await params;
  const job = await getHomeownerActivationBulkJobProgress(admin.tenantId, id);
  if (!job) return NextResponse.json({ error: "Activation job not found." }, { status: 404 });
  if (process.env.HOMEOWNER_ACTIVATION_BULK_DELIVERY_ENABLED === "true" && ["QUEUED", "RUNNING"].includes(job.status) && job.queuedCount > 0) {
    after(async () => {
      await drainHomeownerActivationBulkJobs(admin.tenantId).catch((error) => {
        console.error("[homeowner-activation-bulk] progress-triggered drain failed", {
          error: error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 300) : "Unknown activation bulk worker error",
        });
      });
    });
  }
  return NextResponse.json({ job });
}
