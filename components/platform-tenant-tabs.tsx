import Link from "next/link";
import { PlatformInvoiceMaintenancePanel } from "@/components/platform-invoice-maintenance-panel";

export function PlatformTenantTabs({ tenantId, active }: { tenantId: string; active: string }) {
  const tabs = [
    { key: "overview", label: "Overview", href: `/platform/tenants/${tenantId}` },
    { key: "billing", label: "Subscription & Billing", href: `/platform/tenants/${tenantId}/billing` },
    { key: "features", label: "Modules & Features", href: `/platform/tenants/${tenantId}/features` },
    { key: "users", label: "Users", href: `/platform/tenants/${tenantId}/users` },
    { key: "settings", label: "Settings", href: `/platform/tenants/${tenantId}#settings` },
    { key: "audit", label: "Activity & Audit", href: `/platform/tenants/${tenantId}/audit` },
  ];
  return <>
    <nav className="mt-6 flex max-w-full gap-2 overflow-x-auto rounded-workspace border border-slate-200 bg-white p-2 shadow-workspace" aria-label="Tenant 360 sections">
      {tabs.map((tab) => <Link key={tab.key} href={tab.href} className={`min-h-10 shrink-0 rounded-xl px-4 py-2.5 text-sm font-black transition ${active === tab.key ? "bg-platform-900 text-white shadow-sm" : "text-slate-600 hover:bg-platform-50 hover:text-platform-700"}`}>{tab.label}</Link>)}
      {active === "billing" && <Link href={`/platform/tenants/${tenantId}/billing#invoice-maintenance`} className="min-h-10 shrink-0 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-blue-800">Invoice Actions</Link>}
    </nav>
    {active === "billing" && <PlatformInvoiceMaintenancePanel tenantId={tenantId} />}
  </>;
}
