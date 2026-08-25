import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db";
import { complaintPrivacyLabel, complaintStatusLabel, getComplaintReports, requireComplaintAdmin } from "@/lib/services/complaints";
import { shortDate } from "@/lib/utils";

export default async function ComplaintReportsPage({ searchParams }: { searchParams: Promise<{ status?: string; privacy?: string; categoryId?: string; assignedToId?: string; dateFrom?: string; dateTo?: string; page?: string }> }) {
  const user = await requireComplaintAdmin();
  const query = await searchParams;
  const [report, categories, handlers] = await Promise.all([
    getComplaintReports(user, query),
    prisma.complaintCategory.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { tenantId: user.tenantId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return <>
    <PageHeader eyebrow="Complaint management" title="Complaint Reports" description="Tenant-scoped operational summary without confidential identity fields." action={<Link className="btn-secondary" href="/admin/complaints">Complaint queue</Link>} />
    <form className="card mb-5 grid gap-3 md:grid-cols-3 xl:grid-cols-7">
      <select className="field" name="status" defaultValue={query.status || ""}><option value="">All statuses</option>{report.byStatus.map((item) => <option key={item.status} value={item.status}>{complaintStatusLabel(item.status)}</option>)}</select>
      <select className="field" name="privacy" defaultValue={query.privacy || ""}><option value="">All privacy modes</option>{report.byPrivacy.map((item) => <option key={item.privacyMode} value={item.privacyMode}>{complaintPrivacyLabel(item.privacyMode)}</option>)}</select>
      <select className="field" name="categoryId" defaultValue={query.categoryId || ""}><option value="">All categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select className="field" name="assignedToId" defaultValue={query.assignedToId || ""}><option value="">All handlers</option>{handlers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <input className="field" type="date" name="dateFrom" defaultValue={query.dateFrom || ""} />
      <input className="field" type="date" name="dateTo" defaultValue={query.dateTo || ""} />
      <button className="btn-primary">Apply filters</button>
    </form>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Total complaints" value={report.total} />
      <Metric label="Open complaints" value={report.open} />
      <Metric label="Filtered complaints" value={report.filteredTotal} />
      <Metric label="Page" value={report.page} />
    </div>
    <div className="mt-6 grid gap-5 xl:grid-cols-2">
      <section className="card"><h2 className="text-lg font-black">By Status</h2><div className="mt-4 space-y-2">{report.byStatus.map((item) => <Row key={item.status} label={complaintStatusLabel(item.status)} value={item._count._all} />)}</div></section>
      <section className="card"><h2 className="text-lg font-black">By Privacy Mode</h2><div className="mt-4 space-y-2">{report.byPrivacy.map((item) => <Row key={item.privacyMode} label={complaintPrivacyLabel(item.privacyMode)} value={item._count._all} />)}</div></section>
    </div>
    <section className="card mt-6">
      <h2 className="text-lg font-black">Filtered Complaint Rows</h2>
      <div className="mt-4 overflow-x-auto"><table><thead><tr><th>Reference</th><th>Subject</th><th>Privacy</th><th>Status</th><th>Category</th><th>Handler</th><th>Submitted</th></tr></thead><tbody>
        {report.rows.map((item) => <tr key={item.id}><td className="font-mono text-xs">{item.publicReference}</td><td><p className="font-bold">{item.title}</p><p className="max-w-sm truncate text-xs text-slate-500">{item.requestedAction || "No requested action recorded"}</p></td><td>{complaintPrivacyLabel(item.privacyMode)}</td><td>{complaintStatusLabel(item.status)}</td><td>{item.category?.name || "General"}</td><td>{item.assignedTo?.name || "Unassigned"}</td><td>{shortDate(item.submittedAt)}</td></tr>)}
      </tbody></table></div>
      <div className="mt-4 flex items-center justify-between text-sm font-bold"><span>{report.filteredTotal} filtered result(s)</span><div className="flex gap-2">{report.page > 1 && <Link className="btn-secondary min-h-9 px-3 py-1.5" href={reportPageHref(query, report.page - 1)}>Previous</Link>}{report.page * report.pageSize < report.filteredTotal && <Link className="btn-secondary min-h-9 px-3 py-1.5" href={reportPageHref(query, report.page + 1)}>Next</Link>}</div></div>
    </section>
  </>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <section className="card"><p className="text-xs font-black uppercase tracking-[.18em] text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></section>;
}

function Row({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm"><span className="font-bold">{label}</span><span className="font-black">{value}</span></div>;
}

function reportPageHref(query: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  params.set("page", String(page));
  return `/admin/complaints/reports?${params.toString()}`;
}
