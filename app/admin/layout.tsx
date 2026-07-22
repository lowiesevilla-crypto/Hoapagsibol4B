import { Suspense } from "react";
import type { Metadata } from "next";
import { Role, TenantModule } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { adminLinks, platformLinks, systemAdminLinks } from "@/components/sidebar-links";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { requireUser } from "@/lib/auth";
import { filterLinksByModules, moduleForPath } from "@/lib/module-routing";
import { routeTitle, tenantMetadata, tenantNameForMetadata } from "@/lib/metadata-title";
import { userCanAccessPayroll } from "@/lib/payroll-access";
import { adminHomeForRole, canAccessAdminPath, filterAdminLinksByRole } from "@/lib/role-access";
import { getUnreadChatCount } from "@/lib/services/chat";
import { getAssociationSettings } from "@/lib/system-settings";
import { getEnabledTenantModules } from "@/lib/tenant";
import { getActionableDocumentRequestCount } from "@/lib/services/document-request-action-count";

export async function generateMetadata(): Promise<Metadata> {
  const user = await requireUser(Role.ADMIN);
  const pathname = (await headers()).get("x-hoa-pathname") || "/admin/dashboard";
  const association = await getAssociationSettings(user.tenantId);
  const tenantName = await tenantNameForMetadata(user.tenantId, association.name);
  return tenantMetadata(routeTitle(pathname, [...systemAdminLinks, ...adminLinks, ...platformLinks], "Dashboard"), tenantName);
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(Role.ADMIN);
  const pathname = (await headers()).get("x-hoa-pathname") || "/admin/dashboard";
  if (!canAccessAdminPath(user.role, pathname)) redirect(`${adminHomeForRole(user.role)}?error=You%20do%20not%20have%20access%20to%20this%20module.`);
  const enabledModules = user.role === Role.SUPER_ADMIN || user.role === Role.PLATFORM_ADMIN
    ? new Set(Object.values(TenantModule))
    : await getEnabledTenantModules(user.tenantId);
  const requestedModule = moduleForPath(pathname);
  if (requestedModule && !enabledModules.has(requestedModule)) redirect("/admin/dashboard?error=This%20module%20is%20not%20included%20in%20your%20subscription%20plan.");
  const [association, initialChatUnreadCount, actionableDocumentRequests] = await Promise.all([
    getAssociationSettings(user.tenantId),
    getUnreadChatCount(user.id),
    getActionableDocumentRequestCount(user.tenantId),
  ]);
  const isSystemAdmin = user.role === Role.SYSTEM_ADMIN || user.role === Role.SUPER_ADMIN;
  const canAccessPayroll = await userCanAccessPayroll(user.id, user.role);
  const baseLinks = isSystemAdmin ? systemAdminLinks : adminLinks;
  const linksWithPlatform = user.role === Role.SUPER_ADMIN ? [...baseLinks, ...platformLinks] : baseLinks;
  const links = filterAdminLinksByRole(filterLinksByModules(linksWithPlatform, enabledModules), user.role)
    .filter((item) => canAccessPayroll || !["/admin/employees", "/admin/attendance", "/admin/payroll"].includes(item.href));
  const requestBadgeHref = "/admin/documents?section=requests";
  const showDocumentRequestBadge = links.some((item) => item.href === requestBadgeHref);
  const linkBadges: Record<string, number> = showDocumentRequestBadge ? { [requestBadgeHref]: actionableDocumentRequests } : {};
  const sectionBadges: Record<string, number> = showDocumentRequestBadge ? { "Resident Services": actionableDocumentRequests } : {};
  return <div className="min-h-screen"><Sidebar user={user} links={links} roleLabel={isSystemAdmin ? "System Administrator" : "Administrator"} association={association} initialChatUnreadCount={initialChatUnreadCount} linkBadges={linkBadges} sectionBadges={sectionBadges} /><Suspense><TransactionFeedback /></Suspense><main className="mx-auto min-w-0 max-w-[1800px] px-4 py-6 sm:px-7 lg:ml-72 lg:px-10 lg:py-9">{children}</main></div>;
}
