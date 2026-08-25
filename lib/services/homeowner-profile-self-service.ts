import { z } from "zod";

const requiredText = (max: number, message: string) => z.string().trim().min(1, message).max(max);
const optionalText = (max: number) => z.preprocess((value) => value === "" ? undefined : value, z.string().trim().max(max).optional());
const optionalDate = z.preprocess((value) => value === "" ? undefined : value, z.string().date("Choose a valid date.").optional());

export const protectedHomeownerSelfServiceFields = [
  "accountNumber",
  "monthlyDuesAmount",
  "tenantId",
  "homeownerId",
  "userId",
  "status",
  "activationStatus",
  "emailStatus",
] as const;

const homeownerSelfProfileSchema = z.object({
  name: requiredText(100, "Enter your full name."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  phone: requiredText(30, "Enter your phone number."),
  birthDate: optionalDate,
  civilStatus: optionalText(50),
  citizenship: optionalText(80),
  occupation: optionalText(120),
  residencyDate: optionalDate,
  phase: optionalText(100),
  propertyType: optionalText(80),
  occupancyStatus: optionalText(80),
  address: requiredText(250, "Enter your address."),
  block: requiredText(30, "Enter your block."),
  lot: requiredText(30, "Enter your lot."),
  messengerId: optionalText(100),
});

const householdMemberSelfServiceSchema = z.object({
  fullName: requiredText(120, "Enter the household member's full name."),
  relationship: requiredText(80, "Enter the relationship."),
  birthDate: optionalDate,
  civilStatus: optionalText(50),
  nationality: optionalText(80),
  address: optionalText(250),
});

export type HomeownerSelfProfileInput = z.infer<typeof homeownerSelfProfileSchema>;
export type HouseholdMemberSelfServiceInput = z.infer<typeof householdMemberSelfServiceSchema>;

export function parseHomeownerSelfProfileInput(input: Record<string, unknown>): HomeownerSelfProfileInput {
  const attemptedProtectedField = protectedHomeownerSelfServiceFields.find((field) => Object.prototype.hasOwnProperty.call(input, field));
  if (attemptedProtectedField) {
    throw new Error("Account number, monthly dues, account status, and system ownership fields cannot be changed from the homeowner portal.");
  }
  return homeownerSelfProfileSchema.parse(input);
}

export function parseHouseholdMemberSelfServiceInput(input: Record<string, unknown>): HouseholdMemberSelfServiceInput {
  return householdMemberSelfServiceSchema.parse(input);
}
