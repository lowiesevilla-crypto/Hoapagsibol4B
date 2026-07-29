import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getHomeownerComplaintDetail, requireComplaintHomeowner } from "@/lib/services/complaints";
import { shortDate } from "@/lib/utils";

export default async function PortalComplaintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireComplaintHomeowner();
  const { id } = await params;
  const complaint = await getHomeownerComplaintDetail(user, id);
  return <>
    <PageHeader eyebrow={complaint.complaintNumber} title={complaint.title} description={`${complaint.category?.name || "General"} complaint submitted ${shortDate(complaint.submittedAt)}`} action={<Link className="btn-secondary" href="/portal/complaints">Back</Link>} />
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-black">Case updates</h2><StatusBadge status={complaint.status} /></div>
        <div className="space-y-3">{complaint.messages.map((message) => <article key={message.id} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-bold">{message.authorDisplayName || "HOA update"} <span className="font-normal text-slate-500">- {shortDate(message.createdAt)}</span></p><p className="mt-1 whitespace-pre-wrap">{message.body}</p></article>)}</div>
      </section>
      <aside className="space-y-5">
        <section className="card"><h2 className="text-lg font-black">Details</h2><Info label="Reference" value={complaint.publicReference} /><Info label="Location" value={complaint.location || "Not provided"} /><Info label="Incident date" value={complaint.incidentDate ? shortDate(complaint.incidentDate) : "Not provided"} /><Info label="Updated" value={shortDate(complaint.updatedAt)} /></section>
        <section className="card"><h2 className="text-lg font-black">Attachments</h2>{complaint.attachments.length ? <div className="space-y-2">{complaint.attachments.map((item) => <a key={item.id} className="block rounded-xl bg-slate-50 p-3 text-sm font-bold hover:bg-pine-50" href={item.url}>{item.originalName}</a>)}</div> : <p className="text-sm text-slate-500">No attachments.</p>}</section>
      </aside>
    </div>
  </>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <p className="mt-3 text-sm"><span className="block text-xs font-bold uppercase text-slate-500">{label}</span><span className="font-black">{value}</span></p>;
}
