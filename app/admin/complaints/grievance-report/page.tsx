import { StandardTable } from "@/components/standard-table";
import Link from "next/link";
import { ComplaintPrivacyMode, ComplaintStatus, Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { complaintPrivacyLabel, getComplaintCategories, requireComplaintAdmin } from "@/lib/services/complaints";
import { requireGrievancePermission } from "@/lib/services/grievance-foundation";
import { getGrievanceReport } from "@/lib/services/grievance-reporting";
import { shortDate } from "@/lib/utils";

const grievanceStatuses = ["ASSESSMENT", "VERIFICATION_REQUIRED", "VERIFIED", "READY_FOR_FORMAL_PROCESS", "CLOSED_NO_ACTION", "CLOSED_UNSUBSTANTIATED"];
const verificationStatuses = ["NOT_EVALUATED", "NOT_REQUIRED", "PENDING", "IN_PROGRESS", "PASSED", "FAILED", "INSUFFICIENT"];

export default async function GrievanceReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireComplaintAdmin();
  await requireGrievancePermission(user, "VIEW_GRIEVANCE");

  const query = await searchParams;
  const complaintStatus = Object.values(ComplaintStatus).includes(query.status as ComplaintStatus) ? query.status : undefined;
  const grievanceStatus = grievanceStatuses.includes(String(query.grievanceStatus || "")) ? query.grievanceStatus : undefined;
  const verificationStatus = verificationStatuses.includes(String(query.verificationStatus || "")) ? query.verificationStatus : undefined;
  const privacyMode = Object.values(ComplaintPrivacyMode).includes(query.privacyMode as ComplaintPrivacyMode) ? query.privacyMode : undefined;
  const page = Math.max(1, Number(query.page) || 1);
  const dateFrom = parseManilaBoundary(query.dateFrom, false);
  const dateTo = parseManilaBoundary(query.dateTo, true);

  const [report, categories, assignees] = await Promise.all([
    getGrievanceReport(user, {
      q: query.q,
      complaintStatus,
      grievanceStatus,
      verificationStatus,
      privacyMode,
      categoryId: query.categoryId,
      assignedToId: query.assignedToId,
      dateFrom,
      dateTo,
      page,
      pageSize: 25,
      foundationOnly: true,
    }),
    getComplaintCategories(user.tenantId, false),
    prisma.user.findMany({
      where: { tenantId: user.tenantId, active: true, role: { in: [Role.ADMIN, Role.SYSTEM_ADMIN, Role.HOA_ADMIN, Role.STAFF] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return <>
    <PageHeader eyebrow="Complaint management" title="Grievance Foundation Report" description="Privacy-safe reporting across complaint status, formal grievance state, independent verification, handler, and dates." action={<div className="flex flex-wrap gap-2"><Link className="btn-secondary" href="/admin/complaints">Queue</Link><Link className="btn-secondary" href="/admin/complaints/reports">Complaint reports</Link></div>} />

    <section className="card mb-5">
      <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" method="get">
        <label><span className="label">Search</span><input className="field" name="q" defaultValue={query.q || ""} placeholder="Number, reference, title, category" /></label>
        <label><span className="label">Complaint status</span><select className="field" name="status" defaultValue={complaintStatus || ""}><option value="">All</option>{Object.values(ComplaintStatus).map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
        <label><span className="label">Grievance status</span><select className="field" name="grievanceStatus" defaultValue={grievanceStatus || ""}><option value="">All</option>{grievanceStatuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
        <label><span className="label">Verification state</span><select className="field" name="verificationStatus" defaultValue={verificationStatus || ""}><option value="">All</option>{verificationStatuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
        <label><span className="label">Privacy</span><select className="field" name="privacyMode" defaultValue={privacyMode || ""}><option value="">All privacy modes</option>{Object.values(ComplaintPrivacyMode).map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
        <label><span className="label">Category</span><select className="field" name="categoryId" defaultValue={query.categoryId || ""}><option value="">All categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span className="label">Handler</span><select className="field" name="assignedToId" defaultValue={query.assignedToId || ""}><option value="">All handlers</option>{assignees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-2"><label><span className="label">From</span><input className="field" type="date" name="dateFrom" defaultValue={query.dateFrom || ""} /></label><label><span className="label">To</span><input className="field" type="date" name="dateTo" defaultValue={query.dateTo || ""} /></label></div>
        <div className="flex flex-wrap items-end gap-2 xl:col-span-4"><button className="btn-primary">Apply filters</button><Link className="btn-secondary" href="/admin/complaints/grievance-report">Reset</Link></div>
      </form>
      <p className="mt-3 text-xs text-slate-500">This report excludes complainant identity fields. Confidential identity access remains a separate, reasoned and audited workflow.</p>
    </section>

    <section className="mb-5 grid gap-3 sm:grid-cols-3">
      <Metric label="Matching grievance records" value={report.total} />
      <Metric label="Current page" value={`${report.page} / ${report.totalPages}`} />
      <Metric label="Page size" value={report.pageSize} />
    </section>

    <section className="card overflow-x-auto">
      <StandardTable><table className="w-full min-w-[1180px] text-sm">
        <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500"><th className="pb-3">Complaint</th><th className="pb-3">Privacy</th><th className="pb-3">Category</th><th className="pb-3">Submitted</th><th className="pb-3">Handler</th><th className="pb-3">Complaint</th><th className="pb-3">Grievance</th><th className="pb-3">Verification</th><th className="pb-3">Board review policy</th></tr></thead>
        <tbody>{report.rows.map((item) => <tr key={item.complaintId} className="border-b border-slate-100 align-top"><td className="py-3 pr-4"><Link className="font-black text-pine-800 hover:underline" href={`/admin/complaints/${item.complaintId}`}>{item.title}</Link><p className="font-mono text-xs text-slate-500">{item.complaintNumber} · {item.publicReference}</p></td><td className="py-3 pr-4">{complaintPrivacyLabel(item.privacyMode as ComplaintPrivacyMode)}</td><td className="py-3 pr-4">{item.categoryName || "General"}</td><td className="py-3 pr-4">{shortDate(item.submittedAt)}</td><td className="py-3 pr-4">{item.assignedToName || "Unassigned"}</td><td className="py-3 pr-4"><StatusBadge status={item.complaintStatus} /></td><td className="py-3 pr-4"><span className="badge badge-info">{item.grievanceStatus ? label(item.grievanceStatus) : "Not initiated"}</span></td><td className="py-3 pr-4"><VerificationBadge status={item.verificationStatus} required={Boolean(item.verificationRequired)} blocked={Boolean(item.blocksEnforcement)} /></td><td className="py-3">{Boolean(item.boardReviewRequired) ? <span className="badge badge-warning">Required by policy</span> : <span className="badge">Not flagged</span>}</td></tr>)}</tbody>
      </table></StandardTable>
      {report.rows.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No grievance foundation records match the selected filters.</p>}
    </section>

    {report.totalPages > 1 && <nav className="mt-5 flex items-center justify-between gap-3 text-sm" aria-label="Grievance report pages">
      {report.page > 1 ? <Link className="btn-secondary" href={pageHref(query, report.page - 1)}>Previous</Link> : <span />}
      <span className="font-bold text-slate-600">Page {report.page} of {report.totalPages}</span>
      {report.page < report.totalPages ? <Link className="btn-secondary" href={pageHref(query, report.page + 1)}>Next</Link> : <span />}
    </nav>}
  </>;
}

function VerificationBadge({ status, required, blocked }: { status: string | null; required: boolean; blocked: boolean }) {
  if (!status) return <span className="badge">Not evaluated</span>;
  const tone = status === "PASSED" ? "badge-success" : required && blocked ? "badge-danger" : "badge-info";
  return <span className={`badge ${tone}`}>{label(status)}</span>;
}

function Metric({ label: title, value }: { label: string; value: string | number }) {
  return <div className="card"><p className="text-xs font-black uppercase tracking-[.12em] text-slate-500">{title}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div>;
}

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseManilaBoundary(value: string | undefined, endOfDay: boolean) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pageHref(query: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value && key !== "page") params.set(key, value);
  params.set("page", String(page));
  return `/admin/complaints/grievance-report?${params.toString()}`;
}