import { Suspense } from "react";
import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PortalBottomNavigation, PortalMobileHeader } from "@/components/portal-mobile-shell";
import { PwaInstallProvider } from "@/components/pwa-install-provider";
import { Sidebar } from "@/components/sidebar";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { requireUser } from "@/lib/auth";
import { resolveDocumentManagementEntitlement } from "@/lib/document-repository/entitlement";
import { homeownerRouteTitle, resolveHomeownerNavigation } from "@/lib/homeowner-navigation";
import { moduleForPath } from "@/lib/module-routing";
import { tenantMetadata, tenantNameForMetadata } from "@/lib/metadata-title";
import { getUnreadChatCount } from "@/lib/services/chat";
import { getAssociationSettings } from "@/lib/system-settings";
import { getEnabledTenantModules } from "@/lib/tenant";

export async function generateMetadata(): Promise<Metadata> {
  const user = await requireUser(Role.HOMEOWNER);
  const pathname = (await headers()).get("x-hoa-pathname") || "/portal/dashboard";
  const association = await getAssociationSettings(user.tenantId);
  const tenantName = await tenantNameForMetadata(user.tenantId, association.name);
  const title = pathname.startsWith("/portal/document-library") ? "Document Library" : homeownerRouteTitle(pathname);
  return tenantMetadata(title, tenantName);
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(Role.HOMEOWNER);
  const [enabledModules, documentManagementEntitlement] = await Promise.all([
    getEnabledTenantModules(user.tenantId),
    resolveDocumentManagementEntitlement(user.tenantId),
  ]);
  const pathname = (await headers()).get("x-hoa-pathname") || "/portal/dashboard";
  const requestedModule = moduleForPath(pathname);
  if (requestedModule && !enabledModules.has(requestedModule)) redirect("/portal/dashboard?error=This%20module%20is%20not%20included%20in%20your%20subscription%20plan.");
  if (pathname.startsWith("/portal/document-library") && !documentManagementEntitlement.enabled) {
    redirect("/portal/dashboard?error=Document%20Management%20is%20not%20included%20in%20your%20subscription%20plan.");
  }

  const [association, initialChatUnreadCount] = await Promise.all([
    getAssociationSettings(user.tenantId),
    getUnreadChatCount(user.id),
  ]);
  const navigation = resolveHomeownerNavigation(enabledModules);
  const links = documentManagementEntitlement.enabled
    ? [
        ...navigation.sidebarLinks,
        {
          href: "/portal/document-library",
          label: "Document Library",
          icon: "documents" as const,
          section: "Resident Services",
          description: "Official documents published by your association",
        },
      ]
    : navigation.sidebarLinks;
  const title = pathname.startsWith("/portal/document-library") ? "Document Library" : homeownerRouteTitle(pathname);

  return (
    <PwaInstallProvider>
      <div className="min-h-screen">
        <Sidebar user={user} links={links} roleLabel="Homeowner" association={association} initialChatUnreadCount={initialChatUnreadCount} desktopOnly />
        <PortalMobileHeader association={association} user={user} unreadCount={initialChatUnreadCount} showChat={navigation.hasChat} title={title} isDashboard={pathname === "/portal/dashboard"} />
        <Suspense><TransactionFeedback /></Suspense>
        <main className="mx-auto min-w-0 max-w-[1800px] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-7 lg:ml-72 lg:px-10 lg:py-9">{children}</main>
        <PortalBottomNavigation destinations={navigation.primaryDestinations} pathname={pathname} />
      </div>
    </PwaInstallProvider>
  );
}
