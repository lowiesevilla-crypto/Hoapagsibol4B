"use client";

import Link from "next/link";
import { Building2, ShieldCheck, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";

const LABELS: Record<string, string> = {
  platform: "Platform",
  dashboard: "Dashboard",
  tenants: "Tenants",
  subscriptions: "Subscriptions",
  plans: "Plans & Features",
  invoices: "Invoices",
  agreements: "Agreements",
  licenses: "Licenses",
  "document-management": "Document Usage",
  audit: "Audit & Security",
  profile: "My Profile",
  users: "Users",
  billing: "Subscription & Billing",
  features: "Sellable Features",
};

function labelFor(segment: string) {
  return LABELS[segment] ?? segment.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function PlatformTopbar({ userName, roleLabel }: { userName: string; roleLabel: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean).slice(1);
  const breadcrumbs = segments.length ? segments.map(labelFor) : ["Dashboard"];

  return (
    <header className="sticky top-[72px] z-30 border-b border-slate-200/80 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur lg:top-0">
      <div className="mx-auto flex min-h-16 max-w-[1800px] items-center justify-between gap-4 px-4 sm:px-7 lg:px-10">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.18em] text-platform-700">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            <span>HOAHub Platform Mode</span>
          </div>
          <nav aria-label="Platform breadcrumb" className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm font-bold text-platform-900">
            <Link className="shrink-0 hover:text-platform-700" href="/platform/dashboard">Command Center</Link>
            {breadcrumbs.map((item, index) => (
              <span key={`${item}-${index}`} className="flex min-w-0 items-center gap-1.5">
                <span className="text-slate-300">/</span>
                <span className="truncate">{item}</span>
              </span>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-2 rounded-xl border border-platform-50 bg-platform-50 px-3 py-2 md:flex">
            <Building2 className="size-4 text-platform-500" aria-hidden="true" />
            <div className="max-w-56 leading-tight">
              <p className="truncate text-xs font-black text-platform-900">HOAHub SaaS Control Plane</p>
              <p className="truncate text-[10px] font-semibold text-slate-500">{roleLabel}</p>
            </div>
          </div>
          <Link aria-label={`Open platform profile for ${userName}`} className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-platform-700 transition hover:border-platform-50 hover:bg-platform-50" href="/platform/profile">
            <UserRound className="size-4.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
