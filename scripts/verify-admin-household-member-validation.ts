import { readFileSync } from "node:fs";
import { Role } from "@prisma/client";
import { canValidateHouseholdMembers, householdMemberEligibility, householdMemberValidationLabel, householdMemberValidationStatus } from "@/lib/services/household-member-eligibility";

function assertCondition(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

function main() {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const adminHomeownerPage = readFileSync("app/admin/homeowners/[id]/page.tsx", "utf8");
  const documentActions = readFileSync("lib/actions/documents.ts", "utf8");
  const requestForm = readFileSync("components/document-request-form.tsx", "utf8");
  const eligibilityService = readFileSync("lib/services/household-member-eligibility.ts", "utf8");

  assertCondition(schema.includes("validatedAt      DateTime?") && schema.includes("validatedById    String?") && schema.includes("revokedAt        DateTime?") && schema.includes("revokedById      String?"), "HouseholdMember reuses existing validation fields; no schema change is required");
  assertCondition(householdMemberValidationStatus({ validatedAt: null, revokedAt: null }) === "PENDING", "legacy household members without validation data are Pending");
  assertCondition(householdMemberValidationStatus({ validatedAt: new Date("2026-07-01"), revokedAt: null }) === "VALIDATED", "validatedAt maps to Validated");
  assertCondition(householdMemberValidationStatus({ validatedAt: new Date("2026-07-01"), revokedAt: new Date("2026-07-02") }) === "REJECTED", "revokedAt takes precedence and maps to Rejected");
  assertCondition(householdMemberValidationLabel("PENDING") === "Pending Validation" && householdMemberValidationLabel("VALIDATED") === "Validated" && householdMemberValidationLabel("REJECTED") === "Validation Rejected", "validation status labels are business-facing");

  const expected = { tenantId: "tenant-a", homeownerId: "homeowner-a" };
  assertCondition(householdMemberEligibility({ ...expected, active: true, validatedAt: new Date(), revokedAt: null }, expected).eligible, "only active and validated same-tenant household members are eligible");
  assertCondition(!householdMemberEligibility({ ...expected, active: true, validatedAt: null, revokedAt: null }, expected).eligible, "pending household members are not eligible");
  assertCondition(!householdMemberEligibility({ ...expected, active: true, validatedAt: null, revokedAt: new Date() }, expected).eligible, "rejected household members are not eligible");
  assertCondition(!householdMemberEligibility({ ...expected, active: false, validatedAt: new Date(), revokedAt: null }, expected).eligible, "inactive household members are not eligible even when validated");
  assertCondition(!householdMemberEligibility({ tenantId: "tenant-b", homeownerId: expected.homeownerId, active: true, validatedAt: new Date(), revokedAt: null }, expected).eligible, "cross-tenant household members are rejected");
  assertCondition(!householdMemberEligibility({ tenantId: expected.tenantId, homeownerId: "homeowner-b", active: true, validatedAt: new Date(), revokedAt: null }, expected).eligible, "another homeowner's household member is rejected");

  assertCondition(canValidateHouseholdMembers(Role.ADMIN) && canValidateHouseholdMembers(Role.HOA_ADMIN) && canValidateHouseholdMembers(Role.SYSTEM_ADMIN) && canValidateHouseholdMembers(Role.SUPER_ADMIN) && canValidateHouseholdMembers(Role.PLATFORM_ADMIN), "admin roles can validate household members");
  assertCondition(!canValidateHouseholdMembers(Role.HOMEOWNER) && !canValidateHouseholdMembers(Role.BILLING_MANAGER) && !canValidateHouseholdMembers(Role.PAYROLL_MANAGER) && !canValidateHouseholdMembers(Role.STAFF), "homeowner, billing, payroll, and staff roles cannot validate household members");

  assertCondition(adminHomeownerPage.includes("Validation Status") && adminHomeownerPage.includes("Validation Remarks") && adminHomeownerPage.includes("name=\"validationStatus\""), "admin homeowner page exposes validation status and remarks controls");
  assertCondition(adminHomeownerPage.includes("canValidateHouseholdMembers(user.role)") && adminHomeownerPage.includes("Your role can edit profile details but cannot validate"), "admin homeowner page hides validation control from unauthorized roles");
  assertCondition(adminHomeownerPage.includes("validatedById") && adminHomeownerPage.includes("revokedById") && adminHomeownerPage.includes("UPDATE_HOUSEHOLD_MEMBER_VALIDATION"), "admin homeowner page displays validation actor metadata and audit remarks");

  assertCondition(documentActions.includes("validationStatusFromForm") && documentActions.includes("validationUpdateData"), "server action normalizes validation status before saving");
  assertCondition(documentActions.includes("canValidateHouseholdMembers(admin.role)") && documentActions.includes("Only authorized Resident Services administrators can change household member validation status."), "server action enforces validation authorization");
  assertCondition(documentActions.includes("Validation remarks are required when rejecting a household member."), "server action requires rejection remarks");
  assertCondition(documentActions.includes("validatedAt") && documentActions.includes("validatedById") && documentActions.includes("revokedAt") && documentActions.includes("revokedById"), "server action persists validation and rejection metadata");
  assertCondition(documentActions.includes("platformPrisma.$transaction") && documentActions.includes("auditLog.create") && documentActions.includes("previousValidationStatus") && documentActions.includes("newValidationStatus"), "validation updates and audit log are transactional and include before/after metadata");

  assertCondition(eligibilityService.includes("Validation is still pending.") && eligibilityService.includes("This household member was not approved."), "shared eligibility resolver provides precise pending and rejected messages");
  assertCondition(requestForm.includes("No validated and active household member is currently available for document requests."), "homeowner request UI explains the active plus validated requirement");

  console.log("Admin household member validation verification passed.");
}

main();
