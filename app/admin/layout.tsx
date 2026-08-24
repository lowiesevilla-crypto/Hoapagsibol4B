import { Suspense } from "react";
import type { Metadata } from "next";
import { Role, TenantModule } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminTopbar } from "@/components/admin-topbar";
import { Sidebar } from "@/components/sidebar";
import { adminLinks, adminShellLinks, platformLinks, systemAdminLinks, systemAdminShellLinks, type LinkItem } from "@/components/sidebar-links";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { resolveAiAssistanceEntitlement } from "@/lib/ai-assistance/entitlement";
import { requireUser } from "@/lib/auth";
import { Permission } from "@/lib/authorization/permissions";
import { resolveDocumentManagementEntitlement } from "@/lib/document-repository/entitlement";
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
  if (!canAccessAdminPath(user.roles, pathname)) redirect(`${adminHomeForRole(user.roles)}?error=You%20do%20not%20have%20access%20to%20this%20module.`);

  const platform = user.roles.includes(Role.SUPER_ADMIN) || user.roles.includes(Role.PLATFORM_ADMIN);
  const enabledModules = platform ? new Set(Object.values(TenantModule)) : await getEnabledTenantModules(user.tenantId);
  const requestedModule = moduleForPath(pathname);
  if (requestedModule && !enabledModules.has(requestedModule)) redirect("/admin/dashboard?error=This%20module%20is%20not%20included%20in%20your%20active%20subscription%20plan.");

  const [association, initialChatUnreadCount, actionableDocumentRequests, documentManagementEntitlement, aiAssistanceEntitlement] = await Promise.all([
    getAssociationSettings(user.tenantId),
    getUnreadChatCount(user.id),
    getActionableDocumentRequestCount(user.tenantId),
    resolveDocumentManagementEntitlement(user.tenantId),
    resolveAiAssistanceEntitlement(user.tenantId),
  ]);

  if (pathname.startsWith("/admin/document-management") && !documentManagementEntitlement.enabled) redirect("/admin/dashboard?error=Document%20Management%20is%20not%20included%20in%20your%20active%20subscription%20plan.");

  const canManageAi = user.permissions.includes(Permission.AI_ASSISTANCE_MANAGE);
  if (pathname.startsWith("/admin/ai-assistance")) {
    if (!aiAssistanceEntitlement.enabled) redirect("/admin/dashboard?error=AI%20Assistance%20is%20not%20included%20in%20your%20active%20subscription%20plan.");
    if (!canManageAi) redirect("/admin/dashboard?error=You%20do%20not%20have%20permission%20to%20manage%20AI%20Assistance.");
  }

  const canUseAi = user.permissions.includes(Permission.AI_ASSISTANCE_USE);
  if (pathname.startsWith("/admin/ai-copilot")) {
    if (!aiAssistanceEntitlement.enabled) redirect("/admin/dashboard?error=AI%20Assistance%20is%20not%20included%20in%20your%20active%20subscription%20plan.");
    if (!canUseAi) redirect("/admin/dashboard?error=You%20do%20not%20have%20permission%20to%20use%20AI%20Assistance.");
  }

  const isSystemAdmin = user.roles.includes(Role.SYSTEM_ADMIN) || user.roles.includes(Role.SUPER_ADMIN);
  const roleLabel = isSystemAdmin ? "System Administrator" : "Administrator";
  const canAccessPayroll = user.permissions.includes(Permission.PAYROLL_MANAGE) || await userCanAccessPayroll(user.id, user.role);

  function authorizedAdminLinks(items: LinkItem[]) {
    return filterAdminLinksByRole(filterLinksByModules(items, enabledModules), user.roles)
      .filter((item) => documentManagementEntitlement.enabled || !item.href.startsWith("/admin/document-management"))
      .filter((item) => (aiAssistanceEntitlement.enabled && canManageAi) || !item.href.startsWith("/admin/ai-assistance"))
      .filter((item) => (aiAssistanceEntitlement.enabled && canUseAi) || !item.href.startsWith("/admin/ai-copilot"))
      .filter((item) => canAccessPayroll || !["/admin/employees", "/admin/attendance", "/admin/payroll"].includes(item.href));
  }

  const baseLinks = isSystemAdmin ? systemAdminShellLinks : adminShellLinks;
  const linksWithPlatform = user.roles.includes(Role.SUPER_ADMIN) ? [...baseLinks, ...platformLinks] : baseLinks;
  const links = authorizedAdminLinks(linksWithPlatform);

  // Command search receives the full authorized route catalog, not merely the
  // intentionally compact sidebar. This keeps hidden/inaccessible modules out of
  // search while making every permitted Admin workspace discoverable by keyboard.
  const commandBaseLinks = isSystemAdmin ? systemAdminLinks : adminLinks;
  const commandLinksWithPlatform = user.roles.includes(Role.SUPER_ADMIN) ? [...commandBaseLinks, ...platformLinks] : commandBaseLinks;
  const searchLinks = authorizedAdminLinks(commandLinksWithPlatform).map((item) => ({
    label: item.label,
    href: item.href,
    section: item.section,
    keywords: `${item.section} ${item.label} ${item.href.replaceAll("/", " ").replaceAll("-", " ")}`,
  }));

  const requestBadgeHref = "/admin/documents";
  const showDocumentRequestBadge = links.some((item) => item.href === requestBadgeHref);
  const linkBadges: Record<string, number> = showDocumentRequestBadge ? { [requestBadgeHref]: actionableDocumentRequests } : {};
  const sectionBadges: Record<string, number> = showDocumentRequestBadge ? { "Resident Services": actionableDocumentRequests } : {};

  return <div className="canva-tenant-shell min-h-screen print:bg-white">
    <div className="print:hidden">
      <Sidebar
        user={user}
        links={links}
        roleLabel={roleLabel}
        association={association}
        initialChatUnreadCount={initialChatUnreadCount}
        linkBadges={linkBadges}
        sectionBadges={sectionBadges}
      />
    </div>
    <Suspense><TransactionFeedback /></Suspense>
    <div className="min-w-0 lg:ml-[300px] print:ml-0">
      <div className="print:hidden">
        <AdminTopbar associationName={association.name} roleLabel={roleLabel} userName={user.name} searchLinks={searchLinks} />
      </div>
      <main className="premium-admin-workspace mx-auto min-w-0 max-w-[1680px] px-4 py-6 sm:px-7 lg:px-9 lg:py-8 print:max-w-none print:p-0">
        {children}
      </main>
    </div>
  </div>;
}
