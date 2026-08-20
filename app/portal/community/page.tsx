import { Role, TenantModule } from "@prisma/client";
import { CalendarDays, Megaphone, MessageSquare, UsersRound } from "lucide-react";
import { CommunityFeatureCard, CommunityEmptyState } from "@/components/homeowner/community/community-cards";
import { PortalPageContainer, PortalSectionHeader, PortalSummaryCard } from "@/components/portal-mobile-shell";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getActiveOrganizationOfficers } from "@/lib/organization";
import { getEnabledTenantModules } from "@/lib/tenant";

export default async function PortalCommunityPage() {
  const user = await requireUser(Role.HOMEOWNER);
  const enabledModules = await getEnabledTenantModules(user.tenantId);
  const today = startOfToday();

  const [announcementCount, eventCount, officers] = await Promise.all([
    enabledModules.has(TenantModule.ANNOUNCEMENTS)
      ? prisma.announcement.count({ where: { tenantId: user.tenantId, status: "PUBLISHED" } })
      : 0,
    enabledModules.has(TenantModule.EVENTS)
      ? prisma.event.count({ where: { tenantId: user.tenantId, status: "PUBLISHED", eventDate: { gte: today } } })
      : 0,
    getActiveOrganizationOfficers(user.tenantId),
  ]);

  const actions = [
    enabledModules.has(TenantModule.ANNOUNCEMENTS) && { href: "/portal/announcements", label: "Announcements", description: "Latest HOA updates", icon: Megaphone, countLabel: String(announcementCount) },
    enabledModules.has(TenantModule.EVENTS) && { href: "/portal/events", label: "Events", description: "Community calendar", icon: CalendarDays, countLabel: String(eventCount) },
    enabledModules.has(TenantModule.CHAT) && { href: "/portal/chat", label: "Messages", description: "Residents and HOA officials", icon: MessageSquare, countLabel: "Chat" },
    { href: "/portal/organization", label: "HOA Officers", description: "Association leadership", icon: UsersRound, countLabel: String(officers.length) },
  ].filter(Boolean);

  return (
    <PortalPageContainer className="space-y-4">
      <PortalSectionHeader eyebrow="Community" title="Stay connected" />

      <section className="grid grid-cols-3 gap-2" aria-label="Community summary">
        <PortalSummaryCard compact label="Notices" value={String(announcementCount)} icon={Megaphone} href={enabledModules.has(TenantModule.ANNOUNCEMENTS) ? "/portal/announcements" : undefined} />
        <PortalSummaryCard compact label="Events" value={String(eventCount)} icon={CalendarDays} href={enabledModules.has(TenantModule.EVENTS) ? "/portal/events" : undefined} />
        <PortalSummaryCard compact label="Officers" value={String(officers.length)} icon={UsersRound} href="/portal/organization" />
      </section>

      {actions.length ? (
        <section className="grid gap-2 sm:grid-cols-2" aria-label="Community actions">
          {actions.map((action) => action && <CommunityFeatureCard key={action.href} {...action} />)}
        </section>
      ) : (
        <CommunityEmptyState title="Nothing to show yet" description="Community features will appear here when enabled by your HOA." />
      )}
    </PortalPageContainer>
  );
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}
