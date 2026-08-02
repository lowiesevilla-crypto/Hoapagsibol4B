import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, CalendarDays, CheckCircle2, ChevronRight, Clock3, FileText, ImageOff, MapPin, QrCode, ReceiptText } from "lucide-react";
import { ContentImage } from "@/components/content-image";

type BalanceState = "Paid" | "Amount Due" | "Overdue" | "No Billing Record" | "Safe Error";

export type DashboardAction = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export type DashboardListItem = {
  href?: string;
  icon: LucideIcon;
  title: string;
  description: string;
  meta: string;
  status?: string;
};

export type DashboardAnnouncement = {
  href: string;
  title: string;
  summary: string;
  dateLabel: string;
  imageUrl?: string | null;
};

export type DashboardEvent = {
  href: string;
  title: string;
  description: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
  imageUrl?: string | null;
};

export function HomeownerGreeting({
  greeting,
  firstName,
  associationName,
  propertyLabel,
}: {
  greeting: string;
  firstName: string;
  associationName: string;
  propertyLabel?: string;
}) {
  return (
    <section className="space-y-2 px-1">
      <p className="text-sm font-black text-pine-700">{greeting}</p>
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-black leading-tight text-ink sm:text-3xl">Good {greeting.toLowerCase()}, {firstName}</h1>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{associationName}</p>
        {propertyLabel && <p className="mt-1 text-xs font-bold uppercase tracking-[.12em] text-slate-400">{propertyLabel}</p>}
      </div>
    </section>
  );
}

