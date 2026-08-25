"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canValidateHouseholdMembers, householdMemberValidationStatus, type HouseholdMemberValidationStatus } from "@/lib/services/household-member-eligibility";

export async function saveAdminHouseholdMemberAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const homeownerId = String(formData.get("homeownerId") || "").trim();
  const id = String(formData.get("id") || "").trim();
  const returnPath = homeownerId ? `/admin/homeowners/${homeownerId}/household-members` : "/admin/homeowners";
  const fail = (message: string): never => redirect(`${returnPath}?error=${encodeURIComponent(message)}`);

  if (!homeownerId) fail("Homeowner profile is required.");

  const homeowner = await prisma.homeownerProfile.findFirst({
    where: { id: homeownerId, tenantId: admin.tenantId },
    select: { id: true },
  });
  if (!homeowner) fail("Homeowner profile was not found for this tenant.");

  const fullName = String(formData.get("fullName") || "").trim();
  const relationship = String(formData.get("relationship") || "").trim();
  if (fullName.length < 2 || relationship.length < 2) fail("Enter the household member's name and relationship.");

  const birthDate = optionalDate(formData.get("birthDate"), fail);
  const civilStatus = clean(formData.get("civilStatus"));
  const nationality = clean(formData.get("nationality"));
  const address = clean(formData.get("address"));
  const active = id ? formData.get("active") === "on" : true;
  const requestedValidationStatus = validationStatusFromForm(formData.get("validationStatus"));
  const validationRemarks = String(formData.get("validationRemarks") || "").trim();
  const canValidate = canValidateHouseholdMembers(admin.role);

  if (requestedValidationStatus !== "PENDING" && !canValidate) {
    fail("Only authorized Resident Services administrators can validate household members.");
  }
  if (requestedValidationStatus === "REJECTED" && validationRemarks.length < 10) {
    fail("Validation remarks are required when rejecting a household member.");
  }

  const now = new Date();

  if (!id) {
    const validationData = canValidate
      ? validationUpdateData(requestedValidationStatus, "PENDING", emptyValidationRecord, admin.id, now)
      : {};

    const member = await prisma.$transaction(async (tx) => {
      const created = await tx.householdMember.create({
        data: {
          tenantId: admin.tenantId,
          homeownerId,
          fullName,
          relationship,
          birthDate,
          civilStatus,
          nationality,
          address,
          active: true,
          ...validationData,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: admin.tenantId,
          actorId: admin.id,
          module: "HOMEOWNERS",
          action: "CREATE_HOUSEHOLD_MEMBER",
          entityType: "HouseholdMember",
          entityId: created.id,
          reason: validationRemarks || null,
          metadata: {
            homeownerId,
            fullName,
            relationship,
            active: true,
            validationStatus: requestedValidationStatus,
          },
        },
      });
      if (requestedValidationStatus !== "PENDING") {
        await tx.auditLog.create({
          data: {
            tenantId: admin.tenantId,
            actorId: admin.id,
            module: "DOCUMENTS",
            action: "UPDATE_HOUSEHOLD_MEMBER_VALIDATION",
            entityType: "HouseholdMember",
            entityId: created.id,
            reason: validationRemarks || null,
            metadata: {
              homeownerId,
              householdMemberId: created.id,
              previousValidationStatus: "PENDING",
              newValidationStatus: requestedValidationStatus,
              previousActive: true,
              newActive: true,
              remarks: validationRemarks || null,
            },
          },
        });
      }
      return created;
    });

    revalidateHouseholdPages(homeownerId);
    redirect(`${returnPath}?success=created&message=${encodeURIComponent(`${member.fullName} was added to the household.`)}`);
  }

  const member = (await prisma.householdMember.findFirst({
    where: { id, tenantId: admin.tenantId, homeownerId },
  })) ?? fail("Household member was not found for this tenant and homeowner.");

  const previousValidationStatus = householdMemberValidationStatus(member);
  const validationChanged = requestedValidationStatus !== previousValidationStatus;
  const activeChanged = active !== member.active;
  if (validationChanged && !canValidate) {
    fail("Only authorized Resident Services administrators can change household member validation status.");
  }

  const validationData = canValidate
    ? validationUpdateData(requestedValidationStatus, previousValidationStatus, member, admin.id, now)
    : {};

  await prisma.$transaction(async (tx) => {
    await tx.householdMember.update({
      where: { id },
      data: {
        fullName,
        relationship,
        birthDate,
        civilStatus,
        nationality,
        address,
        active,
        ...validationData,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: admin.tenantId,
        actorId: admin.id,
        module: "HOMEOWNERS",
        action: "UPDATE_HOUSEHOLD_MEMBER",
        entityType: "HouseholdMember",
        entityId: id,
        reason: validationRemarks || null,
        metadata: {
          homeownerId,
          oldValue: {
            fullName: member.fullName,
            relationship: member.relationship,
            birthDate: member.birthDate?.toISOString().slice(0, 10) ?? null,
            civilStatus: member.civilStatus,
            nationality: member.nationality,
            address: member.address,
            active: member.active,
            validationStatus: previousValidationStatus,
          },
          newValue: {
            fullName,
            relationship,
            birthDate: birthDate?.toISOString().slice(0, 10) ?? null,
            civilStatus,
            nationality,
            address,
            active,
            validationStatus: requestedValidationStatus,
          },
        },
      },
    });

    if (validationChanged || activeChanged) {
      await tx.auditLog.create({
        data: {
          tenantId: admin.tenantId,
          actorId: admin.id,
          module: "DOCUMENTS",
          action: "UPDATE_HOUSEHOLD_MEMBER_VALIDATION",
          entityType: "HouseholdMember",
          entityId: id,
          reason: validationRemarks || null,
          metadata: {
            homeownerId,
            householdMemberId: id,
            previousValidationStatus,
            newValidationStatus: requestedValidationStatus,
            previousActive: member.active,
            newActive: active,
            remarks: validationRemarks || null,
          },
        },
      });
    }
  });

  revalidateHouseholdPages(homeownerId);
  redirect(`${returnPath}?success=saved&message=${encodeURIComponent(`${fullName} was updated.`)}`);
}

