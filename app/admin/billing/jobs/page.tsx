import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { listRecentBillingGenerationJobs } from "@/lib/services/billing-generation-jobs";

export const dynamic = "force-dynamic";

export default async function BillingJobsPage() {
  const admin = await requirePermission(Permission.BILLING_GENERATE);
  const jobs = await listRecentBillingGenerationJobs(admin.tenantId, 20);

  return <>
    <PageHeader
      eyebrow="Collections / Billing"
      title="Recent monthly billing jobs"
      description="Open persisted bulk billing progress after refresh, reconnection, or navigation."
      action={<Link className="btn-secondary" href="/admin/billing">Back to Billing</Link>}
    />
    <section className="card">
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="data-table min-w-[900px]">
          <thead><tr><th>Reference</th><th>Coverage</th><th>Status</th><th>Progress</th><th>Succeeded</th><th>Failed</th><th>Skipped</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            {jobs.map((job) => <tr key={job.id}>
              <td className="font-black">{job.reference}</td>
              <td>{monthLabel(job.coverageYear, job.coverageMonth)}</td>
              <td>{statusLabel(job.status)}</td>
              <td className="font-bold">{job.completed.toLocaleString()} / {job.total.toLocaleString()} ({job.percent}%)</td>
              <td>{job.succeeded.toLocaleString()}</td>
              <td>{job.failed.toLocaleString()}</td>
              <td>{job.skipped.toLocaleString()}</td>
              <td>{new Date(job.updatedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</td>
              <td className="text-right"><Link className="btn-secondary min-h-8 px-3 py-1" href={`/admin/billing/jobs/${encodeURIComponent(job.id)}`}>Open</Link></td>
            </tr>)}
            {!jobs.length && <tr><td colSpan={9} className="py-10 text-center text-slate-500">No durable billing jobs have been created for this tenant.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </>;
}

function monthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
}

function statusLabel(status: string) {
  if (status === "QUEUED") return "Queued";
  if (status === "RUNNING") return "Processing";
  if (status === "SUCCEEDED") return "Completed";
  if (status === "PARTIAL") return "Completed with failures";
  return "Failed";
}
