"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { HomeownerActivationStatus, HomeownerEmailVerificationStatus, NotificationStatus, NotificationType, Prisma, Role, type HomeownerStatus } from "@prisma/client";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAppUrl } from "@/lib/app-url";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { homeownerSchema } from "@/lib/validation";
import { generateUniqueHomeownerAccountNumber } from "@/lib/services/homeowner-account-number";
import { createHomeownerActivationCredential, sendHomeownerActivationEmail } from "@/lib/services/homeowner-activation";
import { homeownerDigitalActivationEligibility, maskAccountNumber, nextInvitationStatus } from "@/lib/services/homeowner-digital-activation";
import { sendEmailNotification } from "@/lib/services/notifications";
import { getPasswordPolicy } from "@/lib/system-settings";

const BULK_INVITATION_BATCH_SIZE = 25;
const BULK_EMAIL_DELAY_MS = 100;
const homeownerActivationAdminRoles = new Set<Role>([Role.SUPER_ADMIN, Role.SYSTEM_ADMIN, Role.HOA_ADMIN, Role.ADMIN]);

export async function saveHomeownerAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const parsed = homeownerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid homeowner details.");
  const data = parsed.data;

  if (data.id) {
    const existing = await prisma.homeownerProfile.findFirst({ where: { id: data.id, tenantId: admin.tenantId }, select: { userId: true } });
    if (!existing) throw new Error("Homeowner not found.");
    await prisma.$transaction([
      prisma.user.update({
        where: { id: existing.userId },
        data: {
          name: data.name,
          email: data.email,
        },
      }),
      prisma.homeownerProfile.update({
        where: { tenantId_id: { tenantId: admin.tenantId, id: data.id } },
        data: {
          phone: data.phone,
          birthDate: optionalProfileDate(data.birthDate),
          civilStatus: data.civilStatus || null,
          citizenship: data.citizenship || null,
          occupation: data.occupation || null,
          residencyDate: optionalProfileDate(data.residencyDate),
          phase: data.phase || null,
          propertyType: data.propertyType || null,
          occupancyStatus: data.occupancyStatus || null,
          address: data.address,
          block: data.block,
          lot: data.lot,
          messengerId: data.messengerId || null,
          status: data.status,
          monthlyDuesAmount: data.monthlyDuesAmount,
        },
      }),
    ]);
  } else {
    const created = await createHomeownerWithAccountNumber({
      name: data.name,
      email: data.email,
      tenantId: admin.tenantId,
      createdById: admin.id,
      profile: {
        phone: data.phone,
        birthDate: optionalProfileDate(data.birthDate),
        civilStatus: data.civilStatus || null,
        citizenship: data.citizenship || null,
        occupation: data.occupation || null,
        residencyDate: optionalProfileDate(data.residencyDate),
        phase: data.phase || null,
        propertyType: data.propertyType || null,
        occupancyStatus: data.occupancyStatus || null,
        address: data.address,
        block: data.block,
        lot: data.lot,
        messengerId: data.messengerId || null,
        status: data.status,
        monthlyDuesAmount: data.monthlyDuesAmount,
      },
    });
    await sendHomeownerActivationEmail({
      tenantId: admin.tenantId,
      userId: created.user.id,
      email: created.email,
      name: created.name,
      accountNumber: created.accountNumber,
      temporaryPassword: created.activation.temporaryPassword,
      emailVerificationToken: created.activation.emailVerificationToken,
      expiresAt: created.activation.expiresAt,
      actorId: admin.id,
    });
  }

  revalidatePath("/admin/homeowners");
  redirect(data.id ? "/admin/homeowners?success=saved&message=Homeowner%20record%20updated%20successfully." : "/admin/homeowners?success=created&message=Homeowner%20record%20created%20and%20activation%20email%20queued.");
}

