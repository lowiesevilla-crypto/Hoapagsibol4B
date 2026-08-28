import { Suspense } from "react";
import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AiFloatingShortcut } from "@/components/ai/ai-floating-shortcut";
import { ChatUnreadNotifier } from "@/components/chat-unread-notifier";
import { PortalBottomNavigation, PortalMobileHeader } from "@/components/portal-mobile-shell";
import { Sidebar } from "@/components/sidebar";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { resolveAiAssistanceEntitlement } from "@/lib/ai-assistance/entitlement";
import { evaluateAiGovernance } from "@/lib/ai-assistance/runtime-policy";
import { requireUser } from "@/lib/auth";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
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
  const title = pathname.startsWith("/portal/document-library") ? "Document Library" : pathname.startsWith("/portal/ai") ? "Association Assistant" : homeownerRouteTitle(pathname);
  return tenantMetadata(title, tenantName);
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(Role.HOMEOWNER);
  const [enabledModules, documentManagementEntitlement, aiAssistanceEntitlement, aiGovernance] = await Promise.all([
    getEnabledTenantModules(user.tenantId),
    resolveDocumentManagementEntitlement(user.tenantId),
    resolveAiAssistanceEntitlement(user.tenantId),
    prisma.tenantAiConfiguration.findUnique({ where: { tenantId: user.tenantId } }),
  ]);
  const pathname = (await headers()).get("x-hoa-pathname") || "/portal/dashboard";
  const requestedModule = moduleForPath(pathname);
  if (requestedModule && !enabledModules.has(requestedModule)) redirect("/portal/dashboard?error=This%20module%20is%20not%20included%20in%20your%20subscription%20plan.");
  if (pathname.startsWith("/portal/document-library") && !documentManagementEntitlement.enabled) redirect("/portal/dashboard?error=Document%20Management%20is%20not%20included%20in%20your%20subscription%20plan.");

  const aiDecision = evaluateAiGovernance({
    globalRuntimeEnabled: process.env.AI_RUNTIME_ENABLED === "true",
    commerciallyEnabled: aiAssistanceEntitlement.enabled,
    experience: "RESIDENT",
    governance: aiGovernance,
  });
  const aiAvailable = aiDecision.allowed && user.permissions.includes(Permission.AI_ASSISTANCE_USE);
  if (pathname.startsWith("/portal/ai") && !aiAvailable) redirect("/portal/dashboard?error=HOAHub%20AI%20is%20not%20available%20for%20this%20tenant%20or%20account.");

  const [association, initialChatUnreadCount] = await Promise.all([getAssociationSettings(user.tenantId), getUnreadChatCount(user.id)]);
  const navigation = resolveHomeownerNavigation(enabledModules);
  const extraLinks = [
    documentManagementEntitlement.enabled && { href: "/portal/document-library", label: "Document Library", icon: "documents" as const, section: "Resident Services", description: "Official documents published by your association" },
    aiAvailable && { href: "/portal/ai", label: "Association Assistant", icon: "chat" as const, section: "Resident Services", description: "Tenant-scoped answers from approved HOA knowledge" },
  ].filter(Boolean) as Array<{ href: string; label: string; icon: "documents" | "chat"; section: string; description: string }>;
  const links = [...navigation.sidebarLinks, ...extraLinks];
  const mobileRouteTitles = links.map(({ href, label }) => ({ href, label }));

  return <div className="canva-portal-shell min-h-screen">
    <Sidebar user={user} links={links} roleLabel="Homeowner" association={association} initialChatUnreadCount={initialChatUnreadCount} desktopOnly />
    <PortalMobileHeader association={association} user={user} unreadCount={initialChatUnreadCount} routeTitles={mobileRouteTitles} showChat={navigation.hasChat} />
    {navigation.hasChat && <ChatUnreadNotifier initialUnreadCount={initialChatUnreadCount} chatHref="/portal/chat" />}
    <Suspense><TransactionFeedback /></Suspense>
    <main className="mx-auto min-w-0 max-w-[1800px] px-4 pb-[calc(10.25rem+env(safe-area-inset-bottom))] pt-5 sm:px-7 lg:ml-[300px] lg:px-10 lg:py-9">{children}</main>
    {aiAvailable && <AiFloatingShortcut />}
    <PortalBottomNavigation destinations={navigation.primaryDestinations} />
  </div>;
}
