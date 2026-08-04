import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, ChevronRight, CreditCard, FileQuestion, FileText, Home, Megaphone, MessageSquare, MoreHorizontal, QrCode, ReceiptText, UserRound, UsersRound } from "lucide-react";
import { AssociationLogo } from "@/components/association-logo";
import { isHomeownerPrimaryActive, type HomeownerPrimaryDestination } from "@/lib/homeowner-navigation";

type AssociationBrand = { name: string; logoUrl: string };
type PortalUser = { name: string; email: string };

export function PortalMobileHeader({
  association,
  user,
  unreadCount,
  showChat = true,
  title,
  isDashboard = false,
}: {
  association: AssociationBrand;
  user: PortalUser;
  unreadCount: number;
  showChat?: boolean;
  title: string;
  isDashboard?: boolean;
}) {
  const firstName = user.name.split(" ")[0] || "Homeowner";
  return (
    <header className="sticky top-0 z-40 border-b border-pine-100/80 bg-white/95 px-4 pb-3 pt-[calc(.75rem+env(safe-area-inset-top))] shadow-sm backdrop-blur lg:hidden">
      <div className="flex items-center gap-3">
        <AssociationLogo className="size-11" src={association.logoUrl} alt={`${association.name} logo`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-black uppercase tracking-[.14em] text-pine-700">{association.name}</p>
          <h1 className="truncate text-base font-black text-ink">{isDashboard ? `Hi, ${firstName}` : title}</h1>
        </div>
        {showChat && <Link href="/portal/chat" aria-label={unreadCount > 0 ? `Open chat, ${unreadCount} unread messages` : "Open chat"} className="relative grid size-11 place-items-center rounded-2xl border border-pine-100 bg-pine-50 text-pine-700 focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">
          <MessageSquare className="size-5" />
          {unreadCount > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
        </Link>}
        <Link href="/portal/profile" aria-label="Open profile" className="grid size-11 place-items-center rounded-2xl border border-slate-200 bg-white text-ink focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">
          <UserRound className="size-5" />
        </Link>
      </div>
    </header>
  );
}

const bottomNavIcons: Record<HomeownerPrimaryDestination["icon"], LucideIcon> = {
  home: Home,
  payments: QrCode,
  requests: FileQuestion,
  community: UsersRound,
  more: MoreHorizontal,
};

export function PortalBottomNavigation({ destinations, pathname }: { destinations: HomeownerPrimaryDestination[]; pathname: string }) {
  return (
    <nav aria-label="Homeowner primary navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-pine-100 bg-white/95 px-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_rgba(8,97,141,.12)] backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-lg gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(destinations.length, 1)}, minmax(0, 1fr))` }}>
        {destinations.map((entry) => <BottomNavItem key={entry.id} href={entry.href} label={entry.label} icon={bottomNavIcons[entry.icon]} active={isHomeownerPrimaryActive(entry, pathname)} />)}
      </div>
    </nav>
  );
}

function BottomNavItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-black transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20 ${active ? "bg-pine-700 text-white shadow-brand" : "text-slate-500 hover:bg-pine-50 hover:text-pine-700"}`}>
      <Icon className="size-5" />
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

export function PortalPageContainer({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl ${className}`}>{children}</div>;
}

export function PortalSectionHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="text-[11px] font-black uppercase tracking-[.16em] text-pine-700">{eyebrow}</p>}
        <h2 className="text-lg font-black text-ink">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function PortalSummaryCard({ label, value, note, icon: Icon, tone = "default", href }: { label: string; value: string; note?: string; icon: LucideIcon; tone?: "default" | "success" | "warning"; href?: string }) {
  const toneClass = tone === "success" ? "from-emerald-50 to-leaf-50 text-emerald-800" : tone === "warning" ? "from-amber-50 to-white text-amber-900" : "from-white to-pine-50 text-ink";
  const content = (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-slate-500">{label}</p>
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-pine-700 shadow-sm ring-1 ring-pine-100"><Icon className="size-5" /></span>
      </div>
      <p className="break-words text-2xl font-black tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>}
    </>
  );
  const className = `block rounded-3xl border border-pine-100 bg-gradient-to-br p-5 shadow-soft ${toneClass}`;
  return href ? <Link href={href} className={`${className} transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20`}>{content}</Link> : <div className={className}>{content}</div>;
}

export function PortalQuickActionTile({ href, label, description, icon: Icon }: { href: string; label: string; description: string; icon: LucideIcon }) {
  return (
    <Link href={href} className="flex min-h-24 items-center gap-3 rounded-3xl border border-pine-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><Icon className="size-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-black text-ink">{label}</span>
        <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-slate-500">{description}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-slate-300" />
    </Link>
  );
}

export function PortalMobileListItem({ title, meta, value, href, icon: Icon = CalendarDays }: { title: string; meta?: string; value?: string; href?: string; icon?: LucideIcon }) {
  const content = (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-pine-50 text-pine-700"><Icon className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block font-bold text-ink">{title}</span>
        {meta && <span className="mt-0.5 block text-xs leading-5 text-slate-500">{meta}</span>}
      </span>
      {value && <span className="max-w-28 shrink-0 text-right text-sm font-black tabular-nums text-pine-700">{value}</span>}
    </div>
  );
  return href ? <Link href={href} className="block focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">{content}</Link> : content;
}

export function PortalEmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-3xl border border-dashed border-pine-100 bg-white/80 p-6 text-center"><p className="font-black text-ink">{title}</p><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></div>;
}

export function PortalSkeletonCard() {
  return <div className="rounded-3xl border border-pine-100 bg-white p-5 shadow-soft"><div className="h-4 w-28 rounded bg-slate-100" /><div className="mt-5 h-8 w-40 rounded bg-slate-100" /><div className="mt-3 h-3 w-full rounded bg-slate-100" /></div>;
}

export function PortalErrorState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5 text-rose-900"><p className="font-black">{title}</p><p className="mt-1 text-sm leading-6">{description}</p></div>;
}

export const portalQuickActionIcons = {
  pay: QrCode,
  soa: ReceiptText,
  receipts: CreditCard,
  documents: FileText,
  announcements: Megaphone,
  chat: MessageSquare,
  vehicles: MoreHorizontal,
  events: CalendarDays,
};