const emptyValidationRecord = {
  validatedAt: null,
  validatedById: null,
  revokedAt: null,
  revokedById: null,
};

function validationStatusFromForm(value: FormDataEntryValue | null): HouseholdMemberValidationStatus {
  const status = String(value || "PENDING").trim().toUpperCase();
  if (status === "VALIDATED" || status === "REJECTED" || status === "PENDING") return status;
  return "PENDING";
}

function validationUpdateData(
  requested: HouseholdMemberValidationStatus,
  previous: HouseholdMemberValidationStatus,
  member: { validatedAt: Date | null; validatedById: string | null; revokedAt: Date | null; revokedById: string | null },
  actorId: string,
  now: Date,
) {
  if (requested === "VALIDATED") {
    return {
      validatedAt: previous === "VALIDATED" && member.validatedAt ? member.validatedAt : now,
      validatedById: previous === "VALIDATED" && member.validatedById ? member.validatedById : actorId,
      revokedAt: null,
      revokedById: null,
    };
  }
  if (requested === "REJECTED") {
    return {
      validatedAt: null,
      validatedById: null,
      revokedAt: previous === "REJECTED" && member.revokedAt ? member.revokedAt : now,
      revokedById: previous === "REJECTED" && member.revokedById ? member.revokedById : actorId,
    };
  }
  return { validatedAt: null, validatedById: null, revokedAt: null, revokedById: null };
}

function optionalDate(value: FormDataEntryValue | null, fail: (message: string) => never) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(date.valueOf())) fail("Enter a valid date of birth.");
  return date;
}

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim() || null;
}

function revalidateHouseholdPages(homeownerId: string) {
  revalidatePath(`/admin/homeowners/${homeownerId}`);
  revalidatePath(`/admin/homeowners/${homeownerId}/overview`);
  revalidatePath(`/admin/homeowners/${homeownerId}/household-members`);
  revalidatePath("/portal/documents");
  revalidatePath("/portal/profile");
}
