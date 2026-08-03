import { Prisma, Role } from "@prisma/client";
import { CalendarDays, Megaphone, MessageSquare, UsersRound } from "lucide-react";
import { CommunityAreaNavigation, CommunityEmptyState, CommunitySearchBar, EventMobileCard } from "@/components/homeowner/community/community-cards";
import { PageHeader } from "@/components/page-header";
import { PortalPageContainer, PortalSectionHeader } from "@/components/portal-mobile-shell";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { shortDate } from "@/lib/utils";

const EVENT_LIMIT = 6;

export default async function PortalEventsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser(Role.HOMEOWNER);
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const queryWhere: Prisma.EventWhereInput = query ? { OR: [{ title: { contains: query } }, { description: { contains: query } }, { location: { contains: query } }, { type: { contains: query } }] } : {};

  const [upcoming, previous] = await Promise.all([
    prisma.event.findMany({
      where: { tenantId: user.tenantId, status: "PUBLISHED", eventDate: { gte: today }, ...queryWhere },
      select: eventSelect,
      orderBy: [{ eventDate: "asc" }, { startTime: "asc" }],
      take: EVENT_LIMIT,
    }),
    prisma.event.findMany({
      where: { tenantId: user.tenantId, status: "PUBLISHED", eventDate: { lt: today }, ...queryWhere },
      select: eventSelect,
      orderBy: [{ eventDate: "desc" }, { startTime: "desc" }],
      take: EVENT_LIMIT,
    }),
  ]);

  return (
    <PortalPageContainer className="space-y-5">
      <PageHeader eyebrow="Community" title="Events" description="Published HOA meetings, activities, and neighborhood programs." />
      <CommunityAreaNavigation items={communityNav()} />
      <CommunitySearchBar query={query} placeholder="Search events" />
      <section className="space-y-3">
        <PortalSectionHeader eyebrow="Calendar" title="Upcoming events" />
        {upcoming.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{upcoming.map((event) => <EventMobileCard key={event.id} {...eventCard(event)} />)}</div> : <CommunityEmptyState title="No upcoming events" description={query ? "No upcoming events match your search." : "Published upcoming activities will appear here."} />}
      </section>
      <section className="space-y-3">
        <PortalSectionHeader eyebrow="Archive" title="Previous events" />
        {previous.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{previous.map((event) => <EventMobileCard key={event.id} {...eventCard(event)} previous />)}</div> : <CommunityEmptyState title="No previous events" description={query ? "No previous events match your search." : "Previous published events will appear here."} />}
      </section>
    </PortalPageContainer>
  );
}

const eventSelect = {
  id: true,
  title: true,
  description: true,
  type: true,
  eventDate: true,
  eventTime: true,
  startTime: true,
  endTime: true,
  location: true,
  imageUrl: true,
} satisfies Prisma.EventSelect;

function eventCard(event: Prisma.EventGetPayload<{ select: typeof eventSelect }>) {
  const time = event.startTime ?? event.eventTime;
  return {
    href: `/portal/events/${event.id}`,
    title: event.title,
    description: event.description,
    type: event.type,
    dateLabel: shortDate(event.eventDate),
    timeLabel: `${time}${event.endTime ? ` to ${event.endTime}` : ""}`,
    location: event.location,
    imageUrl: event.imageUrl,
  };
}

function communityNav() {
  return [
    { href: "/portal/community", label: "Community", description: "Overview", icon: UsersRound },
    { href: "/portal/announcements", label: "Announcements", description: "Official notices", icon: Megaphone },
    { href: "/portal/events", label: "Events", description: "Activities", icon: CalendarDays },
    { href: "/portal/chat", label: "Chat", description: "Message HOA", icon: MessageSquare },
  ];
}
