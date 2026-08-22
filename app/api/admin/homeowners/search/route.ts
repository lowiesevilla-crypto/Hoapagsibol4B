import { HomeownerStatus, Prisma, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { homeownerSearchWhere } from "@/lib/homeowner-admin-search";

export async function GET(request: Request) {
  const user = await requireUser(Role.ADMIN);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const requestedLimit = Number(url.searchParams.get("limit") || 50);
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(10, Math.trunc(requestedLimit))) : 50;

  const baseWhere: Prisma.HomeownerProfileWhereInput = {
    tenantId: user.tenantId,
    status: HomeownerStatus.ACTIVE,
  };
  const searchWhere = homeownerSearchWhere(q);
  const where: Prisma.HomeownerProfileWhereInput = Object.keys(searchWhere).length
    ? { AND: [baseWhere, searchWhere] }
    : baseWhere;

  const [total, homeowners] = await Promise.all([
    prisma.homeownerProfile.count({ where }),
    prisma.homeownerProfile.findMany({
      where,
      select: {
        id: true,
        accountNumber: true,
        block: true,
        lot: true,
        phase: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ user: { name: "asc" } }, { block: "asc" }, { lot: "asc" }],
      take: limit,
    }),
  ]);

  return NextResponse.json({
    homeowners: homeowners.map((homeowner) => {
      const accountNumber = homeownerAccountNumber(homeowner);
      const label = `${homeowner.user.name} - Block ${homeowner.block}, Lot ${homeowner.lot}`;
      return {
        id: homeowner.id,
        label,
        search: `${homeowner.user.name} ${homeowner.user.email} ${accountNumber} block ${homeowner.block} lot ${homeowner.lot} ${homeowner.phase ?? ""} account ${homeowner.id}`.toLowerCase(),
      };
    }),
    total,
    hasMore: total > homeowners.length,
  });
}
