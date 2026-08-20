"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Scope = "admin" | "platform";

export type CommandDestination = {
  label: string;
  href: string;
  keywords?: string;
  section?: string;
};

const ADMIN_DESTINATIONS: CommandDestination[] = [
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

const PLATFORM_DESTINATIONS: CommandDestination[] = [
  { label: "Command Center", href: "/platform/dashboard", keywords: "dashboard portfolio" },
  { label: "Tenants", href: "/platform/tenants", keywords: "customers hoa associations" },
  { label: "Subscriptions", href: "/platform/subscriptions", keywords: "commercial billing plans" },
  { label: "Plans & Features", href: "/platform/plans", keywords: "modules entitlements packaging" },
  { label: "Invoices", href: "/platform/invoices", keywords: "receivables ar billing" },
  { label: "AI Usage", href: "/platform/ai-usage", keywords: "tokens cost latency" },
  { label: "Audit & Security", href: "/platform/audit", keywords: "governance evidence logs" },
];

function uniqueDestinations(items: CommandDestination[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });
}

export function ShellCommandSearch({ scope, destinations }: { scope: Scope; destinations?: CommandDestination[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const options = useMemo(
    () => uniqueDestinations(destinations?.length ? destinations : scope === "platform" ? PLATFORM_DESTINATIONS : ADMIN_DESTINATIONS),
    [destinations, scope],
  );
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options.slice(0, 8);
    return options.filter((item) => `${item.label} ${item.section || ""} ${item.keywords || ""} ${item.href}`.toLowerCase().includes(normalized)).slice(0, 10);
  }, [options, query]);

  useEffect(() => {
    function focusCommandSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", focusCommandSearch);
    return () => window.removeEventListener("keydown", focusCommandSearch);
  }, []);

  function navigateActive() {
    const destination = matches[activeIndex];
    if (!destination) return;
    setOpen(false);
    setQuery("");
    router.push(destination.href);
  }

  return (
    <div className="relative hidden w-[320px] xl:block 2xl:w-[390px]">
      <label className="flex h-11 items-center gap-2 rounded-[14px] border border-[#dbe7ee] bg-[#f9fcfd] px-3.5 text-[#8b9aac] transition focus-within:border-[#9dd7ef] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#0b95d8]/10">
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <input
          ref={inputRef}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${scope}-command-results`}
          aria-activedescendant={open && matches[activeIndex] ? `${scope}-command-${activeIndex}` : undefined}
          aria-label={scope === "platform" ? "Search platform navigation" : "Search HOAHub navigation"}
          className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-[#294c5d] outline-none placeholder:text-[#8b9aac]"
          placeholder={scope === "platform" ? "Search tenants, subscriptions, invoices…" : "Search residents, payments, documents…"}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 140)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => matches.length ? (index + 1) % matches.length : 0);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => matches.length ? (index - 1 + matches.length) % matches.length : 0);
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              navigateActive();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
        />
        <kbd className="hidden rounded-md border border-[#dbe7ee] bg-white px-1.5 py-0.5 text-[9px] font-black text-[#8b9aac] 2xl:inline">⌘K</kbd>
      </label>
      {open ? (
        <div id={`${scope}-command-results`} role="listbox" className="absolute left-0 right-0 top-[50px] z-50 max-h-[420px] overflow-y-auto rounded-2xl border border-[#dbe7ee] bg-white p-2 shadow-[0_20px_50px_rgba(10,45,66,.16)]">
          <p className="px-2 pb-1 pt-1 text-[10px] font-black uppercase tracking-[.14em] text-[#8b9aac]">Navigate HOAHub</p>
          {matches.map((item, index) => (
            <Link
              id={`${scope}-command-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              key={item.href}
              href={item.href}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => { setOpen(false); setQuery(""); }}
              className={`block rounded-xl px-3 py-2.5 text-sm font-extrabold transition ${index === activeIndex ? "bg-[#eef8fb] text-[#0872ae]" : "text-[#153c50] hover:bg-[#eef8fb] hover:text-[#0872ae]"}`}
            >
              <span className="block truncate">{item.label}</span>
              {item.section ? <span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-wide text-[#8b9aac]">{item.section}</span> : null}
            </Link>
          ))}
          {!matches.length ? <p className="px-3 py-4 text-center text-xs text-[#8b9aac]">No matching destination.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
