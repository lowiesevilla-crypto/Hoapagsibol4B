import { TenantModule } from "@prisma/client";
import type { LinkItem } from "@/components/sidebar-links";
import { homeownerModuleRules, moduleForHomeownerLink } from "@/lib/homeowner-navigation";

const rules: Array<[string, TenantModule]> = [
  ["/admin/documents", TenantModule.DOCUMENTS], ["/admin/document-templates", TenantModule.DOCUMENTS], ["/documents", TenantModule.DOCUMENTS],
  ["/admin/payroll", TenantModule.PAYROLL], ["/admin/employees", TenantModule.PAYROLL], ["/admin/workforce", TenantModule.PAYROLL], ["/employee/payslips", TenantModule.PAYROLL], ["/employee/requests/overtime", TenantModule.PAYROLL],
  ["/admin/attendance", TenantModule.ATTENDANCE], ["/employee/attendance", TenantModule.ATTENDANCE],
  ["/employee/loans", TenantModule.LOANS],
  ["/admin/reports", TenantModule.REPORTS],
  ["/admin/chat", TenantModule.CHAT], ["/employee/chat", TenantModule.CHAT], ["/api/chat", TenantModule.CHAT],
  ["/admin/complaints", TenantModule.COMPLAINTS], ["/complaints", TenantModule.COMPLAINTS], ["/api/complaints", TenantModule.COMPLAINTS],
  ["/admin/announcements", TenantModule.ANNOUNCEMENTS],
  ["/admin/events", TenantModule.EVENTS],
  ["/admin/vehicles", TenantModule.VEHICLES],
  ["/admin/contractors", TenantModule.CONTRACTORS],
  // Finance surfaces, including Rental Management and Petty Cash, are governed
  // by the plan's BILLING module. Petty Cash then adds its own independent
  // sellable feature entitlement on top of this finance dependency.
  ["/admin/settings/billing-rules", TenantModule.BILLING], ["/admin/settings/billing-exemptions", TenantModule.BILLING], ["/admin/settings/payments", TenantModule.BILLING],
  ["/admin/billing", TenantModule.BILLING], ["/admin/payments", TenantModule.BILLING], ["/admin/receipts", TenantModule.BILLING], ["/admin/collections", TenantModule.BILLING], ["/admin/rentals", TenantModule.BILLING], ["/admin/expenses", TenantModule.BILLING], ["/admin/petty-cash", TenantModule.BILLING], ["/admin/data", TenantModule.BILLING],
  ["/api/payments", TenantModule.BILLING],
  ...homeownerModuleRules,
];

export function moduleForPath(pathname: string) {
  const path = pathname.split(/[?#]/)[0];
  return rules.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1];
}

export function filterLinksByModules(links: LinkItem[], enabled: ReadonlySet<TenantModule>) {
  return links.filter((link) => {
    const tenantModule = moduleForHomeownerLink(link.href) ?? moduleForPath(link.href);
    return !tenantModule || enabled.has(tenantModule);
  });
}
