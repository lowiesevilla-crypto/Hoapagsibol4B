import Link from "next/link";
import { notFound } from "next/navigation";
import { BillingGenerationJobProgress } from "@/components/billing-generation-job-progress";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { getBillingGenerationJobView } from "@/lib/services/billing-generation-jobs";
import { isUxActionProgressEnabled } from "@/lib/feature-flags/ux-action-progress";
import { TenantModule } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type JobPageProps = { params: Promise<{ jobId: string }> };

export default async function BillingJobPage({ params }: JobPageProps) {
  const admin = await requirePermission(Permission.BILLING_GENERATE);
  const { jobId } = await params;
  const job = await getBillingGenerationJobView(jobId, admin.tenantId);
  if (!job) notFound();
  const processingEnabled = isUxActionProgressEnabled({ tenantId: admin.tenantId, module: TenantModule.BILLING, role: admin.role });

  return <>
    <PageHeader
      eyebrow="Collections / Billing"
      title="Monthly billing job"
      description="Inspect persisted large-batch progress without keeping the original Billing page open."
      action={<div className="flex flex-wrap gap-2"><Link className="btn-secondary" href="/admin/billing/jobs">Recent billing jobs</Link><Link className="btn-secondary" href="/admin/billing">Back to Billing</Link></div>}
    />
    <BillingGenerationJobProgress jobId={job.id} processingEnabled={processingEnabled} />
  </>;
}
