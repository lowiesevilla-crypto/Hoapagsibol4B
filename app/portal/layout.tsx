import { Suspense } from "react";
import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PortalBottomNavigation, PortalMobileHeader } from "@/components/portal-mobile-shell";
import { PwaInstallProvider } from "@/components/pwa-install-provider";
import { Sidebar } from "@/components/sidebar";
import { portalLinks } from "@/components/sidebar-links";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { requireUser } from "@/lib/auth";
import { filterLinksByModules, moduleForPath } from "@/lib/module-routing";
import { routeTitle, tenantMetadata, tenantNameForMetadata } from "@/lib/metadata-title";
import { getUnreadChatCount } from "@/lib/services/chat";
import { getAssociationSettings } from "@/lib/system-settings";
import { getEnabledTenantModules } from "@/lib/tenant";

export async function generateMetadata(): Promise<Metadata> {
  const user = await requireUser(Role.HOMEOWNER);
  const pathname = (await headers()).get("x-hoa-pathname") || "/portal/dashboard";
  const association = await getAssociationSettings(user.tenantId);
  const tenantName = await tenantNameForMetadata(user.tenantId, association.name);
  return tenantMetadata(routeTitle(pathname, portalLinks, "Dashboard"), tenantName);
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(Role.HOMEOWNER);
  const enabledModules = await getEnabledTenantModules(user.tenantId);
  const pathname = (await headers()).get("x-hoa-pathname") || "/portal/dashboard";
  const requestedModule = moduleForPath(pathname);
  if (requestedModule && !enabledModules.has(requestedModule)) redirect("/portal/dashboard?error=This%20module%20is%20not%20included%20in%20your%20subscription%20plan.");
  const [association, initialChatUnreadCount] = await Promise.all([getAssociationSettings(user.tenantId), getUnreadChatCount(user.id)]);
  const links = filterLinksByModules(portalLinks, enabledModules);
  return (
    <PwaInstallProvider>
      <div className="min-h-screen">
        <Sidebar user={user} links={links} roleLabel="Homeowner" association={association} initialChatUnreadCount={initialChatUnreadCount} desktopOnly />
        <PortalMobileHeader association={association} user={user} unreadCount={initialChatUnreadCount} showChat={links.some((link) => link.href === "/portal/chat")} />
        <Suspense><TransactionFeedback /></Suspense>
        <main className="mx-auto min-w-0 max-w-[1800px] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-7 lg:ml-72 lg:px-10 lg:py-9">{children}</main>
        <PortalBottomNavigation links={links} pathname={pathname} />
      </div>
    </PwaInstallProvider>
  );
}
