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
    <section className="hidden space-y-2 px-1 lg:block">
      <p className="text-sm font-black text-[#0b6f93]">{greeting}</p>
      <div className="min-w-0">
        <h1 className="break-words text-3xl font-black leading-tight text-[#10344d]">Good {greeting.toLowerCase()}, {firstName}</h1>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#718290]">{associationName}</p>
        {propertyLabel && <p className="mt-1 text-xs font-bold uppercase tracking-[.12em] text-[#8797a4]">{propertyLabel}</p>}
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
  const accountHealth = paid ? "No overdue dues" : overdue ? "Balance needs attention" : status === "No Billing Record" ? "No billing record" : status === "Safe Error" ? "Billing temporarily unavailable" : "Billing account active";
  const mobileGradient = overdue
    ? "from-[#6f2833] via-[#8f3b45] to-[#a64d55]"
    : paid
      ? "from-[#0a3a56] via-[#0f6d75] to-[#2e9a64]"
      : "from-[#0a3a56] via-[#0f6d75] to-[#178ca0]";

  return (
    <section className="overflow-hidden rounded-[22px] border border-[#dbe7ee] bg-white shadow-[0_10px_28px_rgba(19,64,90,.07)]" aria-label="Current balance">
      <div className={`bg-gradient-to-br ${mobileGradient} p-5 text-white sm:p-6 lg:bg-none lg:text-[#10344d]`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#d0f0ea] lg:text-[#0b6f93]">Account Health</p>
            <p className="mt-2 text-[22px] font-black tracking-[-.025em] text-white lg:text-[#10344d]">{accountHealth}</p>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-[.1em] text-[#d5eef1] lg:text-[#8797a4]">Current balance</p>
            <p className="mt-1 break-words text-[30px] font-black tracking-[-.04em] text-white tabular-nums sm:text-[34px] lg:text-[#10344d]">{amount}</p>
          </div>
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/10 lg:bg-[#eaf6ff] lg:text-[#0b80be] lg:ring-[#d9edf8]">
            {paid ? <CheckCircle2 className="size-6" aria-hidden="true" /> : overdue ? <AlertCircle className="size-6" aria-hidden="true" /> : <ReceiptText className="size-6" aria-hidden="true" />}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black text-white lg:border-0 lg:bg-[#eef8fb] lg:text-[#0b6f93]">{status}</span>
          {dueDateLabel && <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white lg:border-0 lg:bg-slate-100 lg:text-slate-600">Due {dueDateLabel}</span>}
          {coverageLabel && <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white lg:border-0 lg:bg-slate-100 lg:text-slate-600">{coverageLabel}</span>}
        </div>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4">
        <Link href="/portal/pay" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-[#0b95d8] px-4 text-sm font-black text-white shadow-[0_8px_18px_rgba(11,149,216,.18)] hover:bg-[#087db8]">
          <QrCode className="size-4" aria-hidden="true" /> Pay Dues
        </Link>
        <Link href="/portal/soa" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] border border-[#cfe5ef] bg-[#eef8fb] px-4 text-sm font-black text-[#0b6f93] hover:bg-[#e2f3fa]">
          <FileText className="size-4" aria-hidden="true" /> View Statement
        </Link>
      </div>
    </section>
  );
}

export function DashboardQuickActions({ actions }: { actions: DashboardAction[] }) {
  if (!actions.length) return <DashboardEmptyState title="No quick actions available" description="Enabled homeowner services will appear here when included in your association plan." />;
  return (
    <section aria-label="Resident shortcuts" className="rounded-[20px] border border-[#e3edf2] bg-white p-3 shadow-[0_8px_20px_rgba(19,64,90,.05)] sm:p-4">
      <p className="px-1 pb-2 text-[10px] font-black uppercase tracking-[.14em] text-[#8797a4]">Resident Shortcuts</p>
      <div className="divide-y divide-[#edf2f5]">
        {actions.slice(0, 4).map((action) => (
          <Link key={`${action.href}-${action.label}`} href={action.href} className="group flex min-h-[66px] items-center gap-3 px-1 py-2.5 focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#0b95d8]/20">
            <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-[#eaf6ff] text-[#0b80be] transition group-hover:bg-[#dff2fc]">
              <action.icon className="size-[18px]" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-[#11384d]">{action.label}</span>
              <span className="mt-0.5 line-clamp-1 block text-xs text-[#7f8d98]">{action.description}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-[#a9bac5] transition group-hover:translate-x-0.5" aria-hidden="true" />
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
    <section className="rounded-[22px] border border-[#e3edf2] bg-white p-4 shadow-[0_8px_20px_rgba(19,64,90,.05)] sm:p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#0b6f93]">{eyebrow}</p>}
          <h2 className="text-lg font-black tracking-[-.02em] text-[#10344d]">{title}</h2>
        </div>
        {actionHref && <Link href={actionHref} className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-2 text-sm font-black text-[#0b6f93] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#0b95d8]/20">{actionLabel}</Link>}
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
    <Link href={announcement.href} className="block overflow-hidden rounded-[18px] border border-[#e3edf2] bg-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#0b95d8]/20">
      {announcement.imageUrl ? <ContentImage src={announcement.imageUrl} alt={announcement.title} className="h-44 w-full object-cover" fallbackText="Announcement image unavailable" /> : <FallbackVisual icon={ImageOff} label="Announcement" />}
      <div className="p-4">
        <p className="text-xs font-bold uppercase tracking-[.12em] text-[#0b6f93]">{announcement.dateLabel}</p>
        <h3 className="mt-2 line-clamp-2 text-base font-black text-[#10344d]">{announcement.title}</h3>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#718290]">{announcement.summary}</p>
      </div>
    </Link>
  );
}

export function UpcomingEvents({ events }: { events: DashboardEvent[] }) {
  if (!events.length) return <DashboardEmptyState title="No upcoming events" description="Published community events will appear here." />;
  return (
    <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-1">
      {events.map((event) => (
        <Link key={event.href} href={event.href} className="min-w-[82%] snap-start overflow-hidden rounded-[18px] border border-[#e3edf2] bg-white shadow-[0_6px_18px_rgba(19,64,90,.04)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#0b95d8]/20 sm:min-w-[18rem] md:min-w-0">
          {event.imageUrl ? <ContentImage src={event.imageUrl} alt={event.title} className="h-36 w-full object-cover" fallbackText="Event image unavailable" /> : <FallbackVisual icon={CalendarDays} label="Event" />}
          <div className="space-y-2 p-4">
            <h3 className="line-clamp-2 text-base font-black text-[#10344d]">{event.title}</h3>
            <p className="line-clamp-2 text-sm leading-6 text-[#718290]">{event.description}</p>
            <div className="space-y-1 text-xs font-bold text-[#718290]">
              <p className="flex gap-2"><CalendarDays className="size-4 shrink-0 text-[#0b6f93]" aria-hidden="true" />{event.dateLabel}</p>
              <p className="flex gap-2"><Clock3 className="size-4 shrink-0 text-[#0b6f93]" aria-hidden="true" />{event.timeLabel}</p>
              <p className="flex gap-2"><MapPin className="size-4 shrink-0 text-[#0b6f93]" aria-hidden="true" />{event.location}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function DashboardEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[18px] border border-dashed border-[#cbdfe9] bg-[#f7fbfd] p-5 text-center">
      <p className="font-black text-[#10344d]">{title}</p>
      <p className="mt-1 text-sm leading-6 text-[#718290]">{description}</p>
    </div>
  );
}

export function DashboardSkeletons() {
  return (
    <div className="space-y-5">
      <div className="h-20 rounded-[18px] bg-slate-100" />
      <div className="h-56 rounded-[22px] bg-slate-100" />
      <div className="grid grid-cols-2 gap-3">{[1, 2, 3, 4].map((item) => <div key={item} className="h-24 rounded-[18px] bg-slate-100" />)}</div>
      <div className="grid gap-5 xl:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-64 rounded-[22px] bg-slate-100" />)}</div>
    </div>
  );
}

function DashboardListRow({ item }: { item: DashboardListItem }) {
  const content = (
    <div className="flex min-h-20 items-start gap-3 rounded-[18px] border border-[#e3edf2] bg-[#f7fbfd] p-3 transition hover:bg-white">
      <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-white text-[#0b80be] shadow-sm">
        <item.icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block font-black text-[#10344d]">{item.title}</span>
        <span className="mt-0.5 line-clamp-2 block text-sm leading-5 text-[#718290]">{item.description}</span>
        <span className="mt-1 block text-xs font-bold text-[#8797a4]">{item.meta}</span>
      </span>
      {item.status && <span className="shrink-0 rounded-full bg-[#eaf6ff] px-2.5 py-1 text-[11px] font-black text-[#0b6f93]">{item.status}</span>}
      {item.href && <ChevronRight className="mt-3 size-4 shrink-0 text-[#a9bac5]" aria-hidden="true" />}
    </div>
  );
  return item.href ? <Link href={item.href} className="block focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#0b95d8]/20">{content}</Link> : content;
}

function FallbackVisual({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="grid h-36 place-items-center bg-[#eef8fb] text-[#0b6f93]">
      <div className="text-center">
        <Icon className="mx-auto size-8" aria-hidden="true" />
        <p className="mt-2 text-xs font-black uppercase tracking-[.16em]">{label}</p>
      </div>
    </div>
  );
}
