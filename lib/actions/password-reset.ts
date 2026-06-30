"use server";

import { createHash, randomBytes } from "node:crypto";
import { NotificationStatus, NotificationType, Prisma, Role } from "@prisma/client";
import { hash } from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { deleteSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendEmailNotification } from "@/lib/services/notifications";
import { getPasswordPolicy } from "@/lib/system-settings";
import { forgotPasswordSchema } from "@/lib/validation";

export type ForgotPasswordState = { error?: string; success?: string };
export type ResetPasswordState = { error?: string };

const GENERIC_RESPONSE = "If that email belongs to an active homeowner account, a secure reset link will be sent shortly.";

export async function forgotPasswordAction(_state: ForgotPasswordState, formData: FormData): Promise<ForgotPasswordState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Enter a valid email address." };
  const email = parsed.data.email;
  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders);
  const emailHash = fingerprint(email);
  const ipHash = fingerprint(ip);
  const windowStart = new Date(Date.now() - 15 * 60 * 1000);

  const [emailAttempts, ipAttempts] = await Promise.all([
    prisma.passwordResetAttempt.count({ where: { emailHash, createdAt: { gte: windowStart } } }),
    prisma.passwordResetAttempt.count({ where: { ipHash, createdAt: { gte: windowStart } } }),
  ]);
  await prisma.passwordResetAttempt.create({ data: { emailHash, ipHash } });
  if (emailAttempts >= 3 || ipAttempts >= 10) {
    await prisma.auditLog.create({ data: { module: "AUTH", action: "PASSWORD_RESET_RATE_LIMITED", entityType: "PasswordResetAttempt", metadata: { emailFingerprint: emailHash.slice(0, 12), ipFingerprint: ipHash.slice(0, 12) } } });
    return { success: GENERIC_RESPONSE };
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, role: true } });
  await prisma.auditLog.create({ data: { actorId: user?.id, module: "AUTH", action: "PASSWORD_RESET_REQUESTED", entityType: "User", entityId: user?.id, metadata: { emailFingerprint: emailHash.slice(0, 12), homeownerAccount: user?.role === Role.HOMEOWNER } } });
  if (!user || user.role !== Role.HOMEOWNER) return { success: GENERIC_RESPONSE };

  const policy = await getPasswordPolicy();
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = fingerprint(rawToken);
  const expiresAt = new Date(Date.now() + policy.expiryMinutes * 60 * 1000);
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, requestedIpHash: ipHash, expiresAt } }),
  ]);
  const resetUrl = `${requestBaseUrl(requestHeaders)}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const log = await sendEmailNotification({
    recipientId: user.id,
    email: user.email,
    subject: "Reset your HOA Digital Hub password",
    heading: "Secure password recovery",
    message: `Hello ${user.name},\nA password reset was requested for your homeowner account. This secure link expires in ${policy.expiryMinutes} minutes and can be used only once.\nIf you did not request this change, you can safely ignore this email.`,
    type: NotificationType.PASSWORD_RESET,
    actionLabel: "Reset password",
    actionUrl: resetUrl,
  });
  const sent = log.status === NotificationStatus.SENT;
  if (!sent) await prisma.passwordResetToken.updateMany({ where: { tokenHash, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.auditLog.create({ data: { actorId: user.id, module: "AUTH", action: sent ? "PASSWORD_RESET_EMAIL_SENT" : "PASSWORD_RESET_EMAIL_FAILED", entityType: "User", entityId: user.id, metadata: { notificationLogId: log.id, expiresAt: expiresAt.toISOString(), error: sent ? null : log.errorMessage } } });
  return { success: GENERIC_RESPONSE };
}

export async function resetPasswordAction(_state: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const rawToken = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const tokenHash = tokenFingerprint(rawToken);
  if (!tokenHash) return failedReset("This reset link is invalid. Request a new link.");
  const policy = await getPasswordPolicy();
  const passwordError = validatePassword(password, confirmPassword, policy);
  if (passwordError) return { error: passwordError };
  const token = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, select: { id: true, userId: true, usedAt: true, expiresAt: true } });
  if (!token || token.usedAt || token.expiresAt <= new Date()) return failedReset("This reset link is invalid or has expired. Request a new link.", token?.userId, tokenHash);

  try {
    await prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({ where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (consumed.count !== 1) throw new Error("RESET_TOKEN_ALREADY_USED");
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash: await hash(password, 12) } });
      await tx.passwordResetToken.updateMany({ where: { userId: token.userId, usedAt: null }, data: { usedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: token.userId, module: "AUTH", action: "PASSWORD_RESET_COMPLETED", entityType: "User", entityId: token.userId, metadata: { resetTokenId: token.id } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch {
    return failedReset("This reset link has already been used. Request a new link.", token.userId, tokenHash);
  }
  await deleteSession();
  redirect("/login?reset=success");
}

export async function getValidResetToken(rawToken: string) {
  const tokenHash = tokenFingerprint(rawToken);
  if (!tokenHash) return null;
  return prisma.passwordResetToken.findFirst({ where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } }, select: { expiresAt: true } });
}

function validatePassword(password: string, confirmation: string, policy: Awaited<ReturnType<typeof getPasswordPolicy>>) {
  if (password !== confirmation) return "Passwords do not match.";
  if (password.length < policy.minLength) return `Password must contain at least ${policy.minLength} characters.`;
  if (password.length > 72) return "Password must not exceed 72 characters.";
  if (policy.requireUppercase && !/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
  if (policy.requireLowercase && !/[a-z]/.test(password)) return "Password must include a lowercase letter.";
  if (policy.requireNumber && !/\d/.test(password)) return "Password must include a number.";
  if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password)) return "Password must include a special character.";
  return null;
}

async function failedReset(message: string, actorId?: string, tokenHash?: string): Promise<ResetPasswordState> {
  await prisma.auditLog.create({ data: { actorId, module: "AUTH", action: "PASSWORD_RESET_FAILED", entityType: "User", entityId: actorId, metadata: { reason: message, tokenFingerprint: tokenHash?.slice(0, 12) } } });
  return { error: message };
}

function tokenFingerprint(rawToken: string) { return /^[A-Za-z0-9_-]{40,100}$/.test(rawToken) ? fingerprint(rawToken) : null; }
function fingerprint(value: string) { return createHash("sha256").update(value).digest("hex"); }
function clientIp(input: Headers) { return input.get("x-forwarded-for")?.split(",")[0]?.trim() || input.get("x-real-ip")?.trim() || "unknown"; }
function requestBaseUrl(input: Headers) {
  const configured = process.env.APP_URL?.trim() || process.env.PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const host = (input.get("x-forwarded-host") || input.get("host") || "localhost:3000").toLowerCase();
  const safeHost = host === "localhost:3000" || host === "127.0.0.1:3000" || host.endsWith(".tail2abf68.ts.net");
  if (!safeHost) return "http://localhost:3000";
  return `${input.get("x-forwarded-proto") || (host.includes("localhost") || host.startsWith("127.") ? "http" : "https")}://${host}`;
}
