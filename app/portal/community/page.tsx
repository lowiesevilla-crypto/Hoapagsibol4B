import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";
import { TenantModule } from "@prisma/client";
import { CalendarDays, Megaphone, MessageSquare, UsersRound } from "lucide-react";
import { CommunityFeatureCard, CommunityAreaNavigation, CommunityEmptyState } from "@/components/homeowner/community/community-cards";
import { PortalPageContainer, PortalSectionHeader, PortalSummaryCard } from "@/components/portal-mobile-shell";
import { prisma } from "@/lib/db";

import { resolveHomeownerNavigation } from "@/lib/homeowner-navigation";
import { getActiveOrganizationOfficers } from "@/lib/organization";
import { getEnabledTenantModules } from "@/lib/tenant";
import { shortDate } from "@/lib/utils";

export default async function PortalCommunityPage() {
  const user = await requirePermission(Permission.HOMEOWNER_PORTAL_ACCESS);
  const enabledModules = await getEnabledTenantModules(user.tenantId);
  const navigation = resolveHomeownerNavigation(enabledModules);
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
    enabledModules.has(TenantModule.ANNOUNCEMENTS) && {
      href: "/portal/announcements",
      label: "Announcements",
      description: "Read association advisories and resident updates.",
      icon: Megaphone,
      countLabel: `${announcementCount} published`,
    },
    enabledModules.has(TenantModule.EVENTS) && {
      href: "/portal/events",
      label: "Events",
      description: "See upcoming and previous community activities.",
      icon: CalendarDays,
      countLabel: `${eventCount} upcoming`,
    },
    enabledModules.has(TenantModule.CHAT) && {
      href: "/portal/chat",
      label: "Chat",
      description: "Message authorized HOA personnel through the existing chat module.",
      icon: MessageSquare,
      countLabel: "Secure",
    },
    {
      href: "/portal/organization",
      label: "HOA Officers",
      description: "View association contacts and officer information.",
      icon: UsersRound,
      countLabel: `${officers.length} active`,
    },
  ].filter(Boolean);

  return (
    <PortalPageContainer className="space-y-5">
      <PortalSectionHeader eyebrow="Community" title="Community" />
      <CommunityAreaNavigation items={navigation.communityLinks.map((link) => ({ href: link.href, label: link.label, description: link.description, icon: iconFor(link.href) }))} />
      <section className="grid gap-3 md:grid-cols-3" aria-label="Community summary">
        <PortalSummaryCard label="Published notices" value={String(announcementCount)} note="Tenant-scoped announcements" icon={Megaphone} href={enabledModules.has(TenantModule.ANNOUNCEMENTS) ? "/portal/announcements" : undefined} />
        <PortalSummaryCard label="Upcoming events" value={String(eventCount)} note={eventCount ? `Next schedule after ${shortDate(today)}` : "No upcoming published events"} icon={CalendarDays} href={enabledModules.has(TenantModule.EVENTS) ? "/portal/events" : undefined} />
        <PortalSummaryCard label="Active officers" value={String(officers.length)} note="Published HOA roster" icon={UsersRound} href="/portal/organization" />
      </section>
      {actions.length ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Community actions">
          {actions.map((action) => action && <CommunityFeatureCard key={action.href} {...action} />)}
        </section>
      ) : (
        <CommunityEmptyState title="Community modules are quiet" description="Enabled homeowner community features will appear here." />
      )}
    </PortalPageContainer>
  );
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function iconFor(href: string) {
  if (href.includes("announcements")) return Megaphone;
  if (href.includes("events")) return CalendarDays;
  if (href.includes("chat")) return MessageSquare;
  return UsersRound;
}
