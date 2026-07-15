import Link from "next/link";
import { Archive, CalendarDays, Clock3, Eye, MapPin, Share2 } from "lucide-react";
import { ContentImage } from "@/components/content-image";
import { EventImageInput } from "@/components/event-image-input";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { DeleteButton, SubmitButton } from "@/components/ui";
import { deleteEventAction, publishEventToFacebookAction, saveEventAction, setEventStatusAction } from "@/lib/actions/content";
import { prisma } from "@/lib/db";
import { inputDate, shortDate } from "@/lib/utils";

const eventTypes = ["COMMUNITY", "MEETING", "ACTIVITY", "MAINTENANCE", "OTHER"];
const statuses = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const [events, selected] = await Promise.all([
    prisma.event.findMany({ orderBy: [{ eventDate: "desc" }, { updatedAt: "desc" }] }),
    edit ? prisma.event.findUnique({ where: { id: edit } }) : null,
  ]);
  const selectedStart = selected?.startTime ?? selected?.eventTime?.split(" - ")[0] ?? selected?.eventTime ?? "";
  const selectedEnd = selected?.endTime ?? selected?.eventTime?.split(" - ")[1] ?? selectedStart;

  return <>
    <PageHeader eyebrow="Community" title="Events and activities" description="Create drafts, publish activities, archive old events, upload banners, and post to the HOA Facebook Page." />
    <form action={saveEventAction} className="card mb-6">
      {selected && <input type="hidden" name="id" value={selected.id} />}
      <input type="hidden" name="existingImageUrl" value={selected?.imageUrl ?? ""} />
      <div className="mb-5">
        <h2 className="text-lg font-black">{selected ? "Edit event" : "Create event"}</h2>
        <p className="text-sm text-slate-500">Only published events are visible to homeowners. Draft and archived events are hidden.</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="sm:col-span-2"><label className="label">Title</label><input className="field" name="title" defaultValue={selected?.title} required /></div>
          <div><label className="label">Event Type</label><select className="field" name="type" defaultValue={selected?.type ?? "COMMUNITY"}>{eventTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></div>
          <div><label className="label">Status</label><select className="field" name="status" defaultValue={selected?.status ?? "PUBLISHED"}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
          <div><label className="label">Event Date</label><input className="field" name="eventDate" type="date" defaultValue={selected ? inputDate(selected.eventDate) : ""} required /></div>
          <div><label className="label">Start Time</label><input className="field" name="startTime" type="time" defaultValue={selectedStart} required /></div>
          <div><label className="label">End Time</label><input className="field" name="endTime" type="time" defaultValue={selectedEnd} required /></div>
          <div className="sm:col-span-2"><label className="label">Location</label><input className="field" name="location" defaultValue={selected?.location} required /></div>
          <div className="sm:col-span-2 xl:col-span-4"><label className="label">Description / Content</label><textarea className="field min-h-32" name="description" defaultValue={selected?.description} required /></div>
          <label className="sm:col-span-2 flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-600"><input type="checkbox" name="postToFacebook" defaultChecked={selected?.postToFacebook} className="size-4 accent-pine-600" /><Share2 className="size-4" /> Post automatically to the HOA Facebook Page {selected && "(use retry below)"}</label>
        </div>
        <EventImageInput currentImage={selected?.imageUrl} title={selected?.title ?? "Event image preview"} />
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap"><SubmitButton>{selected ? "Save changes" : "Create event"}</SubmitButton>{selected && <Link className="btn-secondary" href="/admin/events">Cancel</Link>}</div>
    </form>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{events.map((event) => <article className="card overflow-hidden p-0" key={event.id}>
      <ContentImage src={event.imageUrl} alt={event.title} className="h-56 w-full object-contain" fallbackText="No event image" />
      <div className="p-5">
        <div className="mb-4 flex items-start justify-between"><span className="grid size-11 place-items-center rounded-xl bg-pine-50 text-pine-600"><CalendarDays /></span><div className="flex flex-wrap justify-end gap-1.5"><StatusBadge status={event.status} /><span className="rounded-full bg-pine-50 px-2.5 py-1 text-xs font-bold text-pine-700">{event.type.replaceAll("_", " ")}</span>{event.postToFacebook && <StatusBadge status={event.facebookStatus} />}</div></div>
        <h2 className="text-lg font-black">{event.title}</h2>
        <p className="mt-2 line-clamp-4 text-sm leading-6 text-slate-600">{event.description}</p>
        <div className="mt-4 space-y-2 text-sm text-slate-500"><p className="flex gap-2"><CalendarDays className="size-4" /> {shortDate(event.eventDate)}</p><p className="flex gap-2"><Clock3 className="size-4" /> {event.startTime ?? event.eventTime} {event.endTime ? `- ${event.endTime}` : ""}</p><p className="flex gap-2"><MapPin className="size-4" /> {event.location}</p></div>
        {event.facebookError && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Facebook: {event.facebookError}</p>}
        <details className="mt-4 rounded-2xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-black text-pine-700">View full event details</summary><div className="mt-3 space-y-3"><ContentImage src={event.imageUrl} alt={`${event.title} detail image`} className="max-h-[28rem] w-full object-contain" fallbackText="No event image" /><p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{event.description}</p></div></details>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link className="btn-secondary" href={`/admin/events?edit=${event.id}`}>Edit</Link>
          <Link className="btn-secondary" href={`/portal/events/${event.id}`} target="_blank"><Eye className="size-4" /> View</Link>
          <StatusForm id={event.id} status="PUBLISHED" label="Publish" />
          <StatusForm id={event.id} status="ARCHIVED" label="Archive" icon="archive" />
          <form action={publishEventToFacebookAction}><input type="hidden" name="id" value={event.id} /><SubmitButton className="btn-secondary"><Share2 className="size-4" /> {event.facebookStatus === "SENT" ? "Post again" : "Post to Facebook"}</SubmitButton></form>
          <form action={deleteEventAction}><input type="hidden" name="id" value={event.id} /><DeleteButton /></form>
        </div>
      </div>
    </article>)}{!events.length && <div className="card text-center text-sm text-slate-500">No events have been created yet.</div>}</section>
  </>;
}

function StatusForm({ id, status, label, icon }: { id: string; status: string; label: string; icon?: "archive" }) {
  return <form action={setEventStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} /><SubmitButton className="btn-secondary">{icon === "archive" ? <Archive className="size-4" /> : <CalendarDays className="size-4" />}{label}</SubmitButton></form>;
}
