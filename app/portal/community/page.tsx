import { Role, TenantModule } from "@prisma/client";
import { CalendarDays, Megaphone, MessageSquare, UsersRound } from "lucide-react";
import { PortalPageContainer, PortalQuickActionTile, PortalSectionHeader } from "@/components/portal-mobile-shell";
import { requireUser } from "@/lib/auth";
import { getEnabledTenantModules } from "@/lib/tenant";

export default async function PortalCommunityPage() {
  const user = await requireUser(Role.HOMEOWNER);
  const enabledModules = await getEnabledTenantModules(user.tenantId);
  const actions = [
    enabledModules.has(TenantModule.ANNOUNCEMENTS) && {
      href: "/portal/announcements",
      label: "Announcements",
      description: "Read association advisories and updates.",
      icon: Megaphone,
    },
    enabledModules.has(TenantModule.EVENTS) && {
      href: "/portal/events",
      label: "Events",
      description: "See upcoming community activities.",
      icon: CalendarDays,
    },
    enabledModules.has(TenantModule.CHAT) && {
      href: "/portal/chat",
      label: "Chat",
      description: "Message the HOA team through the existing chat module.",
      icon: MessageSquare,
    },
    {
      href: "/portal/organization",
      label: "HOA Officers",
      description: "View association contacts and organization information.",
      icon: UsersRound,
    },
  ].filter(Boolean);

  return (
    <PortalPageContainer className="space-y-5">
      <PortalSectionHeader eyebrow="Community" title="Community" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => action && <PortalQuickActionTile key={action.href} {...action} />)}
      </div>
    </PortalPageContainer>
  );
}
