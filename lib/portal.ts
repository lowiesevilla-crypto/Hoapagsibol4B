import "server-only";

import { Role } from "@prisma/client";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function requireHomeownerProfile() {
  const user = await requireUser(Role.HOMEOWNER);
  const profile = await prisma.homeownerProfile.findUnique({ where: { userId: user.id }, include: { user: true } });
  if (!profile) notFound();
  return profile;
}