async function createHomeownerWithAccountNumber(input: {
  name: string;
  email: string;
  tenantId: string;
  createdById: string;
  profile: {
    phone: string;
    birthDate: Date | null;
    civilStatus: string | null;
    citizenship: string | null;
    occupation: string | null;
    residencyDate: Date | null;
    phase: string | null;
    propertyType: string | null;
    occupancyStatus: string | null;
    address: string;
    block: string;
    lot: string;
    messengerId: string | null;
    status: HomeownerStatus;
    monthlyDuesAmount: Prisma.Decimal | string | number;
  };
}) {
  for (let attempt = 1; attempt <= 20; attempt++) {
    const accountNumber = await generateUniqueHomeownerAccountNumber();
    try {
      return await prisma.$transaction(async (tx) => {
        const passwordHash = await hash(generateSystemPasswordPlaceholder(), 12);
        const user = await tx.user.create({
          data: {
            name: input.name,
            email: input.email,
            tenantId: input.tenantId,
            passwordHash,
            role: Role.HOMEOWNER,
            homeownerProfile: {
              create: {
                ...input.profile,
                tenantId: input.tenantId,
                accountNumber,
                activationStatus: HomeownerActivationStatus.INVITATION_SENT,
                emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
                activationSentAt: new Date(),
              },
            },
          },
          include: { homeownerProfile: true },
        });
        await tx.homeownerAccountNumberReservation.create({
          data: { tenantId: input.tenantId, homeownerId: user.homeownerProfile?.id, accountNumber, reason: "ASSIGNED" },
        });
        const activation = await createHomeownerActivationCredential({ tenantId: input.tenantId, userId: user.id, createdById: input.createdById, tx });
        await tx.auditLog.create({
          data: {
            tenantId: input.tenantId,
            actorId: input.createdById,
            module: "AUTH",
            action: "HOMEOWNER_ACTIVATION_CREATED",
            entityType: "User",
            entityId: user.id,
            metadata: { accountMasked: maskAccountNumber(accountNumber) },
          },
        });
        return { user, activation, id: user.id, email: user.email, name: user.name, accountNumber };
      });
    } catch (error) {
      if (isUniqueAccountNumberCollision(error)) continue;
      throw error;
    }
  }
  throw new Error("Unable to allocate a unique homeowner account number.");
}

function optionalProfileDate(value?: string) { return value ? new Date(`${value}T00:00:00.000Z`) : null; }

function generateSystemPasswordPlaceholder() {
  return `activation-only-${randomUUID()}`;
}

function isUniqueAccountNumberCollision(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function deleteHomeownerAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const id = String(formData.get("id") || "");
  const profile = await prisma.homeownerProfile.findFirst({ where: { id, tenantId: admin.tenantId }, select: { userId: true, _count: { select: { collections: true } } } });
  if (!profile) throw new Error("Homeowner not found.");
  if (profile._count.collections) throw new Error("A homeowner with collection history cannot be deleted. Mark the profile inactive instead.");
  await prisma.user.delete({ where: { id: profile.userId } });
  revalidatePath("/admin/homeowners");
  redirect("/admin/homeowners?success=deleted");
}

export async function regenerateHomeownerActivationAction(formData: FormData) {
  const admin = await requireHomeownerActivationAdmin();
  const id = String(formData.get("id") || "");
  const result = await sendActivationInvitation(admin, id, "HOMEOWNER_ACTIVATION_REGENERATED");
  if (!result.ok) throw new Error(result.reason);
  revalidatePath("/admin/homeowners");
  revalidatePath(`/admin/homeowners/${id}`);
  redirect(`/admin/homeowners/${id}?success=activation&message=Activation%20invitation%20sent.`);
}

export async function sendHomeownerActivationInvitationAction(formData: FormData) {
  const admin = await requireHomeownerActivationAdmin();
  const id = String(formData.get("id") || "");
  const result = await sendActivationInvitation(admin, id, "HOMEOWNER_ACTIVATION_INVITATION_SENT");
  if (!result.ok) throw new Error(result.reason);
  revalidatePath("/admin/homeowners");
  revalidatePath(`/admin/homeowners/${id}`);
  redirect(`/admin/homeowners/${id}?success=activation&message=Activation%20invitation%20sent.`);
}

