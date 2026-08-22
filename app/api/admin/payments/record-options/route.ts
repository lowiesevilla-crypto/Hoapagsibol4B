import { NextResponse } from "next/server";
import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { homeownerSearchWhere } from "@/lib/homeowner-admin-search";
import { money, monthLabel } from "@/lib/utils";

export async function GET(request: Request) {
  const admin = await requirePermission(Permission.PAYMENTS_RECORD);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const homeownerId = (url.searchParams.get("homeownerId") || "").trim();

  if (homeownerId) {
    const homeowner = await prisma.homeownerProfile.findFirst({
      where: { id: homeownerId, tenantId: admin.tenantId, status: "ACTIVE" },
      include: { user: true },
    });
    if (!homeowner) return NextResponse.json({ error: "Homeowner not found." }, { status: 404 });
    const bills = await prisma.bill.findMany({
      where: { tenantId: admin.tenantId, homeownerId, archivedAt: null, balance: { gt: 0 } },
      orderBy: [{ dueDate: "asc" }, { billingMonth: "asc" }],
    });
    return NextResponse.json({
      homeowner: {
        id: homeowner.id,
        name: homeowner.user.name,
        email: homeowner.user.email,
        accountNumber: homeownerAccountNumber(homeowner),
        property: `Block ${homeowner.block}, Lot ${homeowner.lot}`,
        monthlyDuesAmount: Number(homeowner.monthlyDuesAmount),
      },
      bills: bills.map((bill) => ({
        id: bill.id,
        homeownerId: bill.homeownerId,
        homeowner: homeowner.user.name,
        property: `Block ${homeowner.block}, Lot ${homeowner.lot}`,
        month: monthLabel(bill.billingMonth),
        billingMonth: bill.billingMonth.toISOString().slice(0, 10),
        balance: Number(bill.balance),
        balanceLabel: money(bill.balance),
      })),
    });
  }

  const searchWhere = homeownerSearchWhere(q);
  const where = {
    tenantId: admin.tenantId,
    status: "ACTIVE" as const,
    ...(Object.keys(searchWhere).length ? searchWhere : {}),
  };
  const [total, homeowners] = await Promise.all([
    prisma.homeownerProfile.count({ where }),
    prisma.homeownerProfile.findMany({
      where,
      include: { user: true },
      orderBy: [{ user: { name: "asc" } }, { block: "asc" }, { lot: "asc" }],
      take: 100,
    }),
  ]);
  return NextResponse.json({
    homeowners: homeowners.map((homeowner) => ({
      id: homeowner.id,
      name: homeowner.user.name,
      email: homeowner.user.email,
      accountNumber: homeownerAccountNumber(homeowner),
      property: `Block ${homeowner.block}, Lot ${homeowner.lot}`,
      monthlyDuesAmount: Number(homeowner.monthlyDuesAmount),
    })),
    total,
    hasMore: total > homeowners.length,
  });
}
