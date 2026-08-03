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
    <nav aria-label="Community and account sections" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 md:grid md:grid-cols-4 md:overflow-visible">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="flex min-h-20 min-w-[13.5rem] items-center gap-3 rounded-3xl border border-pine-100 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20 md:min-w-0">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700">
            <item.icon className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-ink">{item.label}</span>
            <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-slate-500">{item.description}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-slate-300" aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}

export function CommunityFeatureCard({ href, label, description, icon: Icon, countLabel }: CommunityNavItem & { countLabel?: string }) {
  return (
    <Link href={href} className="flex min-h-32 flex-col justify-between rounded-3xl border border-pine-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">
      <span className="flex items-start justify-between gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-pine-50 text-pine-700">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        {countLabel && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{countLabel}</span>}
      </span>
      <span>
        <span className="block font-black text-ink">{label}</span>
        <span className="mt-1 line-clamp-2 block text-sm leading-6 text-slate-500">{description}</span>
      </span>
    </Link>
  );
}

export function CommunitySearchBar({ query, placeholder = "Search" }: { query?: string; placeholder?: string }) {
  return (
    <form className="rounded-3xl border border-pine-100 bg-white p-3 shadow-sm">
      <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-slate-50 px-3">
        <Search className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
        <span className="sr-only">{placeholder}</span>
        <input className="min-w-0 flex-1 bg-transparent text-base outline-none" type="search" name="q" defaultValue={query ?? ""} placeholder={placeholder} />
        <button className="btn-primary min-h-10 px-4 py-2 text-sm">Search</button>
      </label>
    </form>
  );
}

export function AnnouncementMobileCard({ href, title, content, type, postedLabel, imageUrl }: { href: string; title: string; content: string; type: string; postedLabel: string; imageUrl?: string | null }) {
  return (
    <Link href={href} className="block overflow-hidden rounded-3xl border border-pine-100 bg-white shadow-sm focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">
      {imageUrl ? <img src={imageUrl} alt={title} className="h-44 w-full bg-slate-50 object-cover" /> : <FallbackVisual icon={ImageOff} label="Announcement" />}
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <StatusChip>{type.replaceAll("_", " ")}</StatusChip>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{postedLabel}</span>
        </div>
        <h2 className="line-clamp-2 text-lg font-black text-ink">{title}</h2>
        <p className="line-clamp-3 whitespace-pre-line text-sm leading-6 text-slate-500">{content}</p>
      </div>
    </Link>
  );
}

export function EventMobileCard({ href, title, description, type, dateLabel, timeLabel, location, imageUrl, previous = false }: { href: string; title: string; description: string; type: string; dateLabel: string; timeLabel: string; location: string; imageUrl?: string | null; previous?: boolean }) {
  return (
    <Link href={href} className="block overflow-hidden rounded-3xl border border-pine-100 bg-white shadow-sm focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">
      {imageUrl ? <img src={imageUrl} alt={title} className="h-44 w-full bg-slate-50 object-cover" /> : <FallbackVisual icon={CalendarDays} label={previous ? "Previous Event" : "Event"} />}
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <StatusChip>{type.replaceAll("_", " ")}</StatusChip>
          {previous && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">Previous</span>}
        </div>
        <h2 className="line-clamp-2 text-lg font-black text-ink">{title}</h2>
        <p className="line-clamp-3 text-sm leading-6 text-slate-500">{description}</p>
        <div className="grid gap-2 text-sm text-slate-600">
          <IconLine icon={CalendarDays}>{dateLabel}</IconLine>
          <IconLine icon={Clock3}>{timeLabel}</IconLine>
          <IconLine icon={MapPin}>{location}</IconLine>
        </div>
      </div>
    </Link>
  );
}

export function OfficerMobileCard({ name, position, committee, contact, email, photoUrl, signatureUrl }: { name: string; position: string; committee?: string | null; contact?: string | null; email?: string | null; photoUrl?: string | null; signatureUrl?: string | null }) {
  return (
    <article className="rounded-3xl border border-pine-100 bg-white p-4 text-center shadow-sm">
      <div className="mx-auto grid size-24 place-items-center overflow-hidden rounded-full bg-pine-50 text-3xl font-black text-pine-700">
        <ContentImage src={photoUrl} alt={name} className="size-full object-cover" fallbackText={name.slice(0, 1)} />
      </div>
      <h2 className="mt-4 text-lg font-black text-ink">{name}</h2>
      <p className="font-bold text-pine-700">{position}</p>
      {committee && <p className="mt-1 text-sm text-slate-500">{committee}</p>}
      {(contact || email) && <p className="mt-3 break-words text-xs leading-5 text-slate-500">{[contact, email].filter(Boolean).join(" | ")}</p>}
      {signatureUrl && <div className="mx-auto mt-4 grid h-14 max-w-40 place-items-center overflow-hidden rounded-xl border bg-white p-2"><ContentImage src={signatureUrl} alt={`${name} signature`} className="max-h-full max-w-full object-contain" fallbackText="Signature unavailable" /></div>}
    </article>
  );
}

export function InfoTile({ label, value, icon: Icon = UserRound }: { label: string; value?: string | null; icon?: LucideIcon }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-slate-400"><Icon className="size-4" aria-hidden="true" />{label}</p>
      <p className="break-words font-bold text-ink">{value || "Not provided"}</p>
    </div>
  );
}

export function VehicleMobileCard({ title, subtitle, plate, sticker, issued, expires, status, remarks }: { title: string; subtitle: string; plate: string; sticker: string; issued: string; expires: string; status: React.ReactNode; remarks?: string | null }) {
  return (
    <article className="rounded-3xl border border-pine-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-pine-50 text-pine-700">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        {status}
      </div>
      <h2 className="mt-4 text-lg font-black text-ink">{title}</h2>
      <p className="text-sm text-slate-500">{subtitle}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
        <Field label="Plate" value={plate} mono />
        <Field label="Sticker" value={sticker} mono />
        <Field label="Issued" value={issued} />
        <Field label="Expires" value={expires} />
      </dl>
      {remarks && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{remarks}</p>}
    </article>
  );
}

export function CommunityEmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-3xl border border-dashed border-pine-100 bg-white/80 p-6 text-center"><p className="font-black text-ink">{title}</p><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></div>;
}

export function CommunityPageSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-24 rounded-3xl bg-slate-100" />
      <div className="grid gap-3 md:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-36 rounded-3xl bg-slate-100" />)}</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4].map((item) => <div key={item} className="h-64 rounded-3xl bg-slate-100" />)}</div>
    </div>
  );
}

export function CommunityRouteError({ title = "Unable to load this page", description = "Refresh to try again. Your private HOAHub data was not cached." }: { title?: string; description?: string }) {
  return <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5 text-rose-900" role="alert"><p className="font-black">{title}</p><p className="mt-1 text-sm leading-6">{description}</p></div>;
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-xs font-bold uppercase text-slate-400">{label}</dt><dd className={`break-words font-black ${mono ? "font-mono" : ""}`}>{value}</dd></div>;
}

function IconLine({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return <p className="flex gap-2"><Icon className="mt-0.5 size-4 shrink-0 text-pine-700" aria-hidden="true" /><span className="min-w-0 break-words">{children}</span></p>;
}

function FallbackVisual({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="grid h-44 place-items-center bg-pine-50 text-pine-700">
      <div className="text-center">
        <Icon className="mx-auto size-8" aria-hidden="true" />
        <p className="mt-2 text-xs font-black uppercase tracking-[.16em]">{label}</p>
      </div>
    </div>
  );
}

function StatusChip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-pine-50 px-3 py-1 text-xs font-black text-pine-700">{children}</span>;
}
