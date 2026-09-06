import { Role, TenantModule } from "@prisma/client";
import { Bot, Building2, CarFront, FileText, HelpCircle, KeyRound, LockKeyhole, MessageSquare, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { LogoutButton } from "@/components/auth-navigation-buttons";
import { CommunityAreaNavigation, CommunityEmptyState } from "@/components/homeowner/community/community-cards";
import { PortalPageContainer, PortalQuickActionTile, PortalSectionHeader } from "@/components/portal-mobile-shell";
import { PwaInstallActionCard } from "@/components/pwa-install-provider";
import { resolveAiAssistanceEntitlement } from "@/lib/ai-assistance/entitlement";
import { evaluateAiGovernance } from "@/lib/ai-assistance/runtime-policy";
import { requireUser } from "@/lib/auth";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { resolveDocumentManagementEntitlement } from "@/lib/document-repository/entitlement";
import { resolveHomeownerNavigation } from "@/lib/homeowner-navigation";
import { getEnabledTenantModules } from "@/lib/tenant";

export default async function PortalMorePage() {
  const user = await requireUser(Role.HOMEOWNER);
  const [enabledModules, documentManagementEntitlement, aiAssistanceEntitlement, aiGovernance] = await Promise.all([
    getEnabledTenantModules(user.tenantId),
    resolveDocumentManagementEntitlement(user.tenantId),
    resolveAiAssistanceEntitlement(user.tenantId),
    prisma.tenantAiConfiguration.findUnique({ where: { tenantId: user.tenantId } }),
  ]);
  const aiDecision = evaluateAiGovernance({ globalRuntimeEnabled: process.env.AI_RUNTIME_ENABLED === "true", commerciallyEnabled: aiAssistanceEntitlement.enabled, experience: "RESIDENT", governance: aiGovernance });
  const aiAvailable = aiDecision.allowed && user.permissions.includes(Permission.AI_ASSISTANCE_USE);
  const navigation = resolveHomeownerNavigation(enabledModules);
  const accountActions = [
    { href: "/portal/profile", label: "Profile", description: "Homeowner, property, household, password, and passkey details.", icon: UserRound },
    enabledModules.has(TenantModule.BILLING) && { href: "/portal/rentals", label: "Rentals & Contracts", description: "Reserve HOA rental assets and download your active rental agreements.", icon: Building2 },
    enabledModules.has(TenantModule.VEHICLES) && { href: "/portal/vehicles", label: "Vehicles", description: "Registered vehicles and sticker information.", icon: CarFront },
    enabledModules.has(TenantModule.DOCUMENTS) && { href: "/portal/documents", label: "Documents", description: "Document requests and generated files.", icon: FileText },
    documentManagementEntitlement.enabled && { href: "/portal/document-library", label: "Document Library", description: "Official association documents published for homeowners.", icon: FileText },
  ].filter(Boolean);
  const supportActions = [
    aiAvailable && { href: "/portal/ai", label: "Association Assistant", description: "Ask tenant-scoped questions grounded in approved HOA knowledge.", icon: Bot },
    { href: "/portal/organization", label: "HOA Information", description: "Official contacts and officer roster.", icon: UsersRound },
    enabledModules.has(TenantModule.CHAT) && { href: "/portal/chat", label: "Help", description: "Ask authorized HOA personnel through secure chat.", icon: MessageSquare },
    !enabledModules.has(TenantModule.CHAT) && { href: "/portal/organization", label: "Help", description: "Use the published association contact information.", icon: HelpCircle },
  ].filter(Boolean);

  return <PortalPageContainer className="space-y-6">
    <PortalSectionHeader eyebrow="Account" title="More" />
    <CommunityAreaNavigation items={navigation.moreLinks.map((link) => ({ href: link.href, label: link.label, description: link.description, icon: moreIconFor(link.href) }))} />
    <section className="space-y-3" aria-label="Account and property"><PortalSectionHeader eyebrow="Resident" title="Account and property" />{accountActions.length ? accountActions.map((action) => action && <PortalQuickActionTile key={action.href} {...action} />) : <CommunityEmptyState title="No account actions" description="Enabled account services will appear here." />}</section>
    <section className="space-y-3" aria-label="Security"><PortalSectionHeader eyebrow="Security" title="Sign-in controls" /><PortalQuickActionTile href="/portal/profile" label="Password and passkeys" description="Manage secure sign-in from your profile." icon={KeyRound} /><PortalQuickActionTile href="/portal/profile" label="Logout all sessions" description="End active homeowner sessions from the profile page." icon={LockKeyhole} /></section>
    <section className="space-y-3" aria-label="Community and support"><PortalSectionHeader eyebrow="Support" title="Help and association" />{supportActions.map((action) => action && <PortalQuickActionTile key={action.href} {...action} />)}</section>
    <section className="space-y-3" aria-label="Application"><PortalSectionHeader eyebrow="App" title="HOAHub mobile" /><PwaInstallActionCard /><div className="rounded-3xl border border-pine-100 bg-white p-4 shadow-sm"><LogoutButton className="btn-secondary min-h-12 w-full" /></div><div className="rounded-3xl border border-slate-100 bg-white p-4 text-sm text-slate-500"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-pine-700" aria-hidden="true" /><p>Privacy, terms, and help content are available through the association support channels configured for this tenant.</p></div></div></section>
  </PortalPageContainer>;
}

function moreIconFor(href: string) {
  if (href.includes("vehicles")) return CarFront;
  if (href.includes("profile")) return UserRound;
  if (href.includes("rentals")) return Building2;
  return FileText;
}
