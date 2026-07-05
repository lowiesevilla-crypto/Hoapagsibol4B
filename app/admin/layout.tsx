import { Suspense } from "react";
import { Role, TenantModule } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { adminLinks, systemAdminLinks } from "@/components/sidebar-links";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { requireUser } from "@/lib/auth";
import { filterLinksByModules, moduleForPath } from "@/lib/module-routing";
import { userCanAccessPayroll } from "@/lib/payroll-access";
import { canAccessAdminPath, filterAdminLinksByRole } from "@/lib/role-access";
import { getUnreadChatCount } from "@/lib/services/chat";
import { getAssociationSettings } from "@/lib/system-settings";
import { getEnabledTenantModules } from "@/lib/tenant";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(Role.ADMIN);
  const pathname = (await headers()).get("x-hoa-pathname") || "/admin/dashboard";
  if (!canAccessAdminPath(user.role, pathname)) redirect("/admin/dashboard?error=You%20do%20not%20have%20access%20to%20this%20module.");
  const enabledModules = user.role === Role.SUPER_ADMIN || user.role === Role.PLATFORM_ADMIN
    ? new Set(Object.values(TenantModule))
    : await getEnabledTenantModules(user.tenantId);
  const requestedModule = moduleForPath(pathname);
  if (requestedModule && !enabledModules.has(requestedModule)) redirect("/admin/dashboard?error=This%20module%20is%20not%20included%20in%20your%20subscription%20plan.");
  const [association, initialChatUnreadCount] = await Promise.all([getAssociationSettings(user.tenantId), getUnreadChatCount(user.id)]);
  const isSystemAdmin = user.role === Role.SYSTEM_ADMIN || user.role === Role.SUPER_ADMIN || user.role === Role.PLATFORM_ADMIN;
  const canAccessPayroll = await userCanAccessPayroll(user.id, user.role);
  const links = filterAdminLinksByRole(filterLinksByModules(isSystemAdmin ? systemAdminLinks : adminLinks, enabledModules), user.role)
    .filter((item) => canAccessPayroll || !["/admin/employees", "/admin/attendance", "/admin/payroll"].includes(item.href));
  return <div className="min-h-screen"><Sidebar user={user} links={links} roleLabel={isSystemAdmin ? "System Administrator" : "Administrator"} association={association} initialChatUnreadCount={initialChatUnreadCount} /><Suspense><TransactionFeedback /></Suspense><main className="mx-auto min-w-0 max-w-[1800px] px-4 py-6 sm:px-7 lg:ml-72 lg:px-10 lg:py-9">{children}</main></div>;
}
