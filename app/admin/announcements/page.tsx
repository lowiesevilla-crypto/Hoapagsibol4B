import Link from "next/link";
import { Archive, Eye, Megaphone, Share2 } from "lucide-react";
import { AnnouncementAdminForm } from "@/components/announcement-admin-form";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { DeleteButton, SubmitButton } from "@/components/ui";
import { deleteAnnouncementAction, publishAnnouncementToFacebookAction, setAnnouncementStatusAction } from "@/lib/actions/content";
import { prisma } from "@/lib/db";
import { shortDate } from "@/lib/utils";
import { ContentImage } from "@/components/content-image";

const announcementTypes = ["GENERAL", "URGENT", "REMINDER", "MAINTENANCE", "MEETING", "OTHER"];
const statuses = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const [announcements, selected] = await Promise.all([
    prisma.announcement.findMany({ include: { createdBy: true }, orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }] }),
    edit ? prisma.announcement.findUnique({ where: { id: edit }, include: { createdBy: true } }) : null,
  ]);

  return <>
    <PageHeader eyebrow="Community" title="Announcements" description="Create drafts, publish notices, archive old posts, upload banner images, email residents, and post to the HOA Facebook Page." />
    <AnnouncementAdminForm
      announcementTypes={announcementTypes}
      statuses={statuses}
      selected={selected ? {
        id: selected.id,
        title: selected.title,
        content: selected.content,
        type: selected.type,
        status: selected.status,
        imageUrl: selected.imageUrl,
        sendEmail: selected.sendEmail,
        postToFacebook: selected.postToFacebook,
        createdAt: selected.createdAt.toISOString(),
        createdByName: selected.createdBy.name,
      } : null}
    />

    <section className="grid gap-4 lg:grid-cols-2">{announcements.map((item) => <article className="card overflow-hidden p-0" key={item.id}>
      <ContentImage src={item.imageUrl} alt={item.title} className="h-56 w-full object-contain" fallbackText="No announcement image" />
      <div className="p-5">
        <div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">{item.title}</h2><p className="text-xs text-slate-400">{shortDate(item.createdAt)} by {item.createdBy.name}</p></div><div className="flex flex-wrap justify-end gap-1.5"><StatusBadge status={item.status} /><span className="rounded-full bg-pine-50 px-2.5 py-1 text-xs font-bold text-pine-700">{item.type.replaceAll("_", " ")}</span>{item.sendEmail && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">Email</span>}{item.postToFacebook && <StatusBadge status={item.facebookStatus} />}</div></div>
        <p className="line-clamp-4 whitespace-pre-line text-sm leading-6 text-slate-600">{item.content}</p>
        {item.facebookError && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Facebook: {item.facebookError}</p>}
        <details className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">
          <summary className="cursor-pointer font-black text-ink">View announcement details</summary>
          <div className="mt-3 space-y-2">
            {item.imageUrl && <ContentImage src={item.imageUrl} alt={`${item.title} detail image`} className="max-h-[28rem] w-full object-contain" />}
            <p><span className="font-bold">Date posted:</span> {shortDate(item.createdAt)}</p>
            <p><span className="font-bold">Created by:</span> {item.createdBy.name}</p>
            <p className="whitespace-pre-line leading-6">{item.content}</p>
          </div>
        </details>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link className="btn-secondary" href={`/admin/announcements?edit=${item.id}`}>Edit</Link>
          {item.status === "PUBLISHED" ? <Link className="btn-secondary" href={`/portal/announcements/${item.id}`} target="_blank"><Eye className="size-4" /> View public page</Link> : <span className="inline-flex min-h-10 items-center rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-500">Hidden from homeowners</span>}
          <StatusForm id={item.id} status="PUBLISHED" label="Publish" />
          <StatusForm id={item.id} status="ARCHIVED" label="Archive" icon="archive" />
          <form action={publishAnnouncementToFacebookAction}><input type="hidden" name="id" value={item.id} /><SubmitButton className="btn-secondary"><Share2 className="size-4" /> {item.facebookStatus === "SENT" ? "Post again" : "Post to Facebook"}</SubmitButton></form>
          <form action={deleteAnnouncementAction}><input type="hidden" name="id" value={item.id} /><DeleteButton /></form>
        </div>
      </div>
    </article>)}{!announcements.length && <div className="card text-center text-sm text-slate-500">No announcements have been created yet.</div>}</section>
  </>;
}

function StatusForm({ id, status, label, icon }: { id: string; status: string; label: string; icon?: "archive" }) {
  return <form action={setAnnouncementStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} /><SubmitButton className="btn-secondary">{icon === "archive" ? <Archive className="size-4" /> : <Megaphone className="size-4" />}{label}</SubmitButton></form>;
}
