import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const user = await requireUser(Role.HOMEOWNER);
    const { searchParams } = new URL(request.url);
    const rawSearch = searchParams.get("search")?.trim() ?? "";
    const terms = rawSearch
      .replace(/\b(?:block|blk|lot|unit)\b/gi, " ")
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean)
      .slice(0, 6);

    const homeowners = await prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        active: true,
        role: Role.HOMEOWNER,
        id: { not: user.id },
        ...(terms.length
          ? {
              AND: terms.map((term) => ({
                OR: [
                  { name: { contains: term } },
                  { homeownerProfile: { is: { block: { contains: term } } } },
                  { homeownerProfile: { is: { lot: { contains: term } } } },
                ],
              })),
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        role: true,
        presence: true,
        homeownerProfile: { select: { block: true, lot: true } },
      },
      orderBy: { name: "asc" },
      take: 500,
    });

    const now = Date.now();
    return NextResponse.json({
      homeowners: homeowners.map((resident) => {
        const profile = resident.homeownerProfile;
        const lastSeenAt = resident.presence?.lastSeenAt ?? null;
        return {
          id: resident.id,
          name: resident.name,
          email: "",
          role: resident.role,
          initials: resident.name.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "H",
          presence: lastSeenAt
            ? {
                lastSeenAt: lastSeenAt.toISOString(),
                context: resident.presence?.context ?? null,
                online: now - lastSeenAt.valueOf() < ONLINE_WINDOW_MS,
              }
            : null,
          homeownerProfile: null,
          employeeProfile: null,
          searchText: [
            resident.name,
            "homeowner",
            "resident",
            profile?.block,
            profile?.lot,
            profile?.block ? `block ${profile.block}` : null,
            profile?.block ? `blk ${profile.block}` : null,
            profile?.lot ? `lot ${profile.lot}` : null,
            profile?.block && profile?.lot ? `block ${profile.block} lot ${profile.lot}` : null,
            profile?.block && profile?.lot ? `blk ${profile.block} lot ${profile.lot}` : null,
          ].filter(Boolean).join(" ").toLowerCase(),
        };
      }),
    }, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load homeowners." }, { status: 400 });
  }
}
