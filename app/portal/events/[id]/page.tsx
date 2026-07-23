import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock3, MapPin } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";
import { shortDate } from "@/lib/utils";
import { ContentImage } from "@/components/content-image";

export default async function PortalEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireHomeownerProfile();
  const { id } = await params;
  const event = await prisma.event.findFirst({ where: { id, tenantId: profile.tenantId, status: "PUBLISHED" } });
  if (!event) notFound();

  return <>
    <PageHeader eyebrow="Event Details" title={event.title} description={`Posted ${shortDate(event.createdAt)}`} action={<Link className="btn-secondary" href="/portal/events">Back to events</Link>} />
    <article className="card mx-auto max-w-4xl overflow-hidden p-0">
      {event.imageUrl ? <ContentImage src={event.imageUrl} alt={event.title} className="max-h-[70dvh] w-full object-contain" /> : <div className="grid h-48 place-items-center bg-gradient-to-br from-pine-800 to-leaf-600 text-white"><CalendarDays className="size-16" /></div>}
      <div className="p-5 sm:p-8">
        <div className="mb-5 flex flex-wrap gap-2"><span className="rounded-full bg-pine-50 px-2.5 py-1 text-xs font-bold text-pine-700">{event.type.replaceAll("_", " ")}</span><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Published</span></div>
        <div className="mb-6 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-3">
          <p className="flex gap-2"><CalendarDays className="size-4 text-pine-600" /> {shortDate(event.eventDate)}</p>
          <p className="flex gap-2"><Clock3 className="size-4 text-pine-600" /> {event.startTime ?? event.eventTime} {event.endTime ? `- ${event.endTime}` : ""}</p>
          <p className="flex gap-2"><MapPin className="size-4 text-pine-600" /> {event.location}</p>
        </div>
        <p className="whitespace-pre-line text-sm leading-7 text-slate-700 sm:text-base">{event.description}</p>
      </div>
    </article>
  </>;
}
