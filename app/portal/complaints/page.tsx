import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requireComplaintHomeowner, getHomeownerComplaintList, complaintPrivacyLabel } from "@/lib/services/complaints";
import { shortDate } from "@/lib/utils";

export default async function PortalComplaintsPage() {
  const user = await requireComplaintHomeowner();
  const complaints = await getHomeownerComplaintList(user);
  return <>
    <PageHeader eyebrow="Homeowner services" title="My Complaints" description="Review named and confidential complaints submitted through your homeowner account." action={<Link className="btn-primary" href="/portal/complaints/new">Submit complaint</Link>} />
    <div className="mb-5 flex flex-wrap gap-2">
      <Link className="btn-secondary" href="/complaints/track">Track anonymous complaint</Link>
    </div>
    <section className="card p-0 sm:p-0">
      {complaints.length ? <div className="table-wrap rounded-none shadow-none"><table className="data-table min-w-[860px]"><thead><tr><th>Complaint</th><th>Privacy</th><th>Category</th><th>Submitted</th><th>Status</th><th>Activity</th><th>Action</th></tr></thead><tbody>
        {complaints.map((item) => <tr key={item.id}><td><p className="font-black">{item.title}</p><p className="font-mono text-xs text-slate-500">{item.complaintNumber}</p></td><td>{complaintPrivacyLabel(item.privacyMode)}</td><td>{item.category?.name || "General"}</td><td>{shortDate(item.submittedAt)}</td><td><StatusBadge status={item.status} /></td><td className="text-xs text-slate-500">{item._count.messages} messages | {item._count.attachments} attachments</td><td><Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/portal/complaints/${item.id}`}>View</Link></td></tr>)}
      </tbody></table></div> : <div className="py-14 text-center text-sm text-slate-500">No named or confidential complaints have been submitted from your account.</div>}
    </section>
  </>;
}
