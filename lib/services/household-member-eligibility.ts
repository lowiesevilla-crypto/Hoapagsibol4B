import { Role } from "@prisma/client";

export type HouseholdMemberValidationStatus = "PENDING" | "VALIDATED" | "REJECTED";

export type HouseholdMemberEligibilityInput = {
  tenantId: string;
  homeownerId: string;
  active: boolean;
  validatedAt?: Date | string | null;
  revokedAt?: Date | string | null;
};

export function householdMemberValidationStatus(member: Pick<HouseholdMemberEligibilityInput, "validatedAt" | "revokedAt"> | null | undefined): HouseholdMemberValidationStatus {
  if (member?.revokedAt) return "REJECTED";
  if (member?.validatedAt) return "VALIDATED";
  return "PENDING";
}

export function householdMemberValidationLabel(status: HouseholdMemberValidationStatus) {
  if (status === "VALIDATED") return "Validated";
  if (status === "REJECTED") return "Validation Rejected";
  return "Pending Validation";
}

export function canValidateHouseholdMembers(role: Role) {
  const allowedRoles = new Set<Role>([Role.ADMIN, Role.SYSTEM_ADMIN, Role.HOA_ADMIN, Role.SUPER_ADMIN, Role.PLATFORM_ADMIN]);
  return allowedRoles.has(role);
}

export function householdMemberEligibility(
  member: HouseholdMemberEligibilityInput | null | undefined,
  expected: { tenantId: string; homeownerId: string },
) {
  if (!member) return { eligible: false, label: "Unavailable", reason: "Select a registered household or family member linked to your account." };
  if (member.tenantId !== expected.tenantId) return { eligible: false, label: "Wrong tenant", reason: "This household member belongs to another tenant." };
  if (member.homeownerId !== expected.homeownerId) return { eligible: false, label: "Wrong household", reason: "This household member does not belong to your registered household." };
  if (!member.active) return { eligible: false, label: "Inactive", reason: "This household member is inactive." };
  const status = householdMemberValidationStatus(member);
  if (status === "REJECTED") return { eligible: false, label: "Validation Rejected", reason: "This household member has been revoked by the HOA and is unavailable for self-service." };
  if (status === "PENDING") {
    return {
      eligible: true,
      label: "Active",
      reason: "This active household member is linked to your account and does not require HOA approval for homeowner self-service.",
    };
  }
  return { eligible: true, label: "Validated", reason: "Eligible for document requests." };
}