export async function cancelHomeownerActivationAction(formData: FormData) {
  const admin = await requireHomeownerActivationAdmin();
  const id = String(formData.get("id") || "");
  const profile = await prisma.homeownerProfile.findFirst({
    where: { id, tenantId: admin.tenantId },
    include: { user: true },
  });
  if (!profile) throw new Error("Homeowner not found.");
  if (profile.activationStatus === HomeownerActivationStatus.ACTIVE && profile.activatedAt) throw new Error("Activated homeowner accounts cannot be cancelled through invitation controls.");
  await prisma.$transaction([
    prisma.homeownerActivationCredential.updateMany({ where: { tenantId: admin.tenantId, userId: profile.userId, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.homeownerEmailVerificationToken.updateMany({ where: { tenantId: admin.tenantId, userId: profile.userId, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.homeownerProfile.update({ where: { tenantId_id: { tenantId: admin.tenantId, id: profile.id } }, data: { activationStatus: HomeownerActivationStatus.CANCELLED } }),
    prisma.auditLog.create({
      data: {
        tenantId: admin.tenantId,
        actorId: admin.id,
        module: "AUTH",
        action: "HOMEOWNER_ACTIVATION_CANCELLED",
        entityType: "User",
        entityId: profile.userId,
        metadata: { homeownerId: profile.id, accountMasked: maskAccountNumber(homeownerAccountNumber(profile)) },
      },
    }),
  ]);
  revalidatePath("/admin/homeowners");
  revalidatePath(`/admin/homeowners/${profile.id}`);
  redirect(`/admin/homeowners/${profile.id}?success=activation&message=Activation%20invitation%20cancelled.`);
}

export async function disableHomeownerActivationAction(formData: FormData) {
  const admin = await requireHomeownerActivationAdmin();
  const id = String(formData.get("id") || "");
  const profile = await prisma.homeownerProfile.findFirst({ where: { id, tenantId: admin.tenantId }, include: { user: true } });
  if (!profile) throw new Error("Homeowner not found.");
  await prisma.$transaction([
    prisma.homeownerActivationCredential.updateMany({
      where: { tenantId: admin.tenantId, userId: profile.userId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.homeownerEmailVerificationToken.updateMany({ where: { tenantId: admin.tenantId, userId: profile.userId, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.userSession.updateMany({ where: { tenantId: admin.tenantId, userId: profile.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.user.update({ where: { id: profile.userId }, data: { active: false } }),
    prisma.homeownerProfile.update({
      where: { tenantId_id: { tenantId: admin.tenantId, id: profile.id } },
      data: { activationStatus: HomeownerActivationStatus.DISABLED },
    }),
    prisma.auditLog.create({
      data: {
        tenantId: admin.tenantId,
        actorId: admin.id,
        module: "AUTH",
        action: "HOMEOWNER_ACTIVATION_DISABLED",
        entityType: "User",
        entityId: profile.userId,
        metadata: { homeownerId: profile.id, accountMasked: maskAccountNumber(homeownerAccountNumber(profile)) },
      },
    }),
  ]);
  revalidatePath("/admin/homeowners");
  revalidatePath(`/admin/homeowners/${profile.id}`);
  redirect(`/admin/homeowners/${profile.id}?success=activation&message=Activation%20has%20been%20disabled.`);
}

export async function revokeHomeownerDigitalSessionsAction(formData: FormData) {
  const admin = await requireHomeownerActivationAdmin();
  const id = String(formData.get("id") || "");
  const profile = await prisma.homeownerProfile.findFirst({ where: { id, tenantId: admin.tenantId }, include: { user: true } });
  if (!profile) throw new Error("Homeowner not found.");
  if (profile.activationStatus !== HomeownerActivationStatus.ACTIVE || !profile.activatedAt) throw new Error("Only activated homeowner digital accounts can have sessions revoked.");
  const now = new Date();
  await prisma.$transaction([
    prisma.userSession.updateMany({ where: { tenantId: admin.tenantId, userId: profile.userId, revokedAt: null }, data: { revokedAt: now } }),
    prisma.auditLog.create({
      data: {
        tenantId: admin.tenantId,
        actorId: admin.id,
        module: "AUTH",
        action: "HOMEOWNER_SESSIONS_REVOKED",
        entityType: "User",
        entityId: profile.userId,
        metadata: { homeownerId: profile.id, accountMasked: maskAccountNumber(homeownerAccountNumber(profile)) },
      },
    }),
  ]);
  revalidatePath(`/admin/homeowners/${profile.id}`);
  redirect(`/admin/homeowners/${profile.id}?success=activation&message=Active%20homeowner%20sessions%20revoked.`);
}

export async function sendHomeownerPasswordResetEmailAction(formData: FormData) {
  const admin = await requireHomeownerActivationAdmin();
  const id = String(formData.get("id") || "");
  const profile = await prisma.homeownerProfile.findFirst({
    where: { id, tenantId: admin.tenantId },
    include: { user: { include: { tenant: true } } },
  });
  if (!profile) throw new Error("Homeowner not found.");
  if (profile.user.role !== Role.HOMEOWNER) throw new Error("Password reset can only be sent to homeowner accounts.");
  if (!profile.user.active) throw new Error("Digital user access is disabled.");
  if (profile.activationStatus !== HomeownerActivationStatus.ACTIVE || !profile.activatedAt) throw new Error("First-time activation must be completed before password reset.");
  if (!profile.user.email.trim()) throw new Error("Registered email is required before sending a password reset.");

  const policy = await getPasswordPolicy(admin.tenantId);
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = passwordResetFingerprint(rawToken);
  const expiresAt = new Date(Date.now() + policy.expiryMinutes * 60 * 1000);
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { tenantId: admin.tenantId, userId: profile.userId, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({ data: { tenantId: admin.tenantId, userId: profile.userId, tokenHash, expiresAt } }),
  ]);

  const resetUrl = `${getAppUrl()}/reset-password?token=${encodeURIComponent(rawToken)}&tenantSlug=${encodeURIComponent(profile.user.tenant.slug)}`;
  const notification = await sendEmailNotification({
    tenantId: admin.tenantId,
    recipientId: profile.userId,
    email: profile.user.email,
    subject: "Reset your HOAHub homeowner password",
    heading: "Secure password reset",
    message: `Hello ${profile.user.name},\nHOA staff sent a password reset link for your activated homeowner account. This secure link expires in ${policy.expiryMinutes} minutes and can be used only once.\nIf you did not request this, contact your HOA office.`,
    type: NotificationType.PASSWORD_RESET,
    actionLabel: "Reset password",
    actionUrl: resetUrl,
    logMessage: "Homeowner password reset email attempted. The secure reset link and full email address are redacted from logs.",
  });
  const sent = notification.status === NotificationStatus.SENT;
  if (!sent) await prisma.passwordResetToken.updateMany({ where: { tenantId: admin.tenantId, userId: profile.userId, tokenHash, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.auditLog.create({
    data: {
      tenantId: admin.tenantId,
      actorId: admin.id,
      module: "AUTH",
      action: sent ? "HOMEOWNER_PASSWORD_RESET_EMAIL_SENT" : "HOMEOWNER_PASSWORD_RESET_EMAIL_FAILED",
      entityType: "User",
      entityId: profile.userId,
      metadata: {
        homeownerId: profile.id,
        notificationId: notification.id,
        status: notification.status,
        errorCategory: sent ? null : passwordResetEmailErrorCategory(notification.errorMessage || "Email delivery failed."),
      },
    },
  });
  revalidatePath(`/admin/homeowners/${profile.id}`);
  redirect(`/admin/homeowners/${profile.id}?success=activation&message=${sent ? "Password%20reset%20email%20sent." : "Password%20reset%20email%20could%20not%20be%20delivered."}`);
}

export async function bulkSendHomeownerActivationInvitationsAction(formData: FormData) {
  const admin = await requireHomeownerActivationAdmin();
  const selectedIds = formData.getAll("homeownerId").map((value) => String(value)).filter(Boolean);
  if (!selectedIds.length) redirect("/admin/homeowners?error=Select%20at%20least%20one%20eligible%20homeowner.");
  const homeowners = await prisma.homeownerProfile.findMany({ where: { tenantId: admin.tenantId, id: { in: selectedIds } }, include: { user: true }, orderBy: { user: { name: "asc" } }, take: selectedIds.length });
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (let index = 0; index < homeowners.length; index += BULK_INVITATION_BATCH_SIZE) {
    const batch = homeowners.slice(index, index + BULK_INVITATION_BATCH_SIZE);
    for (const homeowner of batch) {
      const result = await sendActivationInvitation(admin, homeowner.id, "HOMEOWNER_ACTIVATION_BULK_INVITATION_SENT", homeowner);
      if (result.ok) sent++;
      else if (result.skipped) skipped++;
      else failed++;
      await delay(BULK_EMAIL_DELAY_MS);
    }
  }
  await prisma.auditLog.create({
    data: {
      tenantId: admin.tenantId,
      actorId: admin.id,
      module: "AUTH",
      action: "HOMEOWNER_ACTIVATION_BULK_COMPLETED",
      entityType: "HomeownerProfile",
      entityId: "selected",
      metadata: { mode: "selected", selectedCount: selectedIds.length, processed: homeowners.length, sent, skipped, failed },
    },
  });
  revalidatePath("/admin/homeowners");
  redirect(`/admin/homeowners?success=bulkActivation&message=${encodeURIComponent(`Activation invitations processed. Sent: ${sent}. Skipped: ${skipped}. Failed: ${failed}.`)}`);
}

async function sendActivationInvitation(
  admin: { id: string; tenantId: string },
  homeownerId: string,
  auditAction: string,
  loadedProfile?: Prisma.HomeownerProfileGetPayload<{ include: { user: true } }>,
) {
  const profile = loadedProfile ?? await prisma.homeownerProfile.findFirst({ where: { id: homeownerId, tenantId: admin.tenantId }, include: { user: true } });
  if (!profile) return { ok: false, skipped: true, reason: "Homeowner not found." } as const;
  const eligibility = homeownerDigitalActivationEligibility(profile);
  if (!eligibility.eligible) return { ok: false, skipped: true, reason: eligibility.reason } as const;
  const accountNumber = homeownerAccountNumber(profile);
  try {
    const activation = await prisma.$transaction(async (tx) => {
      const created = await createHomeownerActivationCredential({ tenantId: admin.tenantId, userId: profile.userId, createdById: admin.id, tx });
      await tx.homeownerProfile.update({
        where: { tenantId_id: { tenantId: admin.tenantId, id: profile.id } },
        data: { activationStatus: nextInvitationStatus(profile.activationStatus), emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED, activationSentAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          tenantId: admin.tenantId,
          actorId: admin.id,
          module: "AUTH",
          action: auditAction,
          entityType: "User",
          entityId: profile.userId,
          metadata: { homeownerId: profile.id, accountMasked: maskAccountNumber(accountNumber) },
        },
      });
      return created;
    });
    await sendHomeownerActivationEmail({
      tenantId: admin.tenantId,
      userId: profile.userId,
      name: profile.user.name,
      email: profile.user.email,
      accountNumber,
      temporaryPassword: activation.temporaryPassword,
      emailVerificationToken: activation.emailVerificationToken,
      expiresAt: activation.expiresAt,
      actorId: admin.id,
    });
    return { ok: true } as const;
  } catch (error) {
    await prisma.auditLog.create({
      data: {
        tenantId: admin.tenantId,
        actorId: admin.id,
        module: "AUTH",
        action: "HOMEOWNER_ACTIVATION_INVITATION_FAILED",
        entityType: "User",
        entityId: profile.userId,
        metadata: { homeownerId: profile.id, error: error instanceof Error ? error.message.slice(0, 160) : "Unknown error" },
      },
    });
    return { ok: false, skipped: false, reason: "Invitation failed." } as const;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requireHomeownerActivationAdmin() {
  const admin = await requireUser(Role.ADMIN);
  if (!homeownerActivationAdminRoles.has(admin.role)) throw new Error("Your role is not authorized to manage homeowner activation.");
  return admin;
}

function passwordResetFingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function passwordResetEmailErrorCategory(message: string) {
  if (/not configured|username|password|sender/i.test(message)) return "CONFIGURATION";
  if (/authentication|invalid login|535|EAUTH/i.test(message)) return "AUTHENTICATION";
  if (/timeout|timed out|connection|ECONN|ETIMEDOUT/i.test(message)) return "CONNECTION";
  if (/recipient|mailbox|address/i.test(message)) return "RECIPIENT";
  return "PROVIDER";
}
