import Link from "next/link";
import { CalendarDays, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";
import { shortDate } from "@/lib/utils";
import { ContentImage } from "@/components/content-image";

export default async function PortalAnnouncementsPage() {
  const profile = await requireHomeownerProfile();
  const announcements = await prisma.announcement.findMany({ where: { tenantId: profile.tenantId, status: "PUBLISHED" }, include: { createdBy: true }, orderBy: [{ createdAt: "desc" }] });
  return <>
    <PageHeader eyebrow="Community" title="Announcements" description="Official published notices and neighborhood updates from your association." />
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{announcements.map((item) => <article className="card overflow-hidden p-0" key={item.id}>
      {item.imageUrl ? <ContentImage src={item.imageUrl} alt={item.title} className="h-56 w-full object-contain" /> : <div className="grid h-36 place-items-center bg-gradient-to-br from-pine-800 to-leaf-600 text-white"><Megaphone className="size-12" /></div>}
      <div className="p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2"><span className="rounded-full bg-pine-50 px-2.5 py-1 text-xs font-bold text-pine-700">{item.type.replaceAll("_", " ")}</span><span className="flex items-center gap-1 text-xs text-slate-400"><CalendarDays className="size-3" /> Posted {shortDate(item.createdAt)}</span></div>
        <h2 className="text-lg font-black">{item.title}</h2>
        <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-6 text-slate-600">{item.content}</p>
        <Link className="btn-secondary mt-5" href={`/portal/announcements/${item.id}`}>Read More / View Details</Link>
      </div>
    </article>)}{!announcements.length && <div className="card text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">No published announcements are available right now.</div>}</section>
  </>;
}
