import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { HomeownerActivationStatus, HomeownerEmailVerificationStatus, NotificationType, Prisma, Role } from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";
import { platformPrisma, prisma } from "@/lib/db";
import { sendEmailNotification } from "@/lib/services/notifications";
import { setTenantContext } from "@/lib/tenant-context";

const ACTIVATION_TTL_DAYS = 7;

export type ActivationCredentialResult = {
  temporaryPassword: string;
  expiresAt: Date;
};

export function normalizeAccountNumber(value: FormDataEntryValue | string | null | undefined) {
  return String(value || "").replace(/\D/g, "").trim();
}

export function normalizeActivationEmail(value: FormDataEntryValue | string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

export function validateHomeownerActivationPassword(password: string) {
  if (password.length < 6 || password.length > 24) return "Password must be 6 to 24 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Password must contain at least one letter and one number.";
  return null;
}

export function generateTemporaryActivationPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(14);
  let value = "";
  for (const byte of bytes) value += alphabet[byte % alphabet.length];
  return value;
}

export function hashOpaqueToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function createHomeownerActivationCredential(input: {
  tenantId: string;
  userId: string;
  createdById?: string | null;
  tx?: Prisma.TransactionClient | unknown;
}): Promise<ActivationCredentialResult> {
  const db = (input.tx ?? prisma) as Prisma.TransactionClient;
  const temporaryPassword = generateTemporaryActivationPassword();
  const expiresAt = new Date(Date.now() + ACTIVATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.homeownerActivationCredential.updateMany({
    where: { tenantId: input.tenantId, userId: input.userId, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await db.homeownerActivationCredential.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      credentialHash: await hash(temporaryPassword, 12),
      createdById: input.createdById ?? null,
      expiresAt,
    },
  });
  return { temporaryPassword, expiresAt };
}

export async function sendHomeownerActivationEmail(input: {
  tenantId: string;
  userId: string;
  name: string;
  email: string;
  accountNumber: string;
  temporaryPassword: string;
  expiresAt: Date;
  actorId?: string | null;
}) {
  const activationUrl = `${getAppUrl()}/activate`;
  return sendEmailNotification({
    tenantId: input.tenantId,
    recipientId: input.userId,
    email: input.email,
    subject: "Activate your HOAHub homeowner account",
    heading: "Homeowner account activation",
    message: [
      `Hello ${input.name},`,
      "Your HOAHub homeowner account is ready for activation.",
      `Account number: ${input.accountNumber}`,
      `Temporary password: ${input.temporaryPassword}`,
      `This temporary password expires on ${input.expiresAt.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}.`,
      "Open the activation page, enter your registered email, account number, and temporary password, then create your permanent password.",
    ].join("\n"),
    type: NotificationType.WELCOME,
    actionLabel: "Activate homeowner account",
    actionUrl: activationUrl,
  }).catch((error) => prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorId ?? null,
      module: "AUTH",
      action: "HOMEOWNER_ACTIVATION_EMAIL_FAILED",
      entityType: "User",
      entityId: input.userId,
      metadata: { error: error instanceof Error ? error.message.slice(0, 300) : "Unknown email error" },
    },
  }));
}

export async function verifyHomeownerActivationCredential(input: {
  accountNumber: string;
  email: string;
  temporaryPassword: string;
}) {
  const profile = await platformPrisma.homeownerProfile.findFirst({
    where: {
      accountNumber: normalizeAccountNumber(input.accountNumber),
      status: "ACTIVE",
      user: { email: normalizeActivationEmail(input.email), active: true, role: Role.HOMEOWNER },
    },
    include: {
      user: { include: { tenant: { include: { advisories: { where: { active: true }, orderBy: { createdAt: "desc" }, take: 1 }, moduleEntitlements: true } } } },
    },
  });
  if (!profile) return { error: "Activation details do not match an active homeowner account." } as const;
  setTenantContext({
    tenantId: profile.tenantId,
    role: Role.HOMEOWNER,
    platform: false,
    enabledModules: new Set(profile.user.tenant.moduleEntitlements.filter((item) => item.enabled).map((item) => item.module)),
  });
  if (profile.activationStatus === HomeownerActivationStatus.DISABLED) return { error: "This homeowner activation has been disabled. Contact the HOA office." } as const;
  if (profile.activationStatus === HomeownerActivationStatus.ACTIVE && profile.activatedAt) return { error: "This homeowner account is already activated. Use the login page to sign in." } as const;

  const credential = await prisma.homeownerActivationCredential.findFirst({
    where: { tenantId: profile.tenantId, userId: profile.userId, usedAt: null, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!credential || credential.expiresAt <= new Date()) {
    if (profile.activationStatus !== HomeownerActivationStatus.EXPIRED) {
      await prisma.homeownerProfile.update({ where: { id: profile.id }, data: { activationStatus: HomeownerActivationStatus.EXPIRED } });
    }
    return { error: "The temporary password has expired. Contact the HOA office for a new activation email." } as const;
  }

  const matches = await compare(input.temporaryPassword, credential.credentialHash);
  if (!matches) {
    await prisma.homeownerActivationCredential.update({
      where: { id: credential.id },
      data: { attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
    });
    return { error: "Activation details do not match an active homeowner account." } as const;
  }

  return { profile, credential } as const;
}

export async function markHomeownerActivated(input: {
  tenantId: string;
  profileId: string;
  userId: string;
  credentialId: string;
  password: string;
}) {
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: input.userId }, data: { passwordHash: await hash(input.password, 12), lastLoginAt: now } }),
    prisma.homeownerActivationCredential.update({ where: { id: input.credentialId }, data: { usedAt: now } }),
    prisma.homeownerProfile.update({
      where: { id: input.profileId },
      data: {
        activationStatus: HomeownerActivationStatus.ACTIVE,
        emailStatus: HomeownerEmailVerificationStatus.VERIFIED,
        emailVerifiedAt: now,
        activatedAt: now,
      },
    }),
    prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.userId,
        module: "AUTH",
        action: "HOMEOWNER_ACTIVATED",
        entityType: "User",
        entityId: input.userId,
      },
    }),
  ]);
}
