"use client";

import Link from "next/link";
import { ChevronDown, Plus, ShieldCheck, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { ShellCommandSearch } from "@/components/shell-command-search";

const LABELS: Record<string, string> = {
  platform: "Platform",
  dashboard: "Command Center",
  tenants: "Tenants",
  subscriptions: "Subscriptions",
  plans: "Plans & Features",
  invoices: "Invoices",
  agreements: "Agreements",
  licenses: "Licenses",
  "document-management": "Document Usage",
  "ai-usage": "AI Usage",
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
  const breadcrumbs = segments.length ? segments.map(labelFor) : ["Command Center"];

  return (
    <header className="platform-command-topbar sticky top-[72px] z-30 border-b border-white/10 bg-[#071f31]/95 text-white backdrop-blur-xl lg:top-0">
      <div className="mx-auto flex min-h-[84px] max-w-[1800px] items-center justify-between gap-4 px-4 sm:px-7 lg:px-10">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-[#8ebed4]">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            <span>HOAHub SaaS Control Plane</span>
          </div>
          <nav aria-label="Platform breadcrumb" className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] font-extrabold text-white">
            <Link className="shrink-0 hover:text-[#27b6ff]" href="/platform/dashboard">HOAHub Platform</Link>
            {breadcrumbs.map((item, index) => (
              <span key={`${item}-${index}`} className="flex min-w-0 items-center gap-1.5">
                <span className="text-white/30">/</span>
                <span className="truncate">{item}</span>
              </span>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <div className="platform-search-wrap hidden xl:block"><ShellCommandSearch scope="platform" /></div>
          <Link className="hidden h-11 items-center gap-2 rounded-[13px] bg-[#0b95d8] px-4 text-[13px] font-black text-white shadow-[0_10px_24px_rgba(11,149,216,.2)] hover:bg-[#27b6ff] lg:flex" href="/platform/tenants/new">
            <Plus className="size-4" aria-hidden="true" /> Onboard HOA
          </Link>
          <div className="hidden h-11 items-center gap-2 rounded-[13px] border border-white/10 bg-white/5 px-3 text-xs font-black text-[#d8edf4] md:flex">
            Platform Mode <ChevronDown className="size-3.5" aria-hidden="true" />
          </div>
          <Link aria-label={`Open platform profile for ${userName}`} title={roleLabel} className="grid size-10 place-items-center rounded-[13px] border border-white/10 bg-white/5 text-[#d8edf4] transition hover:bg-white/10" href="/platform/profile">
            <UserRound className="size-4.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
