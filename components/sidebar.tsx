"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { BellRing, Building2, CalendarDays, CarFront, ChevronDown, CircleDollarSign, CreditCard, FileBarChart, FileText, HardHat, KeyRound, Layers3, LayoutDashboard, ListChecks, LogOut, Megaphone, Menu, MessageSquare, ReceiptText, Settings, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import { AssociationLogo } from "@/components/association-logo";
import type { IconName, LinkItem } from "@/components/sidebar-links";

const icons: Record<IconName, LucideIcon> = { audit: ShieldCheck, dashboard: LayoutDashboard, homeowners: UsersRound, contractors: HardHat, vehicles: CarFront, employees: UsersRound, attendance: CalendarDays, payroll: CreditCard, expenses: ReceiptText, billing: CircleDollarSign, payments: CreditCard, collections: ReceiptText, announcements: Megaphone, events: CalendarDays, reports: FileBarChart, data: FileBarChart, settings: Settings, profile: UserRound, licenses: KeyRound, chat: MessageSquare, documents: FileText, plans: Layers3, platform: Building2, subscriptions: ListChecks };
type AssociationBrand = { name: string; logoUrl: string };
const OPEN_SECTIONS_KEY = "hoahub.sidebar.openSections.v1";

export function Sidebar({ user, links, roleLabel, association, initialChatUnreadCount = 0 }: { user: { name: string; email: string }; links: LinkItem[]; roleLabel: string; association: AssociationBrand; initialChatUnreadCount?: number }) {
  const pathname = usePathname();
  const mobileMenuRef = useRef<HTMLDetailsElement>(null);
  const [chatUnreadCount, setChatUnreadCount] = useState(initialChatUnreadCount);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const groupedLinks = useMemo(() => groupLinks(links), [links]);
  const hasChatLink = links.some((item) => item.icon === "chat");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(OPEN_SECTIONS_KEY);
      if (saved) setOpenSections(JSON.parse(saved) as Record<string, boolean>);
    } catch { /* Ignore storage issues; the nav remains usable. */ }
  }, []);
  useEffect(() => {
    if (!Object.keys(openSections).length) return;
    try {
      window.localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify(openSections));
    } catch { /* Ignore storage issues; the nav remains usable. */ }
  }, [openSections]);
  useEffect(() => {
    if (!hasChatLink) return;
    let active = true;
    async function refreshUnread() {
      try {
        const response = await fetch("/api/chat/unread", { cache: "no-store" });
        if (!response.ok || !active) return;
        const result = await response.json() as { unreadCount?: number };
        setChatUnreadCount(Math.max(0, Number(result.unreadCount) || 0));
      } catch { /* The next poll retries without interrupting navigation. */ }
    }
    function handleUnread(event: Event) {
      const count = Number((event as CustomEvent<{ count?: number }>).detail?.count);
      if (Number.isFinite(count)) setChatUnreadCount(Math.max(0, count));
      else void refreshUnread();
    }
    const timer = window.setInterval(refreshUnread, 12_000);
    window.addEventListener("chat-unread-updated", handleUnread);
    window.addEventListener("focus", refreshUnread);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("chat-unread-updated", handleUnread); window.removeEventListener("focus", refreshUnread); };
  }, [hasChatLink]);
  const closeMobileMenu = () => {
    if (mobileMenuRef.current) mobileMenuRef.current.open = false;
  };
  const toggleSection = (section: string) => {
    setOpenSections((current) => ({ ...current, [section]: !(current[section] ?? true) }));
  };
  const titleParts = association.name.split(/\s+/);
  const firstLine = titleParts.slice(0, 3).join(" ") || association.name;
  const secondLine = titleParts.slice(3).join(" ");
  return (
    <aside className="sticky top-0 z-40 border-b border-white/10 bg-gradient-to-b from-pine-900 via-pine-700 to-pine-900 text-white shadow-2xl lg:fixed lg:inset-y-0 lg:left-0 lg:w-72 lg:border-b-0 lg:border-r">
      <span className="absolute inset-x-0 top-0 hidden h-1 bg-gradient-to-r from-leaf-500 via-white/80 to-pine-500 lg:block" />
      <div className="flex h-18 items-center justify-between px-5 lg:h-24">
        <Link href={links[0].href} className="flex min-w-0 items-center gap-3 font-black"><AssociationLogo className="size-12 lg:size-14" src={association.logoUrl} alt={`${association.name} logo`} /><span className="min-w-0 max-w-44 break-words text-sm leading-tight lg:text-base">{firstLine}<br />{secondLine && <span className="text-leaf-100">{secondLine}</span>}</span></Link>
        <details ref={mobileMenuRef} className="relative lg:hidden"><summary aria-label="Open navigation" className="relative cursor-pointer list-none rounded-xl border border-white/15 bg-white/10 p-2.5 hover:bg-white/20"><Menu className="size-5" />{hasChatLink && chatUnreadCount > 0 && <span className="absolute -right-2 -top-2 grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white" aria-label={`${chatUnreadCount} unread chat messages`}>{chatUnreadCount > 99 ? "99+" : chatUnreadCount}</span>}</summary><nav className="absolute right-0 top-12 z-50 max-h-[75vh] w-72 overflow-y-auto rounded-2xl border border-white/10 bg-pine-900 p-2 shadow-2xl">{groupedLinks.map(({ section, items }) => <SidebarSection key={section} section={section} items={items} pathname={pathname} open={sectionIsActive(items, pathname) || (openSections[section] ?? true)} onToggle={() => toggleSection(section)} unreadCount={chatUnreadCount} onNavigate={closeMobileMenu} mobile />)}<form action={logoutAction} className="mt-1 border-t border-white/10 pt-1"><button onClick={closeMobileMenu} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-white/10"><LogOut className="size-4" />Log out</button></form></nav></details>
      </div>
      <nav className="hidden max-h-[calc(100vh-13.5rem)] overflow-y-auto px-3 pb-5 lg:block">
        {groupedLinks.map(({ section, items }) => <SidebarSection key={section} section={section} items={items} pathname={pathname} open={sectionIsActive(items, pathname) || (openSections[section] ?? true)} onToggle={() => toggleSection(section)} unreadCount={chatUnreadCount} />)}
      </nav>
      <div className="hidden border-t border-white/10 bg-black/5 p-4 lg:absolute lg:inset-x-0 lg:bottom-0 lg:block">
        <div className="mb-3 flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-leaf-500 to-leaf-600 font-black text-white shadow-lg">{user.name.charAt(0)}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{user.name}</p><p className="truncate text-xs text-pine-100/70">{roleLabel}</p></div></div>
        <form action={logoutAction}><button className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-xs font-bold text-pine-100 hover:bg-white/10"><LogOut className="size-4" /> Log out</button></form>
      </div>
    </aside>
  );
}

