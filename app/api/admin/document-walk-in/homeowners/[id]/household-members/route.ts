import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { householdMemberEligibility } from "@/lib/services/household-member-eligibility";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(Role.ADMIN);
  const { id } = await params;
  const homeowner = await prisma.homeownerProfile.findFirst({ where: { tenantId: user.tenantId, id }, select: { id: true } });
  if (!homeowner) return NextResponse.json({ members: [] }, { status: 404 });
  const members = await prisma.householdMember.findMany({
    where: { tenantId: user.tenantId, homeownerId: id, active: true, validatedAt: { not: null }, revokedAt: null },
    orderBy: { fullName: "asc" },
  });
  return NextResponse.json({
    members: members
      .filter((member) => householdMemberEligibility(member, { tenantId: user.tenantId, homeownerId: id }).eligible)
      .map((member) => ({
        id: member.id,
        fullName: member.fullName,
        relationship: member.relationship,
        birthDate: member.birthDate?.toISOString().slice(0, 10) ?? null,
        civilStatus: member.civilStatus,
        nationality: member.nationality,
        address: member.address,
      })),
  });
}
