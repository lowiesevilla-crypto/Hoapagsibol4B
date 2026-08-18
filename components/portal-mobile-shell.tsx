import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, ChevronRight, CreditCard, FileQuestion, FileText, Home, Megaphone, MessageSquare, MoreHorizontal, QrCode, ReceiptText, UsersRound } from "lucide-react";
import { AssociationLogo } from "@/components/association-logo";
import { HomeownerAvatar } from "@/components/homeowner-avatar";
import { isHomeownerPrimaryActive, type HomeownerPrimaryDestination } from "@/lib/homeowner-navigation";

type AssociationBrand = { name: string; logoUrl: string };
type PortalUser = { name: string; email: string };

export function PortalMobileHeader({ association, user, unreadCount, showChat = true, title, isDashboard = false }: { association: AssociationBrand; user: PortalUser; unreadCount: number; showChat?: boolean; title: string; isDashboard?: boolean }) {
  const firstName = user.name.split(" ")[0] || "Homeowner";
  return (
    <header className="sticky top-0 z-40 overflow-hidden border-b border-white/10 bg-[linear-gradient(150deg,#08324f,#0d6c83_68%,#1bb0d0)] px-4 pb-4 pt-[calc(.8rem+env(safe-area-inset-top))] text-white shadow-[0_12px_34px_rgba(8,50,79,.18)] lg:hidden">
      <div className="pointer-events-none absolute -right-12 -top-16 size-40 rounded-full bg-white/10 blur-2xl" />
      <div className="relative mx-auto flex max-w-lg items-center gap-3">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/15"><AssociationLogo className="size-9" src={association.logoUrl} alt={`${association.name} logo`} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-black uppercase tracking-[.14em] text-[#cde8ef]">{isDashboard ? `Good day, ${firstName}` : "Resident Services"}</p>
          <h1 className="mt-0.5 truncate text-[17px] font-black tracking-[-.02em] text-white">{isDashboard ? association.name : title}</h1>
        </div>
        {showChat && <Link href="/portal/chat" aria-label={unreadCount > 0 ? `Open chat, ${unreadCount} unread messages` : "Open chat"} className="relative grid size-10 place-items-center rounded-2xl border border-white/12 bg-white/10 text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-white/20"><MessageSquare className="size-[18px]" />{unreadCount > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}</Link>}
        <Link href="/portal/profile" aria-label="Open profile" className="rounded-2xl ring-1 ring-white/15 focus-visible:outline focus-visible:outline-4 focus-visible:outline-white/20"><HomeownerAvatar name={user.name} src="/api/profile/photo" className="size-10 rounded-2xl text-xs" /></Link>
      </div>
      {isDashboard ? <div className="relative mx-auto mt-3 max-w-lg rounded-[14px] border border-white/10 bg-white/10 px-3.5 py-2.5 text-[12px] font-semibold text-[#d9eef4]">Community Hub · Installed PWA ready</div> : null}
    </header>
  );
}

const bottomNavIcons: Record<HomeownerPrimaryDestination["icon"], LucideIcon> = { home: Home, payments: QrCode, requests: FileQuestion, community: UsersRound, more: MoreHorizontal };

export function PortalBottomNavigation({ destinations, pathname }: { destinations: HomeownerPrimaryDestination[]; pathname: string }) {
  return (
    <nav aria-label="Homeowner primary navigation" className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(.7rem+env(safe-area-inset-bottom))] pt-1.5 lg:hidden">
      <div className="mx-auto grid max-w-lg gap-1 rounded-[22px] border border-[#d7e6ee] bg-white/96 p-1.5 shadow-[0_16px_34px_rgba(15,44,61,.12)] backdrop-blur-xl" style={{ gridTemplateColumns: `repeat(${Math.max(destinations.length, 1)}, minmax(0, 1fr))` }}>
        {destinations.map((entry) => <BottomNavItem key={entry.id} href={entry.href} label={entry.label} icon={bottomNavIcons[entry.icon]} active={isHomeownerPrimaryActive(entry, pathname)} />)}
      </div>
    </nav>
  );
}

function BottomNavItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-[10px] font-black transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#0b95d8]/20 ${active ? "bg-[#eef8fb] text-[#0b6f93]" : "text-[#6c8492] hover:bg-[#f6fafc]"}`}><span className={`grid h-7 min-w-10 place-items-center rounded-full px-2 ${active ? "text-[#0b6f93]" : ""}`}><Icon className="size-[18px]" /></span><span className="max-w-full truncate">{label}</span></Link>;
}

