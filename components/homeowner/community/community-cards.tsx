import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, ChevronRight, Clock3, ImageOff, MapPin, Search, ShieldCheck, UserRound } from "lucide-react";
import { ContentImage } from "@/components/content-image";

export type CommunityNavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export function CommunityAreaNavigation({ items }: { items: CommunityNavItem[] }) {
  return (
    <nav aria-label="Community sections" className="grid grid-cols-4 gap-2">
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-label={`${item.label}. ${item.description}`} className="group flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border border-slate-100 bg-white px-2 py-3 text-center shadow-[0_4px_16px_rgba(15,23,42,.04)] transition hover:border-pine-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">
          <span className="grid size-10 place-items-center rounded-2xl bg-pine-50 text-pine-700 transition group-hover:bg-pine-100"><item.icon className="size-[18px]" aria-hidden="true" /></span>
          <span className="max-w-full truncate text-[11px] font-black text-ink">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function CommunityFeatureCard({ href, label, description, icon: Icon, countLabel }: CommunityNavItem & { countLabel?: string }) {
  return (
    <Link href={href} className="group flex min-h-20 items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-[0_4px_18px_rgba(15,23,42,.04)] transition hover:border-pine-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700 transition group-hover:bg-pine-100"><Icon className="size-5" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-ink">{label}</span><span className="mt-0.5 hidden truncate text-xs text-slate-400 sm:block">{description}</span></span>
      <span className="shrink-0 text-right">{countLabel && <span className="block text-[10px] font-black uppercase tracking-wide text-slate-400">{countLabel}</span>}<ChevronRight className="ml-auto mt-1 size-4 text-slate-300" aria-hidden="true" /></span>
    </Link>
  );
}

export function CommunitySearchBar({ query, placeholder = "Search" }: { query?: string; placeholder?: string }) {
  return (
    <form>
      <label className="flex min-h-11 items-center gap-2 rounded-full bg-slate-100 px-4">
        <Search className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
        <span className="sr-only">{placeholder}</span>
        <input className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" type="search" name="q" defaultValue={query ?? ""} placeholder={placeholder} />
        <button className="text-xs font-black text-pine-700">Search</button>
      </label>
    </form>
  );
}

export function AnnouncementMobileCard({ href, title, content, type, postedLabel, imageUrl }: { href: string; title: string; content: string; type: string; postedLabel: string; imageUrl?: string | null }) {
  return (
    <Link href={href} className="block overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_4px_18px_rgba(15,23,42,.04)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">
      {imageUrl ? <img src={imageUrl} alt={title} className="h-40 w-full bg-slate-50 object-cover" /> : <FallbackVisual icon={ImageOff} label="Announcement" />}
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2"><StatusChip>{type.replaceAll("_", " ")}</StatusChip><span className="text-xs font-semibold text-slate-400">{postedLabel}</span></div>
        <h2 className="mt-2 line-clamp-2 text-base font-black text-ink">{title}</h2>
        <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm leading-5 text-slate-500">{content}</p>
      </div>
    </Link>
  );
}

export function EventMobileCard({ href, title, description, type, dateLabel, timeLabel, location, imageUrl, previous = false }: { href: string; title: string; description: string; type: string; dateLabel: string; timeLabel: string; location: string; imageUrl?: string | null; previous?: boolean }) {
  return (
    <Link href={href} className="block overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_4px_18px_rgba(15,23,42,.04)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">
      {imageUrl ? <img src={imageUrl} alt={title} className="h-40 w-full bg-slate-50 object-cover" /> : <FallbackVisual icon={CalendarDays} label={previous ? "Previous Event" : "Event"} />}
      <div className="p-4">
        <div className="flex flex-wrap gap-2"><StatusChip>{type.replaceAll("_", " ")}</StatusChip>{previous && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">Previous</span>}</div>
        <h2 className="mt-2 line-clamp-2 text-base font-black text-ink">{title}</h2>
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{description}</p>
        <div className="mt-3 grid gap-1.5 text-xs font-semibold text-slate-500"><IconLine icon={CalendarDays}>{dateLabel}</IconLine><IconLine icon={Clock3}>{timeLabel}</IconLine><IconLine icon={MapPin}>{location}</IconLine></div>
      </div>
    </Link>
  );
}

export function OfficerMobileCard({ name, position, committee, contact, email, photoUrl }: { name: string; position: string; committee?: string | null; contact?: string | null; email?: string | null; photoUrl?: string | null }) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-[0_4px_18px_rgba(15,23,42,.04)]">
      <div className="mx-auto grid size-20 place-items-center overflow-hidden rounded-full bg-pine-50 text-2xl font-black text-pine-700"><ContentImage src={photoUrl} alt={name} className="size-full object-cover" fallbackText={name.slice(0, 1)} /></div>
      <h2 className="mt-3 text-base font-black text-ink">{name}</h2><p className="text-sm font-bold text-pine-700">{position}</p>
      {committee && <p className="mt-1 text-xs text-slate-400">{committee}</p>}
      {(contact || email) && <p className="mt-2 break-words text-xs text-slate-400">{[contact, email].filter(Boolean).join(" | ")}</p>}
    </article>
  );
}

export function InfoTile({ label, value, icon: Icon = UserRound }: { label: string; value?: string | null; icon?: LucideIcon }) {
  return <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-slate-50 p-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-pine-700"><Icon className="size-4" aria-hidden="true" /></span><span className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-[.1em] text-slate-400">{label}</span><span className="mt-0.5 block break-words text-sm font-bold text-ink">{value || "Not provided"}</span></span></div>;
}

export function VehicleMobileCard({ title, subtitle, plate, sticker, issued, expires, status, remarks }: { title: string; subtitle: string; plate: string; sticker: string; issued: string; expires: string; status: React.ReactNode; remarks?: string | null }) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_4px_18px_rgba(15,23,42,.04)]">
      <div className="flex items-center justify-between gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-pine-50 text-pine-700"><ShieldCheck className="size-[18px]" aria-hidden="true" /></span>{status}</div>
      <h2 className="mt-3 text-base font-black text-ink">{title}</h2><p className="text-sm text-slate-400">{subtitle}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><Field label="Plate" value={plate} mono /><Field label="Sticker" value={sticker} mono /><Field label="Issued" value={issued} /><Field label="Expires" value={expires} /></dl>
      {remarks && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{remarks}</p>}
    </article>
  );
}

