import { Suspense } from "react";
import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
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
  const requestedModule = moduleForPath((await headers()).get("x-hoa-pathname") || "/portal/dashboard");
  if (requestedModule && !enabledModules.has(requestedModule)) redirect("/portal/dashboard?error=This%20module%20is%20not%20included%20in%20your%20subscription%20plan.");
  const [association, initialChatUnreadCount] = await Promise.all([getAssociationSettings(user.tenantId), getUnreadChatCount(user.id)]);
  return <div className="min-h-screen"><Sidebar user={user} links={filterLinksByModules(portalLinks, enabledModules)} roleLabel="Homeowner" association={association} initialChatUnreadCount={initialChatUnreadCount} /><Suspense><TransactionFeedback /></Suspense><main className="mx-auto min-w-0 max-w-[1800px] px-4 py-6 sm:px-7 lg:ml-72 lg:px-10 lg:py-9">{children}</main></div>;
}
