import "server-only";

import { Role } from "@prisma/client";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function requireHomeownerProfile() {
  const user = await requireUser(Role.HOMEOWNER);
  const profile = await prisma.homeownerProfile.findFirst({ where: { userId: user.id, tenantId: user.tenantId }, include: { user: true } });
  if (!profile) notFound();
  return profile;
}
