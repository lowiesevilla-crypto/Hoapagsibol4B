import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { homeownerSearchWhere } from "@/lib/homeowner-admin-search";

export async function GET(request: Request) {
  const user = await requirePermission(Permission.BILLING_ADJUST);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const requestedLimit = Number(url.searchParams.get("limit") || 100);
  const limit = Number.isFinite(requestedLimit) ? Math.min(250, Math.max(20, Math.trunc(requestedLimit))) : 100;

  const baseWhere: Prisma.HomeownerProfileWhereInput = { tenantId: user.tenantId };
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
        status: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ user: { name: "asc" } }, { block: "asc" }, { lot: "asc" }],
      take: limit,
    }),
  ]);

  return NextResponse.json({
    homeowners: homeowners.map((homeowner) => {
      const accountNumber = homeownerAccountNumber(homeowner);
      const statusSuffix = homeowner.status === "ACTIVE" ? "" : ` - ${homeowner.status}`;
      return {
        id: homeowner.id,
        label: `${homeowner.user.name} - Block ${homeowner.block}, Lot ${homeowner.lot}${accountNumber ? ` - ${accountNumber}` : ""}${statusSuffix}`,
        search: `${homeowner.user.name} ${homeowner.user.email} ${accountNumber} block ${homeowner.block} lot ${homeowner.lot} ${homeowner.phase ?? ""} account ${homeowner.id} ${homeowner.status}`.toLowerCase(),
      };
    }),
    total,
    hasMore: total > homeowners.length,
  });
}