import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, ChevronRight, CreditCard, FileText, Megaphone, MessageSquare, MoreHorizontal, QrCode, ReceiptText } from "lucide-react";
import { PortalBottomNavigationClient, PortalMobileHeaderClient } from "@/components/portal-mobile-route-chrome";
import type { HomeownerPrimaryDestination } from "@/lib/homeowner-navigation";

type AssociationBrand = { name: string; logoUrl: string };
type PortalUser = { name: string; email: string };
type RouteTitle = { href: string; label: string };

export function PortalMobileHeader({ association, user, unreadCount, routeTitles, showChat = true }: { association: AssociationBrand; user: PortalUser; unreadCount: number; routeTitles: RouteTitle[]; showChat?: boolean }) {
  return <PortalMobileHeaderClient association={association} user={user} unreadCount={unreadCount} routeTitles={routeTitles} showChat={showChat} />;
}

export function PortalBottomNavigation({ destinations }: { destinations: HomeownerPrimaryDestination[] }) {
  return <PortalBottomNavigationClient destinations={destinations} />;
}

export function PortalPageContainer({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl ${className}`}>{children}</div>;
}

export function PortalSectionHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div>{eyebrow && <p className="text-[10px] font-black uppercase tracking-[.15em] text-[#2f8f70]">{eyebrow}</p>}<h2 className="text-lg font-black tracking-[-.02em] text-[#10344d]">{title}</h2></div>{action}</div>;
}

export function PortalSummaryCard({ label, value, note, icon: Icon, tone = "default", href, compact = false }: { label: string; value: string; note?: string; icon: LucideIcon; tone?: "default" | "success" | "warning"; href?: string; compact?: boolean }) {
  const toneClass = tone === "success" ? "bg-[#f0faf4] text-[#176d50]" : tone === "warning" ? "bg-[#fff8e9] text-[#8a6419]" : "bg-white text-[#10344d]";
  const content = <div className={compact ? "flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3" : "flex min-w-0 items-center gap-3"}><span className={`grid shrink-0 place-items-center bg-[#eaf6ff] text-[#0b80be] ${compact ? "size-9 rounded-[12px] sm:size-10 sm:rounded-[14px]" : "size-10 rounded-[14px]"}`}><Icon className="size-[18px]" /></span><span className="min-w-0 flex-1"><span className={compact ? "block w-full text-[9px] font-black uppercase leading-3 tracking-[.06em] text-[#8797a4] sm:truncate sm:text-[10px] sm:tracking-[.09em]" : "block truncate text-[10px] font-black uppercase tracking-[.09em] text-[#8797a4]"}>{label}</span><span className="mt-1 block truncate text-xl font-black tabular-nums tracking-[-.03em]">{value}</span>{note && <span className="mt-0.5 hidden truncate text-[11px] text-[#718290] sm:block">{note}</span>}</span>{href && <ChevronRight className={compact ? "hidden size-4 shrink-0 text-[#a9bac5] sm:block" : "size-4 shrink-0 text-[#a9bac5]"} />}</div>;
  const className = `block rounded-[18px] border border-[#e3edf2] ${compact ? "p-3 sm:p-3.5" : "p-3.5"} shadow-[0_8px_20px_rgba(19,64,90,.05)] ${toneClass}`;
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
