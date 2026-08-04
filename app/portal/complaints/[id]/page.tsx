import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquarePlus, Paperclip } from "lucide-react";
import { RequestAreaNavigation, RequestProgressTracker, RequestStatusPill, requestTone, statusLabel } from "@/components/homeowner/requests/request-cards";
import { PortalPageContainer } from "@/components/portal-mobile-shell";
import { PageHeader } from "@/components/page-header";
import { complaintPrivacyLabel, getHomeownerComplaintDetail, requireComplaintHomeowner } from "@/lib/services/complaints";
import { shortDate } from "@/lib/utils";

export default async function PortalComplaintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireComplaintHomeowner();
  const { id } = await params;
  const complaint = await getHomeownerComplaintDetail(user, id);
  if (!complaint) notFound();

  return (
    <PortalPageContainer className="space-y-6">
      <RequestAreaNavigation active="complaints" />
      <PageHeader eyebrow={complaint.complaintNumber} title={complaint.title} description={`${complaint.category?.name || "General"} complaint submitted ${shortDate(complaint.submittedAt)}`} action={<Link className="btn-secondary" href="/portal/complaints">Back</Link>} />
      <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">Current status</p>
            <h2 className="mt-1 text-xl font-black text-ink">{statusLabel(complaint.status)}</h2>
          </div>
          <RequestStatusPill label={statusLabel(complaint.status)} tone={requestTone(complaint.status)} />
        </div>
        <RequestProgressTracker status={complaint.status} kind="complaint" />
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Reference" value={complaint.publicReference} />
          <Info label="Privacy" value={complaintPrivacyLabel(complaint.privacyMode)} />
          <Info label="Location" value={complaint.location || "Not provided"} />
          <Info label="Updated" value={shortDate(complaint.updatedAt)} />
        </dl>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
          <div className="mb-4 flex items-center gap-2"><MessageSquarePlus className="size-5 text-pine-700" /><h2 className="text-lg font-black">Case Updates</h2></div>
          <div className="space-y-3">
            {complaint.messages.length ? complaint.messages.map((message) => <article key={message.id} className="rounded-2xl bg-slate-50 p-3 text-sm"><p className="font-bold">{message.authorDisplayName || "HOA update"} <span className="font-normal text-slate-500">- {shortDate(message.createdAt)}</span></p><p className="mt-1 whitespace-pre-wrap leading-6 text-slate-700">{message.body}</p></article>) : <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No homeowner-visible updates yet.</p>}
          </div>
        </section>
        <aside className="space-y-5">
          <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
            <h2 className="text-lg font-black">Requested Action</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{complaint.requestedAction || "Not provided"}</p>
          </section>
          <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
            <div className="mb-3 flex items-center gap-2"><Paperclip className="size-5 text-pine-700" /><h2 className="text-lg font-black">Attachments</h2></div>
            {complaint.attachments.length ? <div className="space-y-2">{complaint.attachments.map((item) => <a key={item.id} className="block min-h-12 rounded-2xl bg-slate-50 p-3 text-sm font-bold hover:bg-pine-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20" href={item.url}>{item.originalName}</a>)}</div> : <p className="text-sm text-slate-500">No homeowner-visible attachments.</p>}
          </section>
        </aside>
      </div>
    </PortalPageContainer>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><dt className="text-xs font-bold uppercase text-slate-500">{label}</dt><dd className="mt-1 break-words font-black">{value}</dd></div>;
}
