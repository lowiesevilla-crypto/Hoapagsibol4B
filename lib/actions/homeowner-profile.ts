"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);
const optionalDate = z.union([z.string().date(), z.literal("")]).optional();

const homeownerSelfProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(100),
  phone: z.string().trim().min(1, "Enter your phone number.").max(30),
  birthDate: optionalDate,
  civilStatus: optionalText(50),
  citizenship: optionalText(80),
  occupation: optionalText(120),
  residencyDate: optionalDate,
  phase: optionalText(100),
  propertyType: optionalText(80),
  occupancyStatus: optionalText(80),
  address: z.string().trim().min(1, "Enter your complete address.").max(250),
  block: z.string().trim().min(1, "Enter your block.").max(30),
  lot: z.string().trim().min(1, "Enter your lot.").max(30),
  messengerId: optionalText(100),
});

const householdMemberSchema = z.object({
  id: z.string().trim().optional(),
  fullName: z.string().trim().min(2, "Enter the household member's full name.").max(150),
  relationship: z.string().trim().min(2, "Enter the relationship.").max(80),
  birthDate: optionalDate,
  civilStatus: optionalText(50),
  nationality: optionalText(80),
  address: optionalText(250),
});

export async function saveHomeownerProfileAction(formData: FormData) {
  const user = await requireUser(Role.HOMEOWNER);
  const homeownerId = user.homeownerProfile?.id;
  if (!homeownerId) fail("Homeowner profile not found.");

  const parsed = homeownerSelfProfileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) fail(parsed.error.issues[0]?.message || "Invalid profile details.");

  const current = await prisma.homeownerProfile.findFirst({
    where: { id: homeownerId, tenantId: user.tenantId, userId: user.id },
    select: { id: true, userId: true },
  });
  if (!current) fail("Homeowner profile not found.");

  const data = parsed.data;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { name: data.name },
    }),
    prisma.homeownerProfile.update({
      where: { tenantId_id: { tenantId: user.tenantId, id: current.id } },
      data: {
        phone: data.phone,
        birthDate: profileDate(data.birthDate),
        civilStatus: data.civilStatus,
        citizenship: data.citizenship,
        occupation: data.occupation,
        residencyDate: profileDate(data.residencyDate),
        phase: data.phase,
        propertyType: data.propertyType,
        occupancyStatus: data.occupancyStatus,
        address: data.address,
        block: data.block,
        lot: data.lot,
        messengerId: data.messengerId,
      },
    }),
    prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        module: "HOMEOWNER_PROFILE",
        action: "UPDATE_OWN_PROFILE",
        entityType: "HomeownerProfile",
        entityId: current.id,
        metadata: {
          source: "HOMEOWNER_PORTAL",
          editableFields: ["name", "phone", "birthDate", "civilStatus", "citizenship", "occupation", "residencyDate", "phase", "propertyType", "occupancyStatus", "address", "block", "lot", "messengerId"],
          protectedFields: ["accountNumber", "monthlyDuesAmount", "status", "activationStatus", "emailStatus"],
        },
      },
    }),
  ]);

  revalidateProfileSurfaces();
  redirect("/portal/profile?success=profile&message=Profile%20updated%20successfully.");
}

export async function saveHomeownerHouseholdMemberAction(formData: FormData) {
  const user = await requireUser(Role.HOMEOWNER);
  const homeownerId = user.homeownerProfile?.id;
  if (!homeownerId) fail("Homeowner profile not found.");

  const parsed = householdMemberSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) fail(parsed.error.issues[0]?.message || "Invalid household member details.");
  const data = parsed.data;

  const profile = await prisma.homeownerProfile.findFirst({
    where: { id: homeownerId, tenantId: user.tenantId, userId: user.id },
    select: { id: true },
  });
  if (!profile) fail("Homeowner profile not found.");

  if (data.id) {
    const member = await prisma.householdMember.findFirst({
      where: { id: data.id, tenantId: user.tenantId, homeownerId: profile.id },
      select: { id: true },
    });
    if (!member) fail("Household member not found.");

    const result = await prisma.householdMember.updateMany({
      where: { id: member.id, tenantId: user.tenantId, homeownerId: profile.id },
      data: {
        fullName: data.fullName,
        relationship: data.relationship,
        birthDate: profileDate(data.birthDate),
        civilStatus: data.civilStatus,
        nationality: data.nationality,
        address: data.address,
        validatedAt: null,
        validatedById: null,
        revokedAt: null,
        revokedById: null,
      },
    });
    if (result.count !== 1) fail("Household member could not be updated.");

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        module: "HOMEOWNER_PROFILE",
        action: "UPDATE_OWN_HOUSEHOLD_MEMBER",
        entityType: "HouseholdMember",
        entityId: member.id,
        metadata: { homeownerId: profile.id, validationReset: true },
      },
    });
  } else {
    const member = await prisma.householdMember.create({
      data: {
        tenantId: user.tenantId,
        homeownerId: profile.id,
        fullName: data.fullName,
        relationship: data.relationship,
        birthDate: profileDate(data.birthDate),
        civilStatus: data.civilStatus,
        nationality: data.nationality,
        address: data.address,
        active: true,
      },
      select: { id: true },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        module: "HOMEOWNER_PROFILE",
        action: "CREATE_OWN_HOUSEHOLD_MEMBER",
        entityType: "HouseholdMember",
        entityId: member.id,
        metadata: { homeownerId: profile.id },
      },
    });
  }

  revalidateProfileSurfaces();
  redirect("/portal/profile?success=household&message=Household%20member%20saved.");
}

export async function toggleHomeownerHouseholdMemberAction(formData: FormData) {
  const user = await requireUser(Role.HOMEOWNER);
  const homeownerId = user.homeownerProfile?.id;
  const id = String(formData.get("id") || "").trim();
  if (!homeownerId || !id) fail("Household member not found.");

  const member = await prisma.householdMember.findFirst({
    where: { id, tenantId: user.tenantId, homeownerId },
    select: { id: true, active: true },
  });
  if (!member) fail("Household member not found.");

  const result = await prisma.householdMember.updateMany({
    where: { id: member.id, tenantId: user.tenantId, homeownerId },
    data: { active: !member.active },
  });
  if (result.count !== 1) fail("Household member status could not be updated.");

  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      actorId: user.id,
      module: "HOMEOWNER_PROFILE",
      action: member.active ? "DEACTIVATE_OWN_HOUSEHOLD_MEMBER" : "ACTIVATE_OWN_HOUSEHOLD_MEMBER",
      entityType: "HouseholdMember",
      entityId: member.id,
      metadata: { homeownerId, active: !member.active },
    },
  });

  revalidateProfileSurfaces();
  redirect(`/portal/profile?success=household&message=${member.active ? "Household%20member%20removed%20from%20active%20household." : "Household%20member%20reactivated."}`);
}

function profileDate(value: string | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function fail(message: string): never {
  redirect(`/portal/profile?error=${encodeURIComponent(message)}`);
}

function revalidateProfileSurfaces() {
  revalidatePath("/portal/profile");
  revalidatePath("/portal/documents");
  revalidatePath("/portal/dashboard");
}
