import { Suspense } from "react";
import { Role } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { employeeLinks } from "@/components/sidebar-links";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { requireUser } from "@/lib/auth";
import { filterLinksByModules, moduleForPath } from "@/lib/module-routing";
import { getUnreadChatCount } from "@/lib/services/chat";
import { getAssociationSettings } from "@/lib/system-settings";
import { getEnabledTenantModules } from "@/lib/tenant";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(Role.EMPLOYEE);
  const enabledModules = await getEnabledTenantModules(user.tenantId);
  const requestedModule = moduleForPath((await headers()).get("x-hoa-pathname") || "/employee/attendance");
  if (requestedModule && !enabledModules.has(requestedModule)) redirect(`/${user.tenant.slug}/login?error=This%20module%20is%20not%20included%20in%20your%20subscription%20plan.`);
  const [association, initialChatUnreadCount] = await Promise.all([getAssociationSettings(user.tenantId), getUnreadChatCount(user.id)]);
  return <div className="min-h-screen"><Sidebar user={user} links={filterLinksByModules(employeeLinks, enabledModules)} roleLabel="Employee" association={association} initialChatUnreadCount={initialChatUnreadCount} /><Suspense><TransactionFeedback /></Suspense><main className="mx-auto min-w-0 max-w-[1800px] px-4 py-6 sm:px-7 lg:ml-72 lg:px-10 lg:py-9">{children}</main></div>;
}
