import Link from "next/link";
import { CalendarDays, Clock3, MapPin } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";
import { shortDate } from "@/lib/utils";
import { ContentImage } from "@/components/content-image";

export default async function PortalEventsPage() {
  const profile = await requireHomeownerProfile();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const events = await prisma.event.findMany({ where: { tenantId: profile.tenantId, status: "PUBLISHED", eventDate: { gte: today } }, orderBy: [{ eventDate: "asc" }, { startTime: "asc" }] });
  return <>
    <PageHeader eyebrow="Community" title="Upcoming events" description="Published meetings, activities, and neighborhood programs." />
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{events.map((event) => <article className="card overflow-hidden p-0" key={event.id}>
      {event.imageUrl ? <ContentImage src={event.imageUrl} alt={event.title} className="h-56 w-full object-contain" /> : <div className="grid h-36 place-items-center bg-gradient-to-br from-pine-800 to-leaf-600 text-white"><CalendarDays className="size-12" /></div>}
      <div className="p-5">
        <div className="mb-3 flex flex-wrap gap-2"><span className="rounded-full bg-pine-50 px-2.5 py-1 text-xs font-bold text-pine-700">{event.type.replaceAll("_", " ")}</span><span className="text-xs font-bold text-slate-400">Posted {shortDate(event.createdAt)}</span></div>
        <h2 className="text-xl font-black">{event.title}</h2>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{event.description}</p>
        <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm text-slate-500"><p className="flex gap-2"><CalendarDays className="size-4" /> {shortDate(event.eventDate)}</p><p className="flex gap-2"><Clock3 className="size-4" /> {event.startTime ?? event.eventTime} {event.endTime ? `- ${event.endTime}` : ""}</p><p className="flex gap-2"><MapPin className="size-4" /> {event.location}</p></div>
        <Link className="btn-secondary mt-5" href={`/portal/events/${event.id}`}>Read More / View Details</Link>
      </div>
    </article>)}{!events.length && <div className="card text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">No published upcoming events are scheduled right now.</div>}</section>
  </>;
}
