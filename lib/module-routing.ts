import { TenantModule } from "@prisma/client";
import type { LinkItem } from "@/components/sidebar-links";

const rules: Array<[string, TenantModule]> = [
  ["/admin/document", TenantModule.DOCUMENTS], ["/portal/documents", TenantModule.DOCUMENTS], ["/documents", TenantModule.DOCUMENTS],
  ["/admin/payroll", TenantModule.PAYROLL], ["/admin/employees", TenantModule.PAYROLL], ["/employee/payslips", TenantModule.PAYROLL],
  ["/admin/attendance", TenantModule.ATTENDANCE], ["/employee/attendance", TenantModule.ATTENDANCE],
  ["/admin/reports", TenantModule.REPORTS],
  ["/admin/chat", TenantModule.CHAT], ["/portal/chat", TenantModule.CHAT], ["/employee/chat", TenantModule.CHAT], ["/api/chat", TenantModule.CHAT],
  ["/admin/complaints", TenantModule.COMPLAINTS], ["/portal/complaints", TenantModule.COMPLAINTS], ["/complaints", TenantModule.COMPLAINTS], ["/api/complaints", TenantModule.COMPLAINTS],
  ["/admin/announcements", TenantModule.ANNOUNCEMENTS], ["/portal/announcements", TenantModule.ANNOUNCEMENTS],
  ["/admin/events", TenantModule.EVENTS], ["/portal/events", TenantModule.EVENTS],
  ["/admin/vehicles", TenantModule.VEHICLES], ["/portal/vehicles", TenantModule.VEHICLES],
  ["/admin/contractors", TenantModule.CONTRACTORS],
  ["/admin/billing", TenantModule.BILLING], ["/admin/payments", TenantModule.BILLING], ["/admin/receipts", TenantModule.BILLING], ["/admin/collections", TenantModule.BILLING], ["/admin/expenses", TenantModule.BILLING], ["/admin/data", TenantModule.BILLING],
  ["/portal/billing", TenantModule.BILLING], ["/portal/pay", TenantModule.BILLING], ["/portal/soa", TenantModule.BILLING], ["/portal/payments", TenantModule.BILLING], ["/portal/collections", TenantModule.BILLING], ["/api/payments", TenantModule.BILLING],
];

export function moduleForPath(pathname: string) {
  const path = pathname.split(/[?#]/)[0];
  return rules.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1];
}

export function filterLinksByModules(links: LinkItem[], enabled: ReadonlySet<TenantModule>) {
  return links.filter((link) => {
    const tenantModule = moduleForPath(link.href);
    return !tenantModule || enabled.has(tenantModule);
  });
}
