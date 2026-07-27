import { randomInt } from "node:crypto";
import { Prisma, type HomeownerProfile } from "@prisma/client";
import { platformPrisma } from "@/lib/db";

export const HOMEOWNER_ACCOUNT_NUMBER_LENGTH = 11;
export const HOMEOWNER_ACCOUNT_NUMBER_PATTERN = /^[1-9][0-9]{10}$/;
export const UNASSIGNED_HOMEOWNER_ACCOUNT_NUMBER = "UNASSIGNED";

export type HomeownerAccountNumberClient = Pick<typeof platformPrisma, "$transaction" | "homeownerProfile" | "homeownerAccountNumberReservation">;

export type HomeownerAccountNumberSource = Pick<HomeownerProfile, "id" | "tenantId" | "accountNumber">;

export function isValidHomeownerAccountNumber(value: unknown): value is string {
  return typeof value === "string" && HOMEOWNER_ACCOUNT_NUMBER_PATTERN.test(value);
}

export function normalizeHomeownerAccountNumber(value: unknown) {
  return isValidHomeownerAccountNumber(value) ? value : null;
}

export function generateHomeownerAccountNumberCandidate() {
  return String(randomInt(10_000_000_000, 100_000_000_000));
}

export async function generateUniqueHomeownerAccountNumber(client: HomeownerAccountNumberClient = platformPrisma, maxAttempts = 20) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidate = generateHomeownerAccountNumberCandidate();
    const [existingHomeowner, existingReservation] = await Promise.all([
      client.homeownerProfile.findUnique({ where: { accountNumber: candidate }, select: { id: true } }),
      client.homeownerAccountNumberReservation.findUnique({ where: { accountNumber: candidate }, select: { id: true } }),
    ]);
    if (!existingHomeowner && !existingReservation) return candidate;
  }
  throw new Error("Unable to allocate a unique homeowner account number after multiple attempts.");
}

export async function ensureHomeownerAccountNumber(
  homeowner: HomeownerAccountNumberSource,
  client: HomeownerAccountNumberClient = platformPrisma,
  maxAttempts = 20,
) {
  const existing = normalizeHomeownerAccountNumber(homeowner.accountNumber);
  if (existing) return existing;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const accountNumber = await generateUniqueHomeownerAccountNumber(client, maxAttempts);
    try {
      return await client.$transaction(async (tx) => {
        const fresh = await tx.homeownerProfile.findFirst({
          where: { tenantId: homeowner.tenantId, id: homeowner.id },
          select: { accountNumber: true },
        });
        const current = normalizeHomeownerAccountNumber(fresh?.accountNumber);
        if (current) return current;
        await tx.homeownerAccountNumberReservation.create({
          data: { tenantId: homeowner.tenantId, homeownerId: homeowner.id, accountNumber, reason: "ASSIGNED" },
        });
        const updated = await tx.homeownerProfile.update({
          where: { tenantId_id: { tenantId: homeowner.tenantId, id: homeowner.id } },
          data: { accountNumber },
          select: { accountNumber: true },
        });
        return updated.accountNumber!;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error(`Unable to assign a unique homeowner account number to homeowner ${homeowner.id}.`);
}
