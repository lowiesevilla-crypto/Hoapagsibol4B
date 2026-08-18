"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

type Scope = "admin" | "platform";

type Destination = { label: string; href: string; keywords: string };

const ADMIN_DESTINATIONS: Destination[] = [
  { label: "Dashboard", href: "/admin/dashboard", keywords: "overview home" },
  { label: "Action Center", href: "/admin/actions", keywords: "tasks approvals exceptions" },
  { label: "Homeowners", href: "/admin/homeowners", keywords: "residents accounts" },
  { label: "Billing", href: "/admin/billing", keywords: "dues balances receivables" },
  { label: "Payments", href: "/admin/payments/active", keywords: "receipts transactions collections" },
  { label: "Documents", href: "/admin/documents", keywords: "requests certificates gate pass move" },
  { label: "Complaints", href: "/admin/complaints", keywords: "cases grievance resident" },
  { label: "Workforce", href: "/admin/workforce", keywords: "employees attendance payroll hris" },
  { label: "Reports", href: "/admin/reports", keywords: "insights analytics" },
  { label: "HOAHub AI", href: "/admin/ai-copilot", keywords: "assistant intelligence copilot" },
];

const PLATFORM_DESTINATIONS: Destination[] = [
  { label: "Command Center", href: "/platform/dashboard", keywords: "dashboard portfolio" },
  { label: "Tenants", href: "/platform/tenants", keywords: "customers hoa associations" },
  { label: "Subscriptions", href: "/platform/subscriptions", keywords: "commercial billing plans" },
  { label: "Plans & Features", href: "/platform/plans", keywords: "modules entitlements packaging" },
  { label: "Invoices", href: "/platform/invoices", keywords: "receivables ar billing" },
  { label: "AI Usage", href: "/platform/ai-usage", keywords: "tokens cost latency" },
  { label: "Audit & Security", href: "/platform/audit", keywords: "governance evidence logs" },
];

export function ShellCommandSearch({ scope }: { scope: Scope }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const options = scope === "platform" ? PLATFORM_DESTINATIONS : ADMIN_DESTINATIONS;
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options.slice(0, 6);
    return options.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(normalized)).slice(0, 7);
  }, [options, query]);

  return (
    <div className="relative hidden w-[320px] xl:block 2xl:w-[390px]">
      <label className="flex h-11 items-center gap-2 rounded-[14px] border border-[#dbe7ee] bg-[#f9fcfd] px-3.5 text-[#8b9aac] transition focus-within:border-[#9dd7ef] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#0b95d8]/10">
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <input
          aria-label={scope === "platform" ? "Search platform navigation" : "Search HOAHub navigation"}
          className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-[#294c5d] outline-none placeholder:text-[#8b9aac]"
          placeholder={scope === "platform" ? "Search tenants, subscriptions, invoices…" : "Search residents, payments, documents…"}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        />
      </label>
      {open ? (
        <div className="absolute left-0 right-0 top-[50px] z-50 overflow-hidden rounded-2xl border border-[#dbe7ee] bg-white p-2 shadow-[0_20px_50px_rgba(10,45,66,.16)]">
          <p className="px-2 pb-1 pt-1 text-[10px] font-black uppercase tracking-[.14em] text-[#8b9aac]">Navigate HOAHub</p>
          {matches.map((item) => (
            <Link key={item.href} href={item.href} className="block rounded-xl px-3 py-2.5 text-sm font-extrabold text-[#153c50] hover:bg-[#eef8fb] hover:text-[#0872ae]">
              {item.label}
            </Link>
          ))}
          {!matches.length ? <p className="px-3 py-4 text-center text-xs text-[#8b9aac]">No matching destination.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
