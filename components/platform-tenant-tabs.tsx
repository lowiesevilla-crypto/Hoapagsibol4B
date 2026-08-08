import Link from "next/link";

export function PlatformTenantTabs({ tenantId, active }: { tenantId: string; active: string }) {
  const tabs = [
    { key: "overview", label: "Overview", href: `/platform/tenants/${tenantId}` },
    { key: "billing", label: "Subscription & Billing", href: `/platform/tenants/${tenantId}/billing` },
    { key: "users", label: "Users", href: `/platform/tenants/${tenantId}/users` },
    { key: "settings", label: "Settings", href: `/platform/tenants/${tenantId}#settings` },
    { key: "modules", label: "Module Access", href: `/platform/tenants/${tenantId}#modules` },
    { key: "advisory", label: "Advisory", href: `/platform/tenants/${tenantId}#advisory` },
    { key: "audit", label: "Audit Log", href: `/platform/tenants/${tenantId}/audit` },
  ];
  return <nav className="mt-6 flex max-w-full gap-2 overflow-x-auto rounded-2xl border bg-white p-2" aria-label="Tenant sections">{tabs.map((tab) => <Link key={tab.key} href={tab.href} className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold ${active === tab.key ? "bg-pine-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{tab.label}</Link>)}</nav>;
}
