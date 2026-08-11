"use client";

import Link from "next/link";
import { Building2, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";

const LABELS: Record<string, string> = {
  admin: "Admin",
  dashboard: "Dashboard",
  homeowners: "Homeowners",
  contractors: "Contractors",
  vehicles: "Vehicles",
  billing: "Billing",
  payments: "Payments",
  collections: "Collections",
  expenses: "Expenses",
  documents: "Documents",
  "document-management": "Document Management",
  complaints: "Complaints",
  announcements: "Announcements",
  events: "Events",
  chat: "Chat",
  employees: "Employees",
  attendance: "Attendance",
  payroll: "Payroll",
  reports: "Reports",
  data: "Data & Imports",
  settings: "Settings",
  profile: "My Profile",
  subscription: "Subscription",
  agreement: "Agreement",
  onboarding: "Onboarding",
  "ai-copilot": "AI Staff Copilot",
  "ai-assistance": "AI Assistance",
};

function labelFor(segment: string) {
  return LABELS[segment] ?? segment.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AdminTopbar({ associationName, roleLabel, userName }: { associationName: string; roleLabel: string; userName: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean).slice(1);
  const breadcrumbs = segments.length ? segments.map(labelFor) : ["Dashboard"];

  return <header className="sticky top-[72px] z-30 border-b border-slate-200/80 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur lg:top-0">
    <div className="mx-auto flex min-h-16 max-w-[1680px] items-center justify-between gap-4 px-4 sm:px-7 lg:px-8">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-extrabold uppercase tracking-[.18em] text-slate-400">HOAHub administration</p>
        <nav aria-label="Breadcrumb" className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm font-bold text-pine-900">
          <Link className="shrink-0 hover:text-pine-700" href="/admin/dashboard">Overview</Link>
          {breadcrumbs.map((item, index) => <span key={`${item}-${index}`} className="flex min-w-0 items-center gap-1.5"><span className="text-slate-300">/</span><span className="truncate">{item}</span></span>)}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 md:flex" title={`Active tenant: ${associationName}`}>
          <Building2 className="size-4 text-leaf-600" />
          <div className="max-w-56 leading-tight">
            <p className="truncate text-xs font-black text-pine-900">{associationName}</p>
            <p className="truncate text-[10px] font-semibold text-slate-500">{roleLabel} · Active tenant</p>
          </div>
        </div>
        <Link aria-label={`Open profile for ${userName}`} className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-pine-800 transition hover:border-pine-200 hover:bg-pine-50" href="/admin/profile">
          <UserRound className="size-4.5" />
        </Link>
      </div>
    </div>
  </header>;
}
