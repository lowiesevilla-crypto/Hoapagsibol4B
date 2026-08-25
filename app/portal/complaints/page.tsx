import { StandardTable } from "@/components/standard-table";
import Link from "next/link";
import { ComplaintStatus } from "@prisma/client";
import { MessageSquarePlus, Search } from "lucide-react";
import { ComplaintRequestCard, RequestAreaNavigation, RequestEmptyState, RequestMetricCard, requestTone, statusLabel } from "@/components/homeowner/requests/request-cards";
import { PortalPageContainer, PortalSectionHeader } from "@/components/portal-mobile-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { complaintPrivacyLabel, getHomeownerComplaintList, requireComplaintHomeowner } from "@/lib/services/complaints";
import { shortDate } from "@/lib/utils";

export default async function PortalComplaintsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requireComplaintHomeowner();
  const query = await searchParams;
  const q = query.q?.trim().toLowerCase() || "";
  const statusFilter = query.status || "all";
  const complaints = await getHomeownerComplaintList(user);
  const filtered = complaints.filter((item) => {
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const haystack = [item.title, item.complaintNumber, item.publicReference, item.category?.name, complaintPrivacyLabel(item.privacyMode), item.status].join(" ").toLowerCase();
    return matchesStatus && (!q || haystack.includes(q));
  });
  const openCount = complaints.filter((item) => !closedStatuses.has(item.status)).length;
  const latest = complaints[0]?.updatedAt ? shortDate(complaints[0].updatedAt) : "No activity";

  return (
    <PortalPageContainer className="space-y-6">
      <RequestAreaNavigation active="complaints" />
      <PageHeader eyebrow="Homeowner services" title="My Complaints" description="Review named and confidential complaints submitted through your homeowner account." action={<Link className="btn-primary" href="/portal/complaints/new">Submit complaint</Link>} />
      <section className="grid gap-3 md:grid-cols-3">
        <RequestMetricCard label="Open Cases" value={String(openCount)} note="Visible cases needing review or HOA action" icon={MessageSquarePlus} tone={openCount ? "warning" : "success"} />
        <RequestMetricCard label="Total Cases" value={String(complaints.length)} note="Limited to complaints tied to your homeowner account" icon={MessageSquarePlus} tone="info" />
        <RequestMetricCard label="Latest Update" value={latest} note="Most recent visible homeowner complaint activity" icon={MessageSquarePlus} tone="default" />
      </section>
      <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
        <PortalSectionHeader eyebrow="Search and filter" title="Complaint History" action={<Link className="text-sm font-black text-pine-700" href="/complaints/track">Track anonymous</Link>} />
        <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]" action="/portal/complaints">
          <label><span className="label">Search</span><input className="field min-h-12" type="search" name="q" defaultValue={query.q || ""} placeholder="Case number, title, category" /></label>
          <label><span className="label">Status</span><select className="field min-h-12" name="status" defaultValue={statusFilter}><option value="all">All statuses</option>{Object.values(ComplaintStatus).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
          <div className="flex items-end"><button className="btn-primary min-h-12 w-full"><Search className="size-4" /> Apply</button></div>
        </form>
      </section>

      {filtered.length ? (
        <>
          <section className="space-y-3 md:hidden" aria-label="Mobile complaint cards">
            {filtered.map((item) => <ComplaintRequestCard key={item.id} title={item.title} reference={item.complaintNumber || item.publicReference} status={statusLabel(item.status)} statusTone={requestTone(item.status)} privacy={complaintPrivacyLabel(item.privacyMode)} category={item.category?.name || "General"} submitted={shortDate(item.submittedAt)} activity={`${item._count.messages} messages | ${item._count.attachments} attachments`} href={`/portal/complaints/${item.id}`} />)}
          </section>
          <section className="hidden rounded-3xl border border-pine-100 bg-white shadow-soft md:block">
            <div className="table-wrap rounded-3xl shadow-none">
              <StandardTable><table className="data-table min-w-[860px]">
                <thead><tr><th>Complaint</th><th>Privacy</th><th>Category</th><th>Submitted</th><th>Status</th><th>Activity</th><th>Action</th></tr></thead>
                <tbody>{filtered.map((item) => <tr key={item.id}><td><p className="font-black">{item.title}</p><p className="font-mono text-xs text-slate-500">{item.complaintNumber}</p></td><td>{complaintPrivacyLabel(item.privacyMode)}</td><td>{item.category?.name || "General"}</td><td>{shortDate(item.submittedAt)}</td><td><StatusBadge status={item.status} /></td><td className="text-xs text-slate-500">{item._count.messages} messages | {item._count.attachments} attachments</td><td><Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/portal/complaints/${item.id}`}>View</Link></td></tr>)}</tbody>
              </table></StandardTable>
            </div>
          </section>
        </>
      ) : (
        <RequestEmptyState title="No matching complaints" description="Named and confidential complaints submitted from your homeowner account will appear here." icon={MessageSquarePlus} />
      )}
    </PortalPageContainer>
  );
}

const closedStatuses = new Set<ComplaintStatus>([ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED, ComplaintStatus.ARCHIVED, ComplaintStatus.REJECTED, ComplaintStatus.WITHDRAWN]);
