import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, ChevronRight, CreditCard, FileQuestion, FileText, Home, Megaphone, MessageSquare, MoreHorizontal, QrCode, ReceiptText, UsersRound } from "lucide-react";
import { AssociationLogo } from "@/components/association-logo";
import { HomeownerAvatar } from "@/components/homeowner-avatar";
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
    <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 px-4 pb-2.5 pt-[calc(.65rem+env(safe-area-inset-top))] shadow-[0_1px_10px_rgba(15,23,42,.04)] backdrop-blur lg:hidden">
      <div className="flex items-center gap-3">
        <AssociationLogo className="size-10" src={association.logoUrl} alt={`${association.name} logo`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-black uppercase tracking-[.13em] text-pine-700">{association.name}</p>
          <h1 className="truncate text-[15px] font-black text-ink">{isDashboard ? `Hi, ${firstName}` : title}</h1>
        </div>
        {showChat && <Link href="/portal/chat" aria-label={unreadCount > 0 ? `Open chat, ${unreadCount} unread messages` : "Open chat"} className="relative grid size-10 place-items-center rounded-full bg-slate-50 text-pine-700 focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">
          <MessageSquare className="size-[18px]" />
          {unreadCount > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
        </Link>}
        <Link href="/portal/profile" aria-label="Open profile" className="rounded-full focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">
          <HomeownerAvatar name={user.name} src="/api/profile/photo" className="size-10 text-xs" />
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
    <nav aria-label="Homeowner primary navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-100 bg-white/95 px-2 pb-[calc(.4rem+env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_24px_rgba(15,23,42,.07)] backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-lg gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(destinations.length, 1)}, minmax(0, 1fr))` }}>
        {destinations.map((entry) => <BottomNavItem key={entry.id} href={entry.href} label={entry.label} icon={bottomNavIcons[entry.icon]} active={isHomeownerPrimaryActive(entry, pathname)} />)}
      </div>
    </nav>
  );
}

function BottomNavItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-[10px] font-black transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20 ${active ? "text-pine-800" : "text-slate-400"}`}>
      <span className={`grid h-7 min-w-10 place-items-center rounded-full px-2 ${active ? "bg-pine-100 text-pine-800" : ""}`}><Icon className="size-[18px]" /></span>
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

export function PortalPageContainer({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl ${className}`}>{children}</div>;
}

export function PortalSectionHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="text-[10px] font-black uppercase tracking-[.15em] text-pine-700">{eyebrow}</p>}
        <h2 className="text-lg font-black tracking-tight text-ink">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function PortalSummaryCard({ label, value, note, icon: Icon, tone = "default", href }: { label: string; value: string; note?: string; icon: LucideIcon; tone?: "default" | "success" | "warning"; href?: string }) {
  const toneClass = tone === "success" ? "bg-emerald-50 text-emerald-800" : tone === "warning" ? "bg-amber-50 text-amber-900" : "bg-white text-ink";
  const content = (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><Icon className="size-[18px]" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-black uppercase tracking-[.08em] text-slate-400">{label}</span><span className="mt-0.5 block truncate text-xl font-black tabular-nums">{value}</span>{note && <span className="mt-0.5 hidden truncate text-[11px] text-slate-400 sm:block">{note}</span>}</span>
      {href && <ChevronRight className="size-4 shrink-0 text-slate-300" />}
    </div>
  );
  const className = `block rounded-2xl border border-slate-100 p-3 shadow-[0_4px_18px_rgba(15,23,42,.04)] ${toneClass}`;
  return href ? <Link href={href} className={`${className} transition hover:border-pine-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20`}>{content}</Link> : <div className={className}>{content}</div>;
}

export function PortalQuickActionTile({ href, label, description, icon: Icon }: { href: string; label: string; description: string; icon: LucideIcon }) {
  return (
    <Link href={href} className="group flex min-h-[72px] items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-[0_4px_18px_rgba(15,23,42,.04)] transition hover:border-pine-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700 transition group-hover:bg-pine-100"><Icon className="size-5" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-ink">{label}</span><span className="mt-0.5 hidden line-clamp-1 text-xs text-slate-400 sm:block">{description}</span></span>
      <ChevronRight className="size-4 shrink-0 text-slate-300" />
    </Link>
  );
}

export function PortalMobileListItem({ title, meta, value, href, icon: Icon = CalendarDays }: { title: string; meta?: string; value?: string; href?: string; icon?: LucideIcon }) {
  const content = (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-pine-50 text-pine-700"><Icon className="size-4" /></span>
      <span className="min-w-0 flex-1"><span className="line-clamp-1 block text-sm font-bold text-ink">{title}</span>{meta && <span className="mt-0.5 block truncate text-xs text-slate-400">{meta}</span>}</span>
      {value && <span className="max-w-28 shrink-0 text-right text-sm font-black tabular-nums text-pine-700">{value}</span>}
    </div>
  );
  return href ? <Link href={href} className="block focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">{content}</Link> : content;
}

export function PortalEmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center"><p className="font-black text-ink">{title}</p><p className="mt-1 text-sm text-slate-400">{description}</p></div>;
}

export function PortalSkeletonCard() {
  return <div className="rounded-2xl border border-slate-100 bg-white p-4"><div className="h-3 w-24 rounded bg-slate-100" /><div className="mt-4 h-7 w-32 rounded bg-slate-100" /></div>;
}

export function PortalErrorState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-rose-900"><p className="font-black">{title}</p><p className="mt-1 text-sm">{description}</p></div>;
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
