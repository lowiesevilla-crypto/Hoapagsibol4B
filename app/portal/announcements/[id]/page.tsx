import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";
import { shortDate } from "@/lib/utils";
import { ContentImage } from "@/components/content-image";

export default async function PortalAnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireHomeownerProfile();
  const { id } = await params;
  const announcement = await prisma.announcement.findFirst({ where: { id, status: "PUBLISHED" }, include: { createdBy: true } });
  if (!announcement) notFound();

  return <>
    <PageHeader eyebrow="Announcement Details" title={announcement.title} description={`Posted ${shortDate(announcement.createdAt)} by ${announcement.createdBy.name}`} action={<Link className="btn-secondary" href="/portal/announcements">Back to announcements</Link>} />
    <article className="card mx-auto max-w-4xl overflow-hidden p-0">
      {announcement.imageUrl ? <ContentImage src={announcement.imageUrl} alt={announcement.title} className="max-h-[70dvh] w-full object-contain" /> : <div className="grid h-48 place-items-center bg-gradient-to-br from-pine-800 to-leaf-600 text-white"><Megaphone className="size-16" /></div>}
      <div className="p-5 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-2"><span className="rounded-full bg-pine-50 px-2.5 py-1 text-xs font-bold text-pine-700">{announcement.type.replaceAll("_", " ")}</span><span className="flex items-center gap-1 text-xs text-slate-400"><CalendarDays className="size-3" /> {shortDate(announcement.createdAt)}</span></div>
        <p className="whitespace-pre-line text-sm leading-7 text-slate-700 sm:text-base">{announcement.content}</p>
      </div>
    </article>
  </>;
}