function SidebarSection({ section, items, pathname, open, onToggle, unreadCount, onNavigate, mobile = false }: { section: string; items: LinkItem[]; pathname: string; open: boolean; onToggle: () => void; unreadCount: number; onNavigate?: () => void; mobile?: boolean }) {
  return <div className="mt-2">
    <button type="button" onClick={onToggle} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-[10px] font-extrabold uppercase tracking-[.2em] text-leaf-100/85 hover:bg-white/10">
      <span>{section}</span>
      <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div className="mt-1 space-y-1">
      {items.map((item) => <SidebarLink key={item.href} item={item} active={linkIsActive(item.href, pathname)} unreadCount={item.icon === "chat" ? unreadCount : 0} onNavigate={onNavigate} mobile={mobile} />)}
    </div>}
  </div>;
}

function SidebarLink({ item, active, unreadCount, onNavigate, mobile = false }: { item: LinkItem; active: boolean; unreadCount: number; onNavigate?: () => void; mobile?: boolean }) {
  const Icon = item.icon === "chat" && unreadCount > 0 ? BellRing : icons[item.icon];
  return <Link href={item.href} onClick={onNavigate} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-white text-pine-900 shadow-lg" : "text-pine-100 hover:bg-white/10 hover:text-white"} ${mobile ? "" : "mb-1"}`}><span className={`grid size-8 place-items-center rounded-lg ${active ? "bg-gradient-to-br from-leaf-100 to-pine-100 text-pine-700" : item.icon === "chat" && unreadCount > 0 ? "animate-pulse bg-red-500 text-white" : "bg-white/5"}`}><Icon className="size-4" /></span><span className="min-w-0 flex-1 truncate">{item.label}</span>{unreadCount > 0 && <span className={`ml-auto grid min-w-6 place-items-center rounded-full px-2 py-1 text-xs font-black ${active ? "bg-red-500 text-white" : "bg-white text-pine-900"}`} aria-label={`${unreadCount} unread messages`}>{unreadCount > 99 ? "99+" : unreadCount}</span>}</Link>;
}

