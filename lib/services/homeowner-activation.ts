import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { HomeownerActivationStatus, HomeownerEmailVerificationStatus, NotificationStatus, NotificationType, Prisma, Role } from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";
import { platformPrisma, prisma } from "@/lib/db";
import { sendEmailNotification } from "@/lib/services/notifications";
import { getAssociationSettings } from "@/lib/system-settings";
import { setTenantContext } from "@/lib/tenant-context";

const ACTIVATION_TTL_DAYS = 7;

export type ActivationCredentialResult = {
  temporaryPassword: string;
  expiresAt: Date;
  emailVerificationToken: string;
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
  const emailVerificationToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ACTIVATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.homeownerActivationCredential.updateMany({
    where: { tenantId: input.tenantId, userId: input.userId, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await db.homeownerEmailVerificationToken.updateMany({
    where: { tenantId: input.tenantId, userId: input.userId, usedAt: null },
    data: { usedAt: new Date() },
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
  await db.homeownerEmailVerificationToken.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      tokenHash: hashOpaqueToken(emailVerificationToken),
      expiresAt,
    },
  });
  return { temporaryPassword, expiresAt, emailVerificationToken };
}

export async function sendHomeownerActivationEmail(input: {
  tenantId: string;
  userId: string;
  name: string;
  email: string;
  accountNumber: string;
  temporaryPassword: string;
  emailVerificationToken?: string;
  expiresAt: Date;
  actorId?: string | null;
}) {
  const activationUrl = `${getAppUrl()}/activate`;
  const emailVerificationUrl = input.emailVerificationToken ? `${activationUrl}/verify?token=${encodeURIComponent(input.emailVerificationToken)}` : activationUrl;
  const association = await getAssociationSettings(input.tenantId);
  try {
    const notification = await sendEmailNotification({
      tenantId: input.tenantId,
      recipientId: input.userId,
      email: input.email,
      subject: "Activate your HOAHub homeowner account",
      heading: "Homeowner account activation",
      message: [
        `Hello ${input.name},`,
        `${association.name} has prepared your HOAHub homeowner account for first-time activation.`,
        `Activation page: ${activationUrl}`,
        `Account number: ${input.accountNumber}`,
        `Temporary password: ${input.temporaryPassword}`,
        `This temporary password expires on ${input.expiresAt.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}.`,
        `Verify registered email: ${emailVerificationUrl}`,
        "First-time login: open the activation page, verify your registered email, enter your account number and temporary password, then create your permanent password.",
        "Permanent password requirement: 6 to 24 characters with at least one letter and one number.",
        "Optional passkey/device authentication: after activation, open My Profile and enroll a passkey on your trusted phone, tablet, or computer.",
        "Android Chrome install: open HOAHub in Chrome, tap the menu, then tap Add to Home screen or Install app.",
        "iPhone Safari install: open HOAHub in Safari, tap Share, then tap Add to Home Screen.",
        "Desktop Chrome/Edge install: open HOAHub, select the install icon in the address bar or use the browser menu to install the app.",
        "Security warning: never share your temporary password, permanent password, passkey prompt, or verification link. HOA staff will not ask for your password.",
        `Support: ${association.email || association.contactNumber || "contact your HOA office"}`,
      ].join("\n"),
      type: NotificationType.WELCOME,
      actionLabel: "Verify email and activate account",
      actionUrl: emailVerificationUrl,
      logMessage: "Homeowner activation email sent. Sensitive activation instructions, temporary password, verification link, and full account number are redacted from logs.",
    });
    await prisma.auditLog.create({
        data: {
        tenantId: input.tenantId,
        actorId: input.actorId ?? null,
        module: "AUTH",
        action: "HOMEOWNER_ACTIVATION_EMAIL_ATTEMPTED",
        entityType: "User",
        entityId: input.userId,
        metadata: {
          notificationId: notification.id,
          status: notification.status,
          providerMessageIdPresent: Boolean(notification.providerMessageId),
          errorCategory: notification.errorMessage ? activationEmailErrorCategory(notification.errorMessage) : null,
        },
      },
    });
    return notification;
  } catch (error) {
    return prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId ?? null,
        module: "AUTH",
        action: "HOMEOWNER_ACTIVATION_EMAIL_ATTEMPTED",
        entityType: "User",
        entityId: input.userId,
        metadata: {
          status: NotificationStatus.FAILED,
          providerMessageIdPresent: false,
          errorCategory: activationEmailErrorCategory(error instanceof Error ? error.message : "Unknown email error"),
        },
      },
    });
  }
}

