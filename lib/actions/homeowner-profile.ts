"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  parseHomeownerSelfProfileInput,
  parseHouseholdMemberSelfServiceInput,
} from "@/lib/services/homeowner-profile-self-service";

export async function updateHomeownerProfileAction(formData: FormData) {
  const user = await requireUser(Role.HOMEOWNER);
  const homeownerId = user.homeownerProfile?.id;
  if (!homeownerId) redirectWithError("Homeowner profile not found.");

  let data: ReturnType<typeof parseHomeownerSelfProfileInput>;
  try {
    data = parseHomeownerSelfProfileInput(Object.fromEntries(formData.entries()));
  } catch (error) {
    redirectWithError(readableError(error, "Invalid profile details."));
  }

  const current = await prisma.homeownerProfile.findFirst({
    where: { id: homeownerId, tenantId: user.tenantId, userId: user.id },
    include: { user: true },
  });
  if (!current) redirectWithError("Homeowner profile not found.");

  if (data.email !== current.user.email.toLowerCase()) {
    const emailConflict = await prisma.user.findFirst({
      where: { tenantId: user.tenantId, email: data.email, active: true, NOT: { id: user.id } },
      select: { id: true },
    });
    if (emailConflict) redirectWithError("That email address is already used by another active account in this HOA.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { name: data.name, email: data.email },
    });
    await tx.homeownerProfile.update({
      where: { tenantId_id: { tenantId: user.tenantId, id: homeownerId } },
      data: {
        phone: data.phone,
        birthDate: profileDate(data.birthDate),
        civilStatus: data.civilStatus || null,
        citizenship: data.citizenship || null,
        occupation: data.occupation || null,
        residencyDate: profileDate(data.residencyDate),
        phase: data.phase || null,
        propertyType: data.propertyType || null,
        occupancyStatus: data.occupancyStatus || null,
        address: data.address,
        block: data.block,
        lot: data.lot,
        messengerId: data.messengerId || null,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        module: "HOMEOWNERS",
        action: "HOMEOWNER_SELF_PROFILE_UPDATED",
        entityType: "HomeownerProfile",
        entityId: homeownerId,
        metadata: {
          source: "HOMEOWNER_PORTAL",
          editableFields: [
            "name",
            "email",
            "phone",
            "birthDate",
            "civilStatus",
            "citizenship",
            "occupation",
            "residencyDate",
            "phase",
            "propertyType",
            "occupancyStatus",
            "address",
            "block",
            "lot",
            "messengerId",
          ],
          protectedFields: ["accountNumber", "monthlyDuesAmount", "status", "activationStatus"],
        },
      },
    });
  });

  revalidatePath("/portal/profile");
  redirect("/portal/profile?success=profile&message=Profile%20updated%20successfully.");
}

export async function addHomeownerHouseholdMemberAction(formData: FormData) {
  const user = await requireUser(Role.HOMEOWNER);
  const homeownerId = user.homeownerProfile?.id;
  if (!homeownerId) redirectWithError("Homeowner profile not found.");

  let data: ReturnType<typeof parseHouseholdMemberSelfServiceInput>;
  try {
    data = parseHouseholdMemberSelfServiceInput(Object.fromEntries(formData.entries()));
  } catch (error) {
    redirectWithError(readableError(error, "Invalid household member details."));
  }

  const homeowner = await prisma.homeownerProfile.findFirst({
    where: { id: homeownerId, tenantId: user.tenantId, userId: user.id },
    select: { id: true },
  });
  if (!homeowner) redirectWithError("Homeowner profile not found.");

  const createdAt = new Date();
  await prisma.$transaction(async (tx) => {
    const member = await tx.householdMember.create({
      data: {
        tenantId: user.tenantId,
        homeownerId,
        fullName: data.fullName,
        relationship: data.relationship,
        birthDate: profileDate(data.birthDate),
        civilStatus: data.civilStatus || null,
        nationality: data.nationality || null,
        address: data.address || null,
        active: true,
        validatedAt: createdAt,
        validatedById: user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        module: "HOMEOWNERS",
        action: "HOMEOWNER_HOUSEHOLD_MEMBER_ADDED",
        entityType: "HouseholdMember",
        entityId: member.id,
        metadata: {
          source: "HOMEOWNER_PORTAL",
          homeownerId,
          relationship: data.relationship,
          approvalRequired: false,
          activeImmediately: true,
        },
      },
    });
  });

  revalidatePath("/portal/profile");
  revalidatePath("/portal/documents");
  redirect("/portal/profile?success=household&message=Household%20member%20added%20and%20available%20immediately.");
}

function profileDate(value?: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function readableError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    const firstLine = error.message.split("\n").find((line) => line.trim());
    return firstLine?.replace(/^\[|\]$/g, "").trim() || fallback;
  }
  return fallback;
}

function redirectWithError(message: string): never {
  redirect(`/portal/profile?error=${encodeURIComponent(message)}`);
}
