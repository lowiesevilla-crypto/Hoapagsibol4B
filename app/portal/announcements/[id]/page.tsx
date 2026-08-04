import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Megaphone } from "lucide-react";
import { ContentImage } from "@/components/content-image";
import { PageHeader } from "@/components/page-header";
import { PortalPageContainer } from "@/components/portal-mobile-shell";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";
import { shortDate } from "@/lib/utils";

export default async function PortalAnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireHomeownerProfile();
  const { id } = await params;
  const announcement = await prisma.announcement.findFirst({
    where: { id, tenantId: profile.tenantId, status: "PUBLISHED" },
    include: { createdBy: { select: { name: true } } },
  });
  if (!announcement) notFound();

  return (
    <PortalPageContainer className="space-y-5">
      <PageHeader eyebrow="Announcement Details" title={announcement.title} description={`Posted ${shortDate(announcement.createdAt)} by ${announcement.createdBy.name}`} action={<Link className="btn-secondary min-h-12" href="/portal/announcements">Back to announcements</Link>} />
      <article className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-pine-100 bg-white shadow-soft">
        {announcement.imageUrl ? <ContentImage src={announcement.imageUrl} alt={announcement.title} className="max-h-[70dvh] w-full object-contain" /> : <div className="grid h-48 place-items-center bg-pine-50 text-pine-700"><Megaphone className="size-16" aria-hidden="true" /></div>}
        <div className="space-y-5 p-5 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-pine-50 px-3 py-1 text-xs font-black text-pine-700">{announcement.type.replaceAll("_", " ")}</span>
            <span className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500"><CalendarDays className="size-3" aria-hidden="true" /> {shortDate(announcement.createdAt)}</span>
          </div>
          <p className="whitespace-pre-line text-base leading-7 text-slate-700">{announcement.content}</p>
        </div>
      </article>
    </PortalPageContainer>
  );
}
