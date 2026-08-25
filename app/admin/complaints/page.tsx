import { StandardTable } from "@/components/standard-table";
import Link from "next/link";
import { ComplaintPrivacyMode, ComplaintStatus } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { complaintPrivacyLabel, getAdminComplaintList, requireComplaintAdmin } from "@/lib/services/complaints";
import { requireGrievancePermission } from "@/lib/services/grievance-foundation";
import { getGrievanceComplaintQueue, getGrievanceMetadataForComplaints } from "@/lib/services/grievance-reporting";
import { shortDate } from "@/lib/utils";

type Query = {
  status?: string;
  privacy?: string;
  grievanceStatus?: string;
  verificationStatus?: string;
  q?: string;
  success?: string;
  error?: string;
};

type ComplaintQueueItem = {
  id: string;
  complaintNumber: string;
  publicReference: string;
  title: string;
  privacyMode: ComplaintPrivacyMode;
  status: ComplaintStatus;
  submittedAt: Date;
  category: { name: string } | null;
  assignedTo: { name: string } | null;
  _count: { messages: number; attachments: number };
};

type GrievanceMetadata = {
  grievanceStatus: string | null;
  verificationStatus: string | null;
  verificationRequired: number | boolean | null;
  blocksEnforcement: number | boolean | null;
};

const grievanceStatuses = ["ASSESSMENT", "VERIFICATION_REQUIRED", "VERIFIED", "READY_FOR_FORMAL_PROCESS", "CLOSED_NO_ACTION", "CLOSED_UNSUBSTANTIATED"] as const;
const verificationStatuses = ["NOT_EVALUATED", "NOT_REQUIRED", "PENDING", "IN_PROGRESS", "PASSED", "FAILED", "INSUFFICIENT"] as const;

async function canViewGrievance(user: Parameters<typeof requireGrievancePermission>[0]) {
  try {
    await requireGrievancePermission(user, "VIEW_GRIEVANCE");
    return true;
  } catch {
    return false;
  }
}

