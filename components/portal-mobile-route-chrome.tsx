"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { FileQuestion, Home, MessageSquare, MoreHorizontal, QrCode, UsersRound } from "lucide-react";
import { AssociationLogo } from "@/components/association-logo";
import { HomeownerAvatar } from "@/components/homeowner-avatar";
import { philippineGreeting } from "@/lib/philippine-greeting";

type AssociationBrand = { name: string; logoUrl: string };
type PortalUser = { name: string; email: string };
type RouteTitle = { href: string; label: string };
type PrimaryDestination = {
  id: "home" | "payments" | "requests" | "community" | "more";
  label: string;
  href: string;
  icon: "home" | "payments" | "requests" | "community" | "more";
  prefixes: string[];
};

const bottomNavIcons: Record<PrimaryDestination["icon"], LucideIcon> = {
  home: Home,
  payments: QrCode,
  requests: FileQuestion,
  community: UsersRound,
  more: MoreHorizontal,
};

function currentPortalTitle(pathname: string, routeTitles: RouteTitle[]) {
  const match = [...routeTitles]
    .sort((left, right) => right.href.length - left.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return match?.label || "Dashboard";
}

function isPrimaryActive(destination: PrimaryDestination, pathname: string) {
  return destination.prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function PortalMobileHeaderClient({
  association,
  user,
  unreadCount,
  routeTitles,
  showChat = true,
}: {
  association: AssociationBrand;
  user: PortalUser;
  unreadCount: number;
  routeTitles: RouteTitle[];
  showChat?: boolean;
}) {
  const pathname = usePathname() || "/portal/dashboard";
  const isDashboard = pathname === "/portal/dashboard";
  const firstName = user.name.split(" ")[0] || "Homeowner";
  const title = currentPortalTitle(pathname, routeTitles);
  const [greeting, setGreeting] = useState(() => philippineGreeting());

  useEffect(() => {
    const refreshGreeting = () => setGreeting(philippineGreeting());
    refreshGreeting();
    const timer = window.setInterval(refreshGreeting, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header
      className="sticky top-0 z-40 overflow-hidden border-b border-white/10 bg-[linear-gradient(150deg,#08324f,#0d6c83_68%,#1bb0d0)] px-4 pb-4 pt-[calc(.8rem+env(safe-area-inset-top))] text-white shadow-[0_12px_34px_rgba(8,50,79,.18)] lg:hidden"
      data-portal-mobile-route={pathname}
    >
      <div className="pointer-events-none absolute -right-12 -top-16 size-40 rounded-full bg-white/10 blur-2xl" />
      <div className="relative mx-auto flex max-w-lg items-center gap-3">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/15">
          <AssociationLogo className="size-9" src={association.logoUrl} alt={`${association.name} logo`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-black uppercase tracking-[.14em] text-[#cde8ef]">
            {isDashboard ? `${greeting}, ${firstName}` : "Resident Services"}
          </p>
          <h1 className="mt-0.5 truncate text-[17px] font-black tracking-[-.02em] text-white" data-portal-mobile-title>
            {isDashboard ? association.name : title}
          </h1>
        </div>
        {showChat && (
          <Link
            href="/portal/chat"
            aria-label={unreadCount > 0 ? `Open chat, ${unreadCount} unread messages` : "Open chat"}
            className="relative grid size-10 place-items-center rounded-2xl border border-white/12 bg-white/10 text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-white/20"
          >
            <MessageSquare className="size-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        )}
        <Link href="/portal/profile" aria-label="Open profile" className="rounded-2xl ring-1 ring-white/15 focus-visible:outline focus-visible:outline-4 focus-visible:outline-white/20">
          <HomeownerAvatar name={user.name} src="/api/profile/photo" className="size-10 rounded-2xl text-xs" />
        </Link>
      </div>
      {isDashboard ? (
        <div className="relative mx-auto mt-3 max-w-lg rounded-[14px] border border-white/10 bg-white/10 px-3.5 py-2.5 text-[12px] font-semibold text-[#d9eef4]">
          Community Hub · Installed PWA ready
        </div>
      ) : null}
    </header>
  );
}

export function PortalBottomNavigationClient({ destinations }: { destinations: PrimaryDestination[] }) {
  const pathname = usePathname() || "/portal/dashboard";

  return (
    <nav
      aria-label="Homeowner primary navigation"
      className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-[#eef5f8] via-[#eef5f8]/95 to-transparent px-3 pb-[calc(.7rem+env(safe-area-inset-bottom))] pt-3 lg:hidden"
    >
      <div
        className="mx-auto grid max-w-lg gap-1 rounded-[22px] border border-[#d7e6ee] bg-white/96 p-1.5 shadow-[0_16px_34px_rgba(15,44,61,.12)] backdrop-blur-xl"
        style={{ gridTemplateColumns: `repeat(${Math.max(destinations.length, 1)}, minmax(0, 1fr))` }}
      >
        {destinations.map((entry) => (
          <BottomNavItem
            key={entry.id}
            id={entry.id}
            href={entry.href}
            label={entry.label}
            icon={bottomNavIcons[entry.icon]}
            active={isPrimaryActive(entry, pathname)}
          />
        ))}
      </div>
    </nav>
  );
}

function BottomNavItem({
  id,
  href,
  label,
  icon: Icon,
  active,
}: {
  id: PrimaryDestination["id"];
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      data-portal-primary-id={id}
      className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-[10px] font-black transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#0b95d8]/20 ${active ? "bg-[#eef8fb] text-[#0b6f93]" : "text-[#6c8492] hover:bg-[#f6fafc]"}`}
    >
      <span className={`grid h-7 min-w-10 place-items-center rounded-full px-2 ${active ? "text-[#0b6f93]" : ""}`}>
        <Icon className="size-[18px]" />
      </span>
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}
