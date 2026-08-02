import { Role, TenantModule } from "@prisma/client";
import { FileText, HelpCircle, MessageSquare, UserRound, UsersRound, CarFront } from "lucide-react";
import { LogoutButton } from "@/components/auth-navigation-buttons";
import { PortalPageContainer, PortalQuickActionTile, PortalSectionHeader } from "@/components/portal-mobile-shell";
import { PwaInstallActionCard } from "@/components/pwa-install-provider";
import { requireUser } from "@/lib/auth";
import { getEnabledTenantModules } from "@/lib/tenant";

export default async function PortalMorePage() {
  const user = await requireUser(Role.HOMEOWNER);
  const enabledModules = await getEnabledTenantModules(user.tenantId);

  return (
    <PortalPageContainer className="space-y-6">
      <PortalSectionHeader eyebrow="Account" title="More" />
      <section className="space-y-3" aria-label="Account and property">
        <PortalQuickActionTile href="/portal/profile" label="Profile" description="Review your homeowner account details." icon={UserRound} />
        {enabledModules.has(TenantModule.VEHICLES) && <PortalQuickActionTile href="/portal/vehicles" label="Vehicles" description="View registered vehicles and stickers." icon={CarFront} />}
        {enabledModules.has(TenantModule.DOCUMENTS) && <PortalQuickActionTile href="/portal/documents" label="Documents" description="Open the existing document request center." icon={FileText} />}
      </section>
      <section className="space-y-3" aria-label="Community and help">
        <PortalQuickActionTile href="/portal/organization" label="HOA Information" description="View officers and association contacts." icon={UsersRound} />
        {enabledModules.has(TenantModule.CHAT) && <PortalQuickActionTile href="/portal/chat" label="Help" description="Ask the HOA team through chat." icon={MessageSquare} />}
        {!enabledModules.has(TenantModule.CHAT) && <PortalQuickActionTile href="/portal/organization" label="Help" description="Use the available association contact information." icon={HelpCircle} />}
      </section>
      <section className="space-y-3" aria-label="Application">
        <PwaInstallActionCard />
        <div className="rounded-3xl border border-pine-100 bg-white p-4 shadow-sm">
          <LogoutButton className="btn-secondary min-h-12 w-full" />
        </div>
      </section>
    </PortalPageContainer>
  );
}