export async function verifyHomeownerEmailVerificationToken(token: string) {
  const value = String(token || "").trim();
  if (!value || value.length > 512) return { error: "This email verification link is invalid." } as const;
  const record = await platformPrisma.homeownerEmailVerificationToken.findUnique({
    where: { tokenHash: hashOpaqueToken(value) },
    include: { user: { include: { homeownerProfile: true, tenant: true } } },
  });
  if (!record) return { error: "This email verification link is invalid." } as const;
  const profile = record.user.homeownerProfile;
  if (!profile || profile.tenantId !== record.tenantId || record.user.role !== Role.HOMEOWNER || !record.user.active) return { error: "This email verification link is invalid." } as const;
  if (record.usedAt) {
    if (profile.emailStatus === HomeownerEmailVerificationStatus.VERIFIED) return { tenantSlug: record.user.tenant.slug, alreadyVerified: true } as const;
    return { error: "This email verification link has already been used." } as const;
  }
  if (record.expiresAt <= new Date()) return { error: "This email verification link has expired. Ask HOA staff to send a new activation invitation." } as const;

  const now = new Date();
  await platformPrisma.$transaction([
    platformPrisma.homeownerEmailVerificationToken.update({ where: { id: record.id }, data: { usedAt: now } }),
    platformPrisma.homeownerProfile.update({
      where: { id: profile.id },
      data: {
        emailStatus: HomeownerEmailVerificationStatus.VERIFIED,
        emailVerifiedAt: profile.emailVerifiedAt ?? now,
        activationStatus: profile.activatedAt ? HomeownerActivationStatus.ACTIVE : HomeownerActivationStatus.PASSWORD_CREATION_REQUIRED,
      },
    }),
    platformPrisma.auditLog.create({
      data: {
        tenantId: record.tenantId,
        actorId: record.userId,
        module: "AUTH",
        action: "HOMEOWNER_EMAIL_VERIFIED",
        entityType: "HomeownerProfile",
        entityId: profile.id,
        metadata: { method: "activation_email_link" },
      },
    }),
  ]);
  return { tenantSlug: record.user.tenant.slug } as const;
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
  if (profile.activationStatus === HomeownerActivationStatus.CANCELLED) return { error: "This homeowner activation invitation was cancelled. Contact the HOA office." } as const;
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
  if (profile.emailStatus !== HomeownerEmailVerificationStatus.VERIFIED) {
    await prisma.homeownerProfile.update({ where: { id: profile.id }, data: { activationStatus: HomeownerActivationStatus.EMAIL_PENDING_VERIFICATION } });
    return { error: "Verify your registered email using the link in the activation email before creating your permanent password." } as const;
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
    prisma.homeownerEmailVerificationToken.updateMany({ where: { tenantId: input.tenantId, userId: input.userId, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } }),
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

function activationEmailErrorCategory(message: string) {
  if (/not configured|username|password|sender/i.test(message)) return "CONFIGURATION";
  if (/authentication|invalid login|535|EAUTH/i.test(message)) return "AUTHENTICATION";
  if (/timeout|timed out|connection|ECONN|ETIMEDOUT/i.test(message)) return "CONNECTION";
  if (/recipient|mailbox|address/i.test(message)) return "RECIPIENT";
  return "PROVIDER";
}