function groupLinks(links: LinkItem[]) {
  return links.reduce<Array<{ section: string; items: LinkItem[] }>>((groups, item) => {
    const group = groups.find((entry) => entry.section === item.section);
    if (group) group.items.push(item);
    else groups.push({ section: item.section, items: [item] });
    return groups;
  }, []);
}

function sectionIsActive(items: LinkItem[], pathname: string) {
  return items.some((item) => linkIsActive(item.href, pathname));
}

function linkIsActive(href: string, pathname: string) {
  if (href === "/admin/reports") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const adminLinks: LinkItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "dashboard", section: "Overview" },
  { href: "/admin/homeowners", label: "Homeowners", icon: "homeowners", section: "Residents" }, { href: "/admin/contractors", label: "Contractors", icon: "contractors", section: "Residents" }, { href: "/admin/vehicles", label: "Vehicles & stickers", icon: "vehicles", section: "Residents" },
  { href: "/admin/employees", label: "Employees", icon: "employees", section: "Human resources" }, { href: "/admin/attendance", label: "Attendance", icon: "attendance", section: "Human resources" }, { href: "/admin/payroll", label: "Payroll", icon: "payroll", section: "Human resources" },
  { href: "/admin/billing", label: "Billing", icon: "billing", section: "Finance" }, { href: "/admin/payments/record", label: "Record payment", icon: "payments", section: "Payments" }, { href: "/admin/payments/requests", label: "Payment requests", icon: "payments", section: "Payments" }, { href: "/admin/payments/active", label: "Active payments", icon: "payments", section: "Payments" }, { href: "/admin/payments/history", label: "Transaction history", icon: "payments", section: "Payments" }, { href: "/admin/collections", label: "Other collections", icon: "collections", section: "Finance" }, { href: "/admin/expenses", label: "Expenses", icon: "expenses", section: "Finance" }, { href: "/admin/reports", label: "Reports", icon: "reports", section: "Finance" }, { href: "/admin/data", label: "Data management", icon: "data", section: "Finance" }, { href: "/admin/data/migrations", label: "Balance migration", icon: "data", section: "Finance" },
  { href: "/admin/documents", label: "Document requests", icon: "documents", section: "Community" }, { href: "/admin/announcements", label: "Announcements", icon: "announcements", section: "Community" }, { href: "/admin/events", label: "Events", icon: "events", section: "Community" }, { href: "/admin/chat", label: "Chat", icon: "chat", section: "Community" },
];
export const systemAdminLinks: LinkItem[] = [
  { href: "/admin/settings", label: "System settings", icon: "settings", section: "System" },
  ...adminLinks,
];
export const portalLinks: LinkItem[] = [
  { href: "/portal/dashboard", label: "Dashboard", icon: "dashboard", section: "Overview" }, { href: "/portal/profile", label: "My profile", icon: "profile", section: "Account" },
  { href: "/portal/billing", label: "My billing", icon: "billing", section: "Account" }, { href: "/portal/pay", label: "Pay by QR", icon: "payments", section: "Account" }, { href: "/portal/payments", label: "My payments", icon: "payments", section: "Account" }, { href: "/portal/collections", label: "Collections & bonds", icon: "collections", section: "Account" }, { href: "/portal/vehicles", label: "My vehicles", icon: "vehicles", section: "Account" }, { href: "/portal/documents", label: "Document requests", icon: "documents", section: "Account" },
  { href: "/portal/announcements", label: "Announcements", icon: "announcements", section: "Community" }, { href: "/portal/events", label: "Events", icon: "events", section: "Community" }, { href: "/portal/chat", label: "Chat", icon: "chat", section: "Community" },
];
export const employeeLinks: LinkItem[] = [
  { href: "/employee/attendance", label: "Clock in / out", icon: "attendance", section: "Employee" },
  { href: "/employee/payslips", label: "My payslips", icon: "payroll", section: "Employee" },
  { href: "/employee/chat", label: "Chat", icon: "chat", section: "Support" },
];