export function BalanceSummaryCard({
  amount,
  status,
  dueDateLabel,
  coverageLabel,
}: {
  amount: string;
  status: BalanceState;
  dueDateLabel?: string;
  coverageLabel?: string;
}) {
  const paid = status === "Paid";
  const overdue = status === "Overdue";
  return (
    <section className={`rounded-3xl border p-5 shadow-soft sm:p-6 ${overdue ? "border-rose-100 bg-rose-50" : paid ? "border-emerald-100 bg-emerald-50" : "border-pine-100 bg-white"}`} aria-label="Current balance">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-pine-700">Current Balance</p>
          <p className="mt-3 break-words text-4xl font-black tracking-normal text-ink tabular-nums sm:text-5xl">{amount}</p>
        </div>
        <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${overdue ? "bg-white text-rose-700" : paid ? "bg-white text-emerald-700" : "bg-pine-50 text-pine-700"}`}>
          {paid ? <CheckCircle2 className="size-6" aria-hidden="true" /> : overdue ? <AlertCircle className="size-6" aria-hidden="true" /> : <ReceiptText className="size-6" aria-hidden="true" />}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-black ${overdue ? "bg-white text-rose-700" : paid ? "bg-white text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{status}</span>
        {dueDateLabel && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Due {dueDateLabel}</span>}
        {coverageLabel && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{coverageLabel}</span>}
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <Link href="/portal/pay" className="btn-primary min-h-12">
          <QrCode className="size-4" aria-hidden="true" />
          Pay Now
        </Link>
        <Link href="/portal/soa" className="btn-secondary min-h-12">
          <FileText className="size-4" aria-hidden="true" />
          View Statement
        </Link>
      </div>
    </section>
  );
}

export function DashboardQuickActions({ actions }: { actions: DashboardAction[] }) {
  if (!actions.length) return <DashboardEmptyState title="No quick actions available" description="Enabled homeowner services will appear here when included in your association plan." />;
  return (
    <section aria-label="Priority quick actions">
      <div className="grid grid-cols-2 gap-3">
        {actions.slice(0, 4).map((action) => (
          <Link key={`${action.href}-${action.label}`} href={action.href} className="flex min-h-32 flex-col justify-between rounded-3xl border border-pine-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
            <span className="grid size-12 place-items-center rounded-2xl bg-pine-50 text-pine-700">
              <action.icon className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-black text-ink">{action.label}</span>
              <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500">{action.description}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function DashboardSection({
  title,
  eyebrow,
  actionHref,
  actionLabel = "View All",
  children,
}: {
  title: string;
  eyebrow?: string;
  actionHref?: string;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="text-[11px] font-black uppercase tracking-[.16em] text-pine-700">{eyebrow}</p>}
          <h2 className="text-lg font-black text-ink">{title}</h2>
        </div>
        {actionHref && <Link href={actionHref} className="inline-flex min-h-12 shrink-0 items-center rounded-xl px-2 text-sm font-black text-pine-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">{actionLabel}</Link>}
      </div>
      {children}
    </section>
  );
}

export function DashboardList({ items, emptyTitle, emptyDescription }: { items: DashboardListItem[]; emptyTitle: string; emptyDescription: string }) {
  if (!items.length) return <DashboardEmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="space-y-3">
      {items.map((item) => <DashboardListRow key={`${item.title}-${item.meta}`} item={item} />)}
    </div>
  );
}

export function DashboardAnnouncementCard({ announcement }: { announcement: DashboardAnnouncement | null }) {
  if (!announcement) return <DashboardEmptyState title="No announcements" description="Published HOA notices will appear here." />;
  return (
    <Link href={announcement.href} className="block overflow-hidden rounded-3xl border border-slate-100 bg-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">
      {announcement.imageUrl ? <ContentImage src={announcement.imageUrl} alt={announcement.title} className="h-44 w-full object-cover" fallbackText="Announcement image unavailable" /> : <FallbackVisual icon={ImageOff} label="Announcement" />}
      <div className="p-4">
        <p className="text-xs font-bold uppercase tracking-[.12em] text-pine-700">{announcement.dateLabel}</p>
        <h3 className="mt-2 line-clamp-2 text-base font-black text-ink">{announcement.title}</h3>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{announcement.summary}</p>
      </div>
    </Link>
  );
}

export function UpcomingEvents({ events }: { events: DashboardEvent[] }) {
  if (!events.length) return <DashboardEmptyState title="No upcoming events" description="Published community events will appear here." />;
  return (
    <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-1">
      {events.map((event) => (
        <Link key={event.href} href={event.href} className="min-w-[82%] snap-start overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20 sm:min-w-[18rem] md:min-w-0">
          {event.imageUrl ? <ContentImage src={event.imageUrl} alt={event.title} className="h-36 w-full object-cover" fallbackText="Event image unavailable" /> : <FallbackVisual icon={CalendarDays} label="Event" />}
          <div className="space-y-2 p-4">
            <h3 className="line-clamp-2 text-base font-black text-ink">{event.title}</h3>
            <p className="line-clamp-2 text-sm leading-6 text-slate-500">{event.description}</p>
            <div className="space-y-1 text-xs font-bold text-slate-500">
              <p className="flex gap-2"><CalendarDays className="size-4 shrink-0 text-pine-700" aria-hidden="true" />{event.dateLabel}</p>
              <p className="flex gap-2"><Clock3 className="size-4 shrink-0 text-pine-700" aria-hidden="true" />{event.timeLabel}</p>
              <p className="flex gap-2"><MapPin className="size-4 shrink-0 text-pine-700" aria-hidden="true" />{event.location}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function DashboardEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-pine-100 bg-slate-50 p-5 text-center">
      <p className="font-black text-ink">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

export function DashboardSkeletons() {
  return (
    <div className="space-y-5">
      <div className="h-20 rounded-3xl bg-slate-100" />
      <div className="h-56 rounded-3xl bg-slate-100" />
      <div className="grid grid-cols-2 gap-3">{[1, 2, 3, 4].map((item) => <div key={item} className="h-32 rounded-3xl bg-slate-100" />)}</div>
      <div className="grid gap-5 xl:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-64 rounded-3xl bg-slate-100" />)}</div>
    </div>
  );
}

function DashboardListRow({ item }: { item: DashboardListItem }) {
  const content = (
    <div className="flex min-h-20 items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 transition hover:bg-white">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-pine-700 shadow-sm">
        <item.icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block font-black text-ink">{item.title}</span>
        <span className="mt-0.5 line-clamp-2 block text-sm leading-5 text-slate-500">{item.description}</span>
        <span className="mt-1 block text-xs font-bold text-slate-400">{item.meta}</span>
      </span>
      {item.status && <span className="shrink-0 rounded-full bg-pine-50 px-2.5 py-1 text-[11px] font-black text-pine-700">{item.status}</span>}
      {item.href && <ChevronRight className="mt-3 size-4 shrink-0 text-slate-300" aria-hidden="true" />}
    </div>
  );
  return item.href ? <Link href={item.href} className="block focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">{content}</Link> : content;
}

function FallbackVisual({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="grid h-36 place-items-center bg-pine-50 text-pine-700">
      <div className="text-center">
        <Icon className="mx-auto size-8" aria-hidden="true" />
        <p className="mt-2 text-xs font-black uppercase tracking-[.16em]">{label}</p>
      </div>
    </div>
  );
}