export function PortalPageContainer({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl ${className}`}>{children}</div>;
}

export function PortalSectionHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div>{eyebrow && <p className="text-[10px] font-black uppercase tracking-[.15em] text-[#2f8f70]">{eyebrow}</p>}<h2 className="text-lg font-black tracking-[-.02em] text-[#10344d]">{title}</h2></div>{action}</div>;
}

export function PortalSummaryCard({ label, value, note, icon: Icon, tone = "default", href }: { label: string; value: string; note?: string; icon: LucideIcon; tone?: "default" | "success" | "warning"; href?: string }) {
  const toneClass = tone === "success" ? "bg-[#f0faf4] text-[#176d50]" : tone === "warning" ? "bg-[#fff8e9] text-[#8a6419]" : "bg-white text-[#10344d]";
  const content = <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-[#eaf6ff] text-[#0b80be]"><Icon className="size-[18px]" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-black uppercase tracking-[.09em] text-[#8797a4]">{label}</span><span className="mt-1 block truncate text-xl font-black tabular-nums tracking-[-.03em]">{value}</span>{note && <span className="mt-0.5 hidden truncate text-[11px] text-[#718290] sm:block">{note}</span>}</span>{href && <ChevronRight className="size-4 shrink-0 text-[#a9bac5]" />}</div>;
  const className = `block rounded-[18px] border border-[#e3edf2] p-3.5 shadow-[0_8px_20px_rgba(19,64,90,.05)] ${toneClass}`;
  return href ? <Link href={href} className={`${className} transition hover:-translate-y-0.5 hover:border-[#bcddeb] focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#0b95d8]/20 motion-reduce:hover:translate-y-0`}>{content}</Link> : <div className={className}>{content}</div>;
}

export function PortalQuickActionTile({ href, label, description, icon: Icon }: { href: string; label: string; description: string; icon: LucideIcon }) {
  return <Link href={href} className="group flex min-h-[76px] items-center gap-3 rounded-[18px] border border-[#e3edf2] bg-white p-3.5 shadow-[0_8px_20px_rgba(19,64,90,.05)] transition hover:-translate-y-0.5 hover:border-[#bcddeb] hover:shadow-[0_14px_28px_rgba(19,64,90,.08)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#0b95d8]/20 motion-reduce:hover:translate-y-0"><span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-[#eaf6ff] text-[#0b80be] transition group-hover:bg-[#dff2fc]"><Icon className="size-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-[#11384d]">{label}</span><span className="mt-0.5 hidden line-clamp-1 text-xs text-[#7f8d98] sm:block">{description}</span></span><ChevronRight className="size-4 shrink-0 text-[#a9bac5]" /></Link>;
}

export function PortalMobileListItem({ title, meta, value, href, icon: Icon = CalendarDays }: { title: string; meta?: string; value?: string; href?: string; icon?: LucideIcon }) {
  const content = <div className="flex items-center gap-3 rounded-[18px] border border-[#e3edf2] bg-white p-3.5 shadow-[0_6px_18px_rgba(19,64,90,.04)]"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eaf6ff] text-[#0b80be]"><Icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="line-clamp-1 block text-sm font-bold text-[#11384d]">{title}</span>{meta && <span className="mt-0.5 block truncate text-xs text-[#7f8d98]">{meta}</span>}</span>{value && <span className="max-w-28 shrink-0 text-right text-sm font-black tabular-nums text-[#0b6f93]">{value}</span>}</div>;
  return href ? <Link href={href} className="block focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#0b95d8]/20">{content}</Link> : content;
}

export function PortalEmptyState({ title, description }: { title: string; description: string }) { return <div className="rounded-[18px] border border-dashed border-[#cbdfe9] bg-[#f7fbfd] p-5 text-center"><p className="font-black text-[#11384d]">{title}</p><p className="mt-1 text-sm text-[#7f8d98]">{description}</p></div>; }
export function PortalSkeletonCard() { return <div className="rounded-[18px] border border-[#e3edf2] bg-white p-4"><div className="h-3 w-24 rounded bg-slate-100" /><div className="mt-4 h-7 w-32 rounded bg-slate-100" /></div>; }
export function PortalErrorState({ title, description }: { title: string; description: string }) { return <div className="rounded-[18px] border border-rose-100 bg-rose-50 p-4 text-rose-900"><p className="font-black">{title}</p><p className="mt-1 text-sm">{description}</p></div>; }

export const portalQuickActionIcons = { pay: QrCode, soa: ReceiptText, receipts: CreditCard, documents: FileText, announcements: Megaphone, chat: MessageSquare, vehicles: MoreHorizontal, events: CalendarDays };