export default async function AdminComplaintsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireComplaintAdmin();
  const query = await searchParams;
  const canManageGrievance = await canViewGrievance(user);
  const selectedGrievanceStatus = grievanceStatuses.includes(query.grievanceStatus as (typeof grievanceStatuses)[number]) ? query.grievanceStatus : undefined;
  const selectedVerificationStatus = verificationStatuses.includes(query.verificationStatus as (typeof verificationStatuses)[number]) ? query.verificationStatus : undefined;
  const complaintStatus = Object.values(ComplaintStatus).includes(query.status as ComplaintStatus) ? query.status : undefined;
  const privacyMode = Object.values(ComplaintPrivacyMode).includes(query.privacy as ComplaintPrivacyMode) ? query.privacy : undefined;
  const useFormalFilters = canManageGrievance && Boolean(selectedGrievanceStatus || selectedVerificationStatus);

  let complaints: ComplaintQueueItem[];
  let grievanceMetadata = new Map<string, GrievanceMetadata>();

  if (useFormalFilters) {
    const formalRows = await getGrievanceComplaintQueue(user, {
      q: query.q,
      complaintStatus,
      grievanceStatus: selectedGrievanceStatus,
      verificationStatus: selectedVerificationStatus,
      privacyMode,
    });
    complaints = formalRows.map((row) => ({
      id: row.id,
      complaintNumber: row.complaintNumber,
      publicReference: row.publicReference,
      title: row.title,
      privacyMode: row.privacyMode,
      status: row.status,
      submittedAt: row.submittedAt,
      category: row.categoryName ? { name: row.categoryName } : null,
      assignedTo: row.assignedToName ? { name: row.assignedToName } : null,
      _count: { messages: Number(row.messageCount), attachments: Number(row.attachmentCount) },
    }));
    grievanceMetadata = new Map(formalRows.map((row) => [row.id, {
      grievanceStatus: row.grievanceStatus,
      verificationStatus: row.verificationStatus,
      verificationRequired: row.verificationRequired,
      blocksEnforcement: row.blocksEnforcement,
    }]));
  } else {
    const baseComplaints = await getAdminComplaintList(user, query);
    complaints = baseComplaints.map((item) => ({
      id: item.id,
      complaintNumber: item.complaintNumber,
      publicReference: item.publicReference,
      title: item.title,
      privacyMode: item.privacyMode,
      status: item.status,
      submittedAt: item.submittedAt,
      category: item.category ? { name: item.category.name } : null,
      assignedTo: item.assignedTo ? { name: item.assignedTo.name } : null,
      _count: item._count,
    }));
    if (canManageGrievance && complaints.length > 0) {
      const metadataRows = await getGrievanceMetadataForComplaints(user, complaints.map((item) => item.id));
      grievanceMetadata = new Map(metadataRows.map((item) => [item.complaintId, {
        grievanceStatus: item.grievanceStatus,
        verificationStatus: item.verificationStatus,
        verificationRequired: item.verificationRequired,
        blocksEnforcement: item.blocksEnforcement,
      }]));
    }
  }

  return <>
    <PageHeader
      eyebrow="Resident services"
      title="Complaint Management"
      description="Tenant-scoped complaint intake, triage, assignment, and status tracking. Complaint status remains the operational queue state; grievance and verification are separate formal-process states."
      action={<div className="flex flex-wrap gap-2"><Link className="btn-secondary" href="/admin/complaints/reports">Reports</Link>{canManageGrievance && <Link className="btn-secondary" href="/admin/complaints/grievance-report">Grievance report</Link>}</div>}
    />
    {query.success && <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{query.success}</p>}
    {query.error && <p className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{query.error}</p>}
    <form className={`card mb-5 grid gap-3 ${canManageGrievance ? "md:grid-cols-2 xl:grid-cols-[1fr_190px_190px_210px_210px_auto]" : "md:grid-cols-[1fr_210px_210px_auto]"}`} method="get">
      <input className="field" type="search" name="q" defaultValue={query.q || ""} placeholder="Search number, reference, title, or location" />
      <select className="field" name="status" defaultValue={query.status || ""}><option value="">All complaint statuses</option>{Object.values(ComplaintStatus).map((status) => <option key={status} value={status}>{label(status)}</option>)}</select>
      <select className="field" name="privacy" defaultValue={query.privacy || ""}><option value="">All privacy modes</option>{Object.values(ComplaintPrivacyMode).map((mode) => <option key={mode} value={mode}>{complaintPrivacyLabel(mode)}</option>)}</select>
      {canManageGrievance && <select className="field" name="grievanceStatus" defaultValue={query.grievanceStatus || ""}><option value="">All grievance states</option>{grievanceStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select>}
      {canManageGrievance && <select className="field" name="verificationStatus" defaultValue={query.verificationStatus || ""}><option value="">All verification states</option>{verificationStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select>}
      <button className="btn-secondary">Apply</button>
      {canManageGrievance && <p className="text-xs text-slate-500 md:col-span-2 xl:col-span-6">Complaint status remains the operational queue state. Grievance status and independent verification are filtered and displayed separately.</p>}
    </form>
    <section className="card p-0 sm:p-0">
      {complaints.length ? <div className="table-wrap rounded-none shadow-none"><StandardTable><table className={`data-table ${canManageGrievance ? "min-w-[1320px]" : "min-w-[1100px]"}`}><thead><tr><th>Complaint</th><th>Privacy</th><th>Category</th><th>Submitted</th><th>Assigned</th><th>Complaint status</th>{canManageGrievance && <th>Grievance</th>}{canManageGrievance && <th>Verification</th>}<th>Activity</th><th>Action</th></tr></thead><tbody>
        {complaints.map((item) => {
          const metadata = grievanceMetadata.get(item.id);
          return <tr key={item.id}><td><Link className="font-black text-pine-800 hover:underline" href={`/admin/complaints/${item.id}`}>{item.title}</Link><p className="font-mono text-xs text-slate-500">{item.complaintNumber} | {item.publicReference}</p></td><td>{complaintPrivacyLabel(item.privacyMode)}</td><td>{item.category?.name || "General"}</td><td>{shortDate(item.submittedAt)}</td><td>{item.assignedTo?.name || "Unassigned"}</td><td><StatusBadge status={item.status} /></td>{canManageGrievance && <td><span className="badge badge-info">{metadata?.grievanceStatus ? label(metadata.grievanceStatus) : "Not initiated"}</span></td>}{canManageGrievance && <td><VerificationBadge status={metadata?.verificationStatus || null} required={Boolean(metadata?.verificationRequired)} blocked={Boolean(metadata?.blocksEnforcement)} /></td>}<td className="text-xs text-slate-500">{item._count.messages} messages | {item._count.attachments} attachments</td><td><Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/admin/complaints/${item.id}`}>Review</Link></td></tr>;
        })}
      </tbody></table></StandardTable></div> : <div className="py-14 text-center text-sm text-slate-500">No complaints match the selected filters.</div>}
    </section>
  </>;
}

function VerificationBadge({ status, required, blocked }: { status: string | null; required: boolean; blocked: boolean }) {
  if (!status) return <span className="badge">Not evaluated</span>;
  const tone = status === "PASSED" ? "badge-success" : required && blocked ? "badge-danger" : "badge-info";
  return <span className={`badge ${tone}`}>{label(status)}</span>;
}

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}