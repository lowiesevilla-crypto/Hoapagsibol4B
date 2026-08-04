import { Prisma, Role } from "@prisma/client";
import { CalendarDays, Megaphone, MessageSquare, UsersRound } from "lucide-react";
import { AnnouncementMobileCard, CommunityAreaNavigation, CommunityEmptyState, CommunitySearchBar } from "@/components/homeowner/community/community-cards";
import { PageHeader } from "@/components/page-header";
import { PortalPageContainer } from "@/components/portal-mobile-shell";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { shortDate } from "@/lib/utils";

const ANNOUNCEMENT_LIMIT = 12;

export default async function PortalAnnouncementsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser(Role.HOMEOWNER);
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const where: Prisma.AnnouncementWhereInput = {
    tenantId: user.tenantId,
    status: "PUBLISHED",
    ...(query ? { OR: [{ title: { contains: query } }, { content: { contains: query } }, { type: { contains: query } }] } : {}),
  };
  const [announcements, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      select: { id: true, title: true, content: true, type: true, imageUrl: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }],
      take: ANNOUNCEMENT_LIMIT,
    }),
    prisma.announcement.count({ where }),
  ]);

  return (
    <PortalPageContainer className="space-y-5">
      <PageHeader eyebrow="Community" title="Announcements" description="Published HOA notices, advisories, and resident updates." />
      <CommunityAreaNavigation items={communityNav()} />
      <CommunitySearchBar query={query} placeholder="Search announcements" />
      {announcements.length ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Published announcements">
            {announcements.map((item) => (
              <AnnouncementMobileCard
                key={item.id}
                href={`/portal/announcements/${item.id}`}
                title={item.title}
                content={item.content}
                type={item.type}
                postedLabel={`Posted ${shortDate(item.createdAt)}`}
                imageUrl={item.imageUrl}
              />
            ))}
          </section>
          {total > ANNOUNCEMENT_LIMIT && <p className="rounded-2xl bg-slate-50 p-3 text-center text-sm font-bold text-slate-500">Showing latest {ANNOUNCEMENT_LIMIT} of {total}. Use search to narrow the list.</p>}
        </>
      ) : (
        <CommunityEmptyState title="No announcements found" description={query ? "Try a different search term." : "Published HOA notices will appear here."} />
      )}
    </PortalPageContainer>
  );
}

function communityNav() {
  return [
    { href: "/portal/community", label: "Community", description: "Overview", icon: UsersRound },
    { href: "/portal/announcements", label: "Announcements", description: "Official notices", icon: Megaphone },
    { href: "/portal/events", label: "Events", description: "Activities", icon: CalendarDays },
    { href: "/portal/chat", label: "Chat", description: "Message HOA", icon: MessageSquare },
  ];
}
