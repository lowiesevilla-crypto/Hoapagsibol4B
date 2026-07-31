import Link from "next/link";
import { notFound } from "next/navigation";
import { ComplaintVisibility } from "@prisma/client";
import { ConfidentialIdentityReveal } from "@/components/confidential-identity-reveal";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { addComplaintMessageAction, assignComplaintAction, requestIdentityAccessAction, updateComplaintStatusAction } from "@/lib/actions/complaints";
import { prisma } from "@/lib/db";
import { allowedComplaintTransitions, canRevealConfidentialIdentity, complaintAdminRoles, complaintPrivacyLabel, complaintStatusLabel, getAdminComplaintDetail, requireComplaintAdmin } from "@/lib/services/complaints";
import { shortDate } from "@/lib/utils";

export default async function AdminComplaintDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await requireComplaintAdmin();
  const { id } = await params;
  const query = await searchParams;
  const [complaint, assignees, canRevealIdentity] = await Promise.all([
    getAdminComplaintDetail(user, id),
    prisma.user.findMany({ where: { tenantId: user.tenantId, role: { in: Array.from(complaintAdminRoles) }, active: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    canRevealConfidentialIdentity(user),
  ]);
  if (!complaint) notFound();
  const identityRequested = complaint.identityAccess.some((item) => item.status === "REQUESTED" || item.status === "APPROVED");
  const nextStatuses = allowedComplaintTransitions(complaint.status);
  return <>
    <PageHeader eyebrow={complaint.complaintNumber} title={complaint.title} description={`${complaintPrivacyLabel(complaint.privacyMode)} complaint submitted ${shortDate(complaint.submittedAt)}`} action={<Link className="btn-secondary" href="/admin/complaints">Back</Link>} />
    {query.success && <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{query.success}</p>}
    {query.error && <p className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{query.error}</p>}
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <section className="space-y-5">
        <article className="card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-mono text-xs font-bold text-slate-500">{complaint.publicReference}</p><h2 className="text-xl font-black">{complaint.title}</h2></div><StatusBadge status={complaint.status} /></div>
          <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{complaint.description}</p>
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"><p className="font-black">Requested action</p><p className="mt-1 whitespace-pre-wrap text-slate-700">{complaint.requestedAction || "Not provided"}</p></div>
        </article>
        <section className="card">
          <h2 className="text-lg font-black">Messages and Notes</h2>
          <div className="mt-4 space-y-3">{complaint.messages.map((message) => <article key={message.id} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-bold">{message.author?.name || message.authorDisplayName || "Complainant"} <span className="font-normal text-slate-500">- {shortDate(message.createdAt)} | {message.visibility.toLowerCase()}</span></p><p className="mt-1 whitespace-pre-wrap">{message.body}</p></article>)}</div>
          <form action={addComplaintMessageAction} className="mt-5 grid gap-3"><input type="hidden" name="id" value={complaint.id} /><textarea className="field min-h-24" name="message" placeholder="Add update or internal note" required /><select className="field max-w-xs" name="visibility" defaultValue={ComplaintVisibility.PUBLIC}><option value="PUBLIC">Public update</option><option value="INTERNAL">Internal note</option></select><button className="btn-primary w-fit">Add message</button></form>
        </section>
        <section className="card">
          <h2 className="text-lg font-black">Timeline</h2>
          <div className="mt-4 space-y-2">{complaint.timelineEvents.map((event) => <p key={event.id} className="rounded-xl bg-slate-50 p-3 text-sm"><b>{event.eventType.replaceAll("_", " ")}</b> - {shortDate(event.createdAt)} by {event.actor?.name || "System"}<br /><span className="text-slate-600">{event.message}</span></p>)}</div>
        </section>
      </section>
      <aside className="space-y-5">
        <section className="card"><h2 className="text-lg font-black">Case Controls</h2>
          <form action={updateComplaintStatusAction} className="mt-4 space-y-3"><input type="hidden" name="id" value={complaint.id} /><select className="field" name="status" defaultValue="">{nextStatuses.length ? <option value="">Choose next status</option> : <option value="">No available transitions</option>}{nextStatuses.map((status) => <option key={status} value={status}>{complaintStatusLabel(status)}</option>)}</select><textarea className="field min-h-20" name="note" placeholder="Reason or resolution summary" /><input className="field" name="referralDestination" placeholder="Referral destination or office" /><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="confirmTransition" /> Confirm withdrawal when applicable</label><button className="btn-primary w-full" disabled={!nextStatuses.length}>Update status</button></form>
          <form action={assignComplaintAction} className="mt-5 space-y-3"><input type="hidden" name="id" value={complaint.id} /><select className="field" name="assigneeId" defaultValue={complaint.assignedToId || ""} required><option value="">Assign handler</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name} ({assignee.role.replaceAll("_", " ")})</option>)}</select><textarea className="field min-h-20" name="assignmentReason" placeholder="Assignment reason" required /><button className="btn-secondary w-full">Assign</button></form>
        </section>
        <section className="card"><h2 className="text-lg font-black">Summary</h2><Info label="Privacy" value={complaintPrivacyLabel(complaint.privacyMode)} /><Info label="Category" value={complaint.category?.name || "General"} /><Info label="Severity" value={complaint.severity} /><Info label="Priority" value={complaint.priority} /><Info label="Location" value={complaint.location || "Not provided"} /><Info label="Incident date" value={complaint.incidentDate ? shortDate(complaint.incidentDate) : "Not provided"} /><Info label="Assigned to" value={complaint.assignedTo?.name || "Unassigned"} /></section>
        <section className="card"><h2 className="text-lg font-black">Identity Privacy</h2><p className="mt-2 text-sm text-slate-600">{complaint.privacyMode === "CONFIDENTIAL" ? "Identity details are stored separately and excluded from this case view." : complaint.privacyMode === "ANONYMOUS" ? "No complainant identity is stored in complaint records." : "Named complainant profile is visible to authorized tenant staff."}</p>{complaint.privacyMode === "CONFIDENTIAL" && <form action={requestIdentityAccessAction} className="mt-4 space-y-3"><input type="hidden" name="id" value={complaint.id} /><input className="field" name="purpose" placeholder="Purpose" required /><textarea className="field min-h-20" name="reason" placeholder="Reason for restricted identity access" required /><button className="btn-secondary w-full" disabled={identityRequested}>{identityRequested ? "Request recorded" : "Request identity access"}</button></form>}{complaint.privacyMode === "CONFIDENTIAL" && canRevealIdentity && <ConfidentialIdentityReveal complaintId={complaint.id} />}</section>
        <section className="card"><h2 className="text-lg font-black">Attachments</h2>{complaint.attachments.length ? <div className="mt-3 space-y-2">{complaint.attachments.map((item) => <a key={item.id} className="block rounded-xl bg-slate-50 p-3 text-sm font-bold hover:bg-pine-50" href={item.url}>{item.originalName}<span className="block text-xs font-normal text-slate-500">{item.malwareStatus.replaceAll("_", " ")}</span></a>)}</div> : <p className="mt-3 text-sm text-slate-500">No attachments.</p>}</section>
      </aside>
    </div>
  </>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <p className="mt-3 text-sm"><span className="block text-xs font-bold uppercase text-slate-500">{label}</span><span className="font-black">{value}</span></p>;
}