export function CommunityEmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center"><p className="font-black text-ink">{title}</p><p className="mt-1 text-sm text-slate-400">{description}</p></div>;
}

export function CommunityPageSkeleton() {
  return <div className="space-y-4"><div className="h-16 rounded-2xl bg-slate-100" /><div className="grid gap-3 md:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-20 rounded-2xl bg-slate-100" />)}</div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4].map((item) => <div key={item} className="h-56 rounded-2xl bg-slate-100" />)}</div></div>;
}

export function CommunityRouteError({ title = "Unable to load this page", description = "Refresh to try again. Your private HOAHub data was not cached." }: { title?: string; description?: string }) {
  return <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-rose-900" role="alert"><p className="font-black text-ink">{title}</p><p className="mt-1 text-sm">{description}</p></div>;
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 rounded-xl bg-slate-50 p-2.5"><dt className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</dt><dd className={`mt-0.5 truncate font-black ${mono ? "font-mono" : ""}`}>{value}</dd></div>;
}

function IconLine({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return <p className="flex gap-2"><Icon className="mt-0.5 size-3.5 shrink-0 text-pine-700" aria-hidden="true" /><span className="min-w-0 truncate">{children}</span></p>;
}

function FallbackVisual({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return <div className="grid h-40 place-items-center bg-gradient-to-br from-pine-50 to-slate-50 text-pine-700"><div className="text-center"><Icon className="mx-auto size-7" aria-hidden="true" /><p className="mt-2 text-[10px] font-black uppercase tracking-[.14em]">{label}</p></div></div>;
}

function StatusChip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-pine-50 px-2.5 py-1 text-[10px] font-black text-pine-700">{children}</span>;
}
