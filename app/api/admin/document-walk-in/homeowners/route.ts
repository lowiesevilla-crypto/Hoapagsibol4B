import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber } from "@/lib/homeowner-account";

export async function GET(request: Request) {
  const user = await requireUser(Role.ADMIN);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const where = q
    ? {
        tenantId: user.tenantId,
        status: "ACTIVE" as const,
        OR: [
          { user: { name: { contains: q } } },
          { user: { email: { contains: q } } },
          { accountNumber: { contains: q } },
          { block: { contains: q } },
          { lot: { contains: q } },
          { phone: { contains: q } },
        ],
      }
    : { tenantId: user.tenantId, status: "ACTIVE" as const };
  const homeowners = await prisma.homeownerProfile.findMany({
    where,
    include: { user: true },
    orderBy: { user: { name: "asc" } },
    take: 15,
  });
  return NextResponse.json({
    homeowners: homeowners.map((homeowner) => ({
      id: homeowner.id,
      name: homeowner.user.name,
      email: homeowner.user.email,
      accountNumber: homeownerAccountNumber(homeowner),
      phone: homeowner.phone,
      block: homeowner.block,
      lot: homeowner.lot,
      address: homeowner.address,
    })),
  });
}
