import Link from "next/link";
import { ComplaintPrivacyMode, ComplaintStatus } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { complaintPrivacyLabel, getAdminComplaintList, requireComplaintAdmin } from "@/lib/services/complaints";
import { shortDate } from "@/lib/utils";

type Query = { status?: string; privacy?: string; q?: string; success?: string; error?: string };

export default async function AdminComplaintsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireComplaintAdmin();
  const query = await searchParams;
  const complaints = await getAdminComplaintList(user, query);
  return <>
    <PageHeader eyebrow="Resident services" title="Complaint Management" description="Tenant-scoped complaint intake, triage, assignment, and status tracking." action={<Link className="btn-secondary" href="/admin/complaints/reports">Reports</Link>} />
    {query.success && <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{query.success}</p>}
    {query.error && <p className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{query.error}</p>}
    <form className="card mb-5 grid gap-3 md:grid-cols-[1fr_210px_210px_auto]" method="get">
      <input className="field" type="search" name="q" defaultValue={query.q || ""} placeholder="Search number, reference, title, or location" />
      <select className="field" name="status" defaultValue={query.status || ""}><option value="">All statuses</option>{Object.values(ComplaintStatus).map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select>
      <select className="field" name="privacy" defaultValue={query.privacy || ""}><option value="">All privacy modes</option>{Object.values(ComplaintPrivacyMode).map((mode) => <option key={mode} value={mode}>{complaintPrivacyLabel(mode)}</option>)}</select>
      <button className="btn-secondary">Apply</button>
    </form>
    <section className="card p-0 sm:p-0">
      {complaints.length ? <div className="table-wrap rounded-none shadow-none"><table className="data-table min-w-[1100px]"><thead><tr><th>Complaint</th><th>Privacy</th><th>Category</th><th>Submitted</th><th>Assigned</th><th>Status</th><th>Activity</th><th>Action</th></tr></thead><tbody>
        {complaints.map((item) => <tr key={item.id}><td><Link className="font-black text-pine-800 hover:underline" href={`/admin/complaints/${item.id}`}>{item.title}</Link><p className="font-mono text-xs text-slate-500">{item.complaintNumber} | {item.publicReference}</p></td><td>{complaintPrivacyLabel(item.privacyMode)}</td><td>{item.category?.name || "General"}</td><td>{shortDate(item.submittedAt)}</td><td>{item.assignedTo?.name || "Unassigned"}</td><td><StatusBadge status={item.status} /></td><td className="text-xs text-slate-500">{item._count.messages} messages | {item._count.attachments} attachments</td><td><Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/admin/complaints/${item.id}`}>Review</Link></td></tr>)}
      </tbody></table></div> : <div className="py-14 text-center text-sm text-slate-500">No complaints match the selected filters.</div>}
    </section>
  </>;
}
