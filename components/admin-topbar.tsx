"use client";

import Link from "next/link";
import { Building2, ChevronDown, Plus, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { ShellCommandSearch, type CommandDestination } from "@/components/shell-command-search";

const LABELS: Record<string, string> = {
  admin: "Admin",
  dashboard: "Dashboard",
  actions: "Action Center",
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
  workforce: "Workforce",
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

export function AdminTopbar({ associationName, roleLabel, userName, searchLinks }: { associationName: string; roleLabel: string; userName: string; searchLinks: CommandDestination[] }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean).slice(1);
  const breadcrumbs = segments.length ? segments.map(labelFor) : ["Dashboard"];

  return (
    <header className="tenant-command-topbar sticky top-[72px] z-30 border-b border-[#dbe7ee] bg-white/95 backdrop-blur-xl lg:top-0">
      <div className="mx-auto flex min-h-[84px] max-w-[1680px] items-center justify-between gap-4 px-4 sm:px-7 lg:px-8">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-black uppercase tracking-[.18em] text-[#8b9aac]">HOAHub Administration / Overview</p>
          <nav aria-label="Breadcrumb" className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] font-extrabold text-[#0d4055]">
            <Link className="shrink-0 hover:text-[#0872ae]" href="/admin/dashboard">Overview</Link>
            {breadcrumbs.map((item, index) => <span key={`${item}-${index}`} className="flex min-w-0 items-center gap-1.5"><span className="text-[#c5d3dc]">/</span><span className="truncate">{item}</span></span>)}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <ShellCommandSearch scope="admin" destinations={searchLinks} />
          <details className="relative hidden lg:block">
            <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-[13px] bg-[#0b95d8] px-4 text-[13px] font-black text-white shadow-[0_10px_24px_rgba(11,149,216,.18)] hover:bg-[#087db8]">
              <Plus className="size-4" aria-hidden="true" /> Quick create <ChevronDown className="size-3.5" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 top-[50px] z-50 w-56 rounded-2xl border border-[#dbe7ee] bg-white p-2 shadow-[0_18px_45px_rgba(10,45,66,.16)]">
              <Link className="block rounded-xl px-3 py-2.5 text-sm font-extrabold text-[#153c50] hover:bg-[#eef8fb]" href="/admin/payments/record">Record payment</Link>
              <Link className="block rounded-xl px-3 py-2.5 text-sm font-extrabold text-[#153c50] hover:bg-[#eef8fb]" href="/admin/homeowners/new">Add homeowner</Link>
              <Link className="block rounded-xl px-3 py-2.5 text-sm font-extrabold text-[#153c50] hover:bg-[#eef8fb]" href="/admin/documents/new">Create office request</Link>
            </div>
          </details>
          <div className="hidden items-center gap-2 rounded-[13px] border border-[#dbe7ee] bg-[#f9fcfd] px-3 py-2 md:flex" title={`Active tenant: ${associationName}`}>
            <Building2 className="size-4 text-[#0b95d8]" aria-hidden="true" />
            <div className="max-w-48 leading-tight">
              <p className="truncate text-xs font-black text-[#0d4055]">{associationName}</p>
              <p className="truncate text-[10px] font-semibold text-[#718297]">{roleLabel} · Active tenant</p>
            </div>
          </div>
          <Link aria-label={`Open profile for ${userName}`} className="grid size-10 place-items-center rounded-[13px] border border-[#dbe7ee] bg-white text-[#40677a] transition hover:border-[#b9dce9] hover:bg-[#eef8fb]" href="/admin/profile">
            <UserRound className="size-4.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
