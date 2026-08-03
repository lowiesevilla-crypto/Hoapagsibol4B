import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock3, MapPin } from "lucide-react";
import { ContentImage } from "@/components/content-image";
import { PageHeader } from "@/components/page-header";
import { PortalPageContainer } from "@/components/portal-mobile-shell";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";
import { shortDate } from "@/lib/utils";

export default async function PortalEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireHomeownerProfile();
  const { id } = await params;
  const event = await prisma.event.findFirst({ where: { id, tenantId: profile.tenantId, status: "PUBLISHED" } });
  if (!event) notFound();
  const time = event.startTime ?? event.eventTime;

  return (
    <PortalPageContainer className="space-y-5">
      <PageHeader eyebrow="Event Details" title={event.title} description={`Posted ${shortDate(event.createdAt)}`} action={<Link className="btn-secondary min-h-12" href="/portal/events">Back to events</Link>} />
      <article className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-pine-100 bg-white shadow-soft">
        {event.imageUrl ? <ContentImage src={event.imageUrl} alt={event.title} className="max-h-[70dvh] w-full object-contain" /> : <div className="grid h-48 place-items-center bg-pine-50 text-pine-700"><CalendarDays className="size-16" aria-hidden="true" /></div>}
        <div className="space-y-5 p-5 sm:p-8">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-pine-50 px-3 py-1 text-xs font-black text-pine-700">{event.type.replaceAll("_", " ")}</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Published</span>
          </div>
          <div className="grid gap-3 rounded-3xl bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-3">
            <Info icon={CalendarDays} value={shortDate(event.eventDate)} />
            <Info icon={Clock3} value={`${time}${event.endTime ? ` to ${event.endTime}` : ""}`} />
            <Info icon={MapPin} value={event.location} />
          </div>
          <p className="whitespace-pre-line text-base leading-7 text-slate-700">{event.description}</p>
        </div>
      </article>
    </PortalPageContainer>
  );
}

function Info({ icon: Icon, value }: { icon: typeof CalendarDays; value: string }) {
  return <p className="flex gap-2"><Icon className="mt-0.5 size-4 shrink-0 text-pine-700" aria-hidden="true" /><span className="min-w-0 break-words">{value}</span></p>;
}
