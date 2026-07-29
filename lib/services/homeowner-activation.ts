import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { HomeownerActivationStatus, HomeownerEmailVerificationStatus, NotificationStatus, NotificationType, Prisma, Role } from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";
import { prepareSession } from "@/lib/auth";
import { platformPrisma, prisma } from "@/lib/db";
import { sendEmailNotification } from "@/lib/services/notifications";
import { getAssociationSettings } from "@/lib/system-settings";
import { tenantCanSignIn } from "@/lib/tenant";
import { runWithTenant, setTenantContext } from "@/lib/tenant-context";

const ACTIVATION_TTL_DAYS = 7;
const GENERIC_EMAIL_VERIFICATION_ERROR = "This email verification link is invalid or no longer active. Ask HOA staff to send a new activation invitation.";

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
  const appUrl = getAppUrl();
  const emailVerificationUrl = input.emailVerificationToken ? `${appUrl}/activate/verify?token=${encodeURIComponent(input.emailVerificationToken)}` : `${appUrl}/activate`;
  const activationUrl = emailVerificationUrl;
  const association = await getAssociationSettings(input.tenantId);
  const textMessage = activationEmailText({ ...input, activationUrl, emailVerificationUrl, association });
  const html = activationEmailHtml({ ...input, activationUrl, emailVerificationUrl, association, appUrl });
  try {
    const notification = await sendEmailNotification({
      tenantId: input.tenantId,
      recipientId: input.userId,
      email: input.email,
      subject: "Activate your HOAHub homeowner account",
      heading: "Homeowner account activation",
      message: textMessage,
      type: NotificationType.WELCOME,
      actionLabel: "Verify email and activate account",
      actionUrl: emailVerificationUrl,
      html,
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
  if (!value || value.length > 512) return { error: GENERIC_EMAIL_VERIFICATION_ERROR } as const;
  const record = await platformPrisma.homeownerEmailVerificationToken.findUnique({
    where: { tokenHash: hashOpaqueToken(value) },
    include: { user: { include: { homeownerProfile: true, tenant: true } } },
  });
  if (!record) return { error: GENERIC_EMAIL_VERIFICATION_ERROR } as const;
  const profile = record.user.homeownerProfile;
  if (!profile || profile.tenantId !== record.tenantId || record.user.role !== Role.HOMEOWNER || !record.user.active) return { error: GENERIC_EMAIL_VERIFICATION_ERROR } as const;
  if (record.usedAt || record.expiresAt <= new Date()) return { error: GENERIC_EMAIL_VERIFICATION_ERROR } as const;

  const now = new Date();
  try {
    await runWithTenant(record.tenantId, () => prisma.$transaction(async (tx) => {
      const scopedRecord = await tx.homeownerEmailVerificationToken.findFirst({
        where: { id: record.id, tokenHash: record.tokenHash, tenantId: record.tenantId, userId: record.userId, usedAt: null, expiresAt: { gt: now } },
        include: { user: { include: { homeownerProfile: true } } },
      });
      const scopedProfile = scopedRecord?.user.homeownerProfile;
      if (!scopedRecord || !scopedProfile || scopedProfile.id !== profile.id || scopedProfile.tenantId !== record.tenantId || scopedRecord.user.role !== Role.HOMEOWNER || !scopedRecord.user.active) {
        throw new Error(GENERIC_EMAIL_VERIFICATION_ERROR);
      }
      const activeCredential = await tx.homeownerActivationCredential.findFirst({
        where: { tenantId: record.tenantId, userId: record.userId, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
      });
      if (!activeCredential) throw new Error(GENERIC_EMAIL_VERIFICATION_ERROR);
      await tx.homeownerEmailVerificationToken.update({ where: { id: scopedRecord.id }, data: { usedAt: now } });
      await tx.homeownerProfile.update({
        where: { tenantId_id: { tenantId: scopedProfile.tenantId, id: scopedProfile.id } },
        data: {
          emailStatus: HomeownerEmailVerificationStatus.VERIFIED,
          emailVerifiedAt: scopedProfile.emailVerifiedAt ?? now,
          activationStatus: scopedProfile.activatedAt ? HomeownerActivationStatus.ACTIVE : HomeownerActivationStatus.PASSWORD_CREATION_REQUIRED,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: record.tenantId,
          actorId: record.userId,
          module: "AUTH",
          action: "HOMEOWNER_EMAIL_VERIFIED",
          entityType: "HomeownerProfile",
          entityId: scopedProfile.id,
          metadata: { method: "activation_email_link", credentialPresent: true },
        },
      });
    }), { role: Role.HOMEOWNER });
  } catch {
    return { error: GENERIC_EMAIL_VERIFICATION_ERROR } as const;
  }
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
  const passwordHash = await hash(input.password, 12);
  await runWithTenant(input.tenantId, () => prisma.$transaction([
    prisma.user.update({ where: { id: input.userId }, data: { passwordHash, lastLoginAt: now } }),
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
  ]), { role: Role.HOMEOWNER });
}

export async function completeHomeownerActivation(input: {
  accountNumber: string;
  email: string;
  temporaryPassword: string;
  password: string;
  failSessionCreateForTest?: boolean;
}) {
  const verification = await verifyHomeownerActivationCredential({
    accountNumber: input.accountNumber,
    email: input.email,
    temporaryPassword: input.temporaryPassword,
  });
  if ("error" in verification) return verification;
  const { profile, credential } = verification;
  if (!tenantCanSignIn(profile.user.tenant)) return { error: profile.user.tenant.advisories[0]?.message || "This HOA portal is currently unavailable." } as const;
  const preparedSession = await prepareSession({
    userId: profile.userId,
    role: profile.user.role,
    tenantId: profile.tenantId,
    tenantSlug: profile.user.tenant.slug,
  });
  const passwordHash = await hash(input.password, 12);
  const now = new Date();

  try {
    await runWithTenant(profile.tenantId, () => prisma.$transaction(async (tx) => {
      const currentProfile = await tx.homeownerProfile.findFirst({
        where: {
          id: profile.id,
          tenantId: profile.tenantId,
          userId: profile.userId,
          user: {
            id: profile.userId,
            tenantId: profile.tenantId,
            email: normalizeActivationEmail(input.email),
            role: Role.HOMEOWNER,
            active: true,
          },
        },
        include: { user: { include: { tenant: true } } },
      });
      if (!currentProfile || currentProfile.user.tenantId !== currentProfile.tenantId) throw new Error("Activation details could not be confirmed.");
      if (currentProfile.emailStatus !== HomeownerEmailVerificationStatus.VERIFIED) throw new Error("Verify your registered email before creating your permanent password.");
      if (currentProfile.activationStatus === HomeownerActivationStatus.ACTIVE && currentProfile.activatedAt) throw new Error("This homeowner account is already activated.");

      const currentCredential = await tx.homeownerActivationCredential.findFirst({
        where: {
          id: credential.id,
          tenantId: currentProfile.tenantId,
          userId: currentProfile.userId,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      });
      if (!currentCredential || !(await compare(input.temporaryPassword, currentCredential.credentialHash))) {
        throw new Error("Activation details do not match an active homeowner account.");
      }

      await tx.userSession.updateMany({
        where: { tenantId: currentProfile.tenantId, userId: currentProfile.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.user.update({ where: { id: currentProfile.userId }, data: { passwordHash, lastLoginAt: now } });
      await tx.homeownerActivationCredential.update({ where: { id: currentCredential.id }, data: { usedAt: now } });
      await tx.homeownerEmailVerificationToken.updateMany({
        where: { tenantId: currentProfile.tenantId, userId: currentProfile.userId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.homeownerProfile.update({
        where: { tenantId_id: { tenantId: currentProfile.tenantId, id: currentProfile.id } },
        data: {
          activationStatus: HomeownerActivationStatus.ACTIVE,
          emailStatus: HomeownerEmailVerificationStatus.VERIFIED,
          emailVerifiedAt: currentProfile.emailVerifiedAt ?? now,
          activatedAt: now,
        },
      });
      if (input.failSessionCreateForTest && process.env.HOAHUB_AUTH_TEST_HOOKS === "true") throw new Error("SIMULATED_USER_SESSION_CREATE_FAILURE");
      await tx.userSession.create({ data: preparedSession.data });
      await tx.auditLog.create({
        data: {
          tenantId: currentProfile.tenantId,
          actorId: currentProfile.userId,
          module: "AUTH",
          action: "HOMEOWNER_ACTIVATED",
          entityType: "User",
          entityId: currentProfile.userId,
          metadata: { sessionCreated: true },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }), { role: Role.HOMEOWNER });
  } catch (error) {
    return { error: error instanceof Error && error.message !== "SIMULATED_USER_SESSION_CREATE_FAILURE" ? error.message : "Activation could not be completed. Please try again or ask HOA staff to send a new activation invitation." } as const;
  }

  return { profile, credential, session: preparedSession } as const;
}

function activationEmailErrorCategory(message: string) {
  if (/not configured|username|password|sender/i.test(message)) return "CONFIGURATION";
  if (/authentication|invalid login|535|EAUTH/i.test(message)) return "AUTHENTICATION";
  if (/timeout|timed out|connection|ECONN|ETIMEDOUT/i.test(message)) return "CONNECTION";
  if (/recipient|mailbox|address/i.test(message)) return "RECIPIENT";
  return "PROVIDER";
}

type AssociationSettings = Awaited<ReturnType<typeof getAssociationSettings>>;

function activationEmailText(input: {
  name: string;
  accountNumber: string;
  temporaryPassword: string;
  expiresAt: Date;
  activationUrl: string;
  emailVerificationUrl: string;
  association: AssociationSettings;
}) {
  return [
    "SECTION 1 - HEADER",
    `${input.association.name} - HOAHub homeowner activation`,
    "",
    "SECTION 2 - WELCOME",
    `Hello ${input.name},`,
    `${input.association.name} enabled digital access for your homeowner account.`,
    "",
    "SECTION 3 - ACCOUNT CREDENTIAL CARD",
    `Activation page: ${input.activationUrl}`,
    `11-digit Account Number: ${input.accountNumber}`,
    `One-Time Temporary Password: ${input.temporaryPassword}`,
    `Expiration: ${activationExpiryLabel(input.expiresAt)}`,
    "",
    "SECTION 4 - PRIMARY ACTION",
    `Verify Email and Continue Activation: ${input.emailVerificationUrl}`,
    "",
    "SECTION 5 - FIRST-TIME SETUP",
    "1. Verify registered email.",
    "2. Open the activation page.",
    "3. Enter account number and temporary password.",
    "4. Create permanent password.",
    "5. Sign in to the correct tenant.",
    "6. Optionally enable passkey.",
    "7. Install the PWA.",
    "",
    "SECTION 6 - PASSWORD POLICY",
    "- 6 to 24 characters",
    "- at least one letter",
    "- at least one number",
    "- never reuse the temporary password",
    "",
    "SECTION 7 - INSTALLATION GUIDE",
    "Android Chrome",
    "- Open HOAHub in Chrome.",
    "- Open browser menu.",
    "- Select Install app or Add to Home screen.",
    "iPhone Safari",
    "- Open HOAHub in Safari.",
    "- Tap Share.",
    "- Select Add to Home Screen.",
    "Desktop Chrome / Edge",
    "- Open HOAHub.",
    "- Select the install icon in the address bar.",
    "- Confirm installation.",
    "",
    "SECTION 8 - SECURITY WARNING",
    "- temporary password is single-use",
    "- do not share the password or verification link",
    "- HOA staff will never ask for the permanent password",
    "- HOA staff cannot view the permanent password",
    "",
    "SECTION 9 - SUPPORT",
    supportText(input.association),
  ].join("\n");
}

function activationEmailHtml(input: {
  name: string;
  accountNumber: string;
  temporaryPassword: string;
  expiresAt: Date;
  activationUrl: string;
  emailVerificationUrl: string;
  association: AssociationSettings;
  appUrl: string;
}) {
  const logoUrl = absoluteUrl(input.association.logoUrl, input.appUrl);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>HOAHub homeowner activation</title></head><body style="margin:0;background:#eef8fc;font-family:Arial,Helvetica,sans-serif;color:#11384f"><div style="padding:20px 12px"><div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #d7eaf2;border-radius:18px;overflow:hidden">
    <div style="background:#0a3b57;color:#fff;padding:22px 24px">${logoUrl ? `<img src="${escapeAttribute(logoUrl)}" width="58" height="58" alt="" style="display:block;border-radius:50%;background:#fff;object-fit:contain;margin-bottom:12px">` : ""}<h1 style="margin:0;font-size:22px;line-height:1.25">${escapeHtml(input.association.name)}</h1><p style="margin:6px 0 0;color:#dff8d2;font-weight:700">HOAHub homeowner activation</p></div>
    <div style="padding:24px">
      ${section("WELCOME", `<h2 style="margin:0 0 8px;font-size:22px;line-height:1.25">Welcome, ${escapeHtml(input.name)}</h2><p style="margin:0;line-height:1.6">${escapeHtml(input.association.name)} enabled digital access for your homeowner account.</p>`)}
      ${section("ACCOUNT CREDENTIAL CARD", credentialRows([
        ["Activation page", input.activationUrl, false],
        ["11-digit Account Number", input.accountNumber, true],
        ["One-Time Temporary Password", input.temporaryPassword, true],
        ["Expiration", activationExpiryLabel(input.expiresAt), false],
      ]))}
      ${section("PRIMARY ACTION", `<a href="${escapeAttribute(input.emailVerificationUrl)}" style="display:block;background:#078bc9;color:#fff;text-decoration:none;text-align:center;font-weight:800;padding:15px 18px;border-radius:12px;font-size:16px">Verify Email and Continue Activation</a>`)}
      ${section("FIRST-TIME SETUP", orderedList(["Verify registered email.", "Open the activation page.", "Enter account number and temporary password.", "Create permanent password.", "Sign in to the correct tenant.", "Optionally enable passkey.", "Install the PWA."]))}
      ${section("PASSWORD POLICY", bulletList(["6 to 24 characters", "at least one letter", "at least one number", "never reuse the temporary password"]))}
      ${section("INSTALLATION GUIDE", installGuide())}
      ${section("SECURITY WARNING", bulletList(["temporary password is single-use", "do not share the password or verification link", "HOA staff will never ask for the permanent password", "HOA staff cannot view the permanent password"]))}
      ${section("SUPPORT", `<p style="margin:0;line-height:1.7">${escapeHtml(supportText(input.association)).replaceAll("\n", "<br>")}</p>`)}
    </div>
  </div></div></body></html>`;
}

function section(label: string, body: string) {
  return `<section style="margin:0 0 22px"><p style="margin:0 0 10px;color:#078bc9;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.12em">${escapeHtml(label)}</p>${body}</section>`;
}

function credentialRows(rows: Array<[string, string, boolean]>) {
  return `<div style="border:1px solid #d7eaf2;border-radius:14px;overflow:hidden">${rows.map(([label, value, code]) => `<div style="padding:13px 14px;border-bottom:1px solid #e7f1f6"><p style="margin:0 0 5px;color:#60747e;font-size:12px;font-weight:800;text-transform:uppercase">${escapeHtml(label)}</p><p style="margin:0;${code ? "font-family:Consolas,Menlo,monospace;font-size:18px;letter-spacing:.04em;background:#f5fafc;border-radius:10px;padding:10px;word-break:break-all" : "line-height:1.5;word-break:break-word"}">${escapeHtml(value)}</p></div>`).join("")}</div>`;
}

function orderedList(items: string[]) {
  return `<ol style="margin:0;padding-left:22px;line-height:1.7">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;
}

function bulletList(items: string[]) {
  return `<ul style="margin:0;padding-left:22px;line-height:1.7">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function installGuide() {
  const groups = [
    ["Android Chrome", ["Open HOAHub in Chrome.", "Open browser menu.", "Select Install app or Add to Home screen."]],
    ["iPhone Safari", ["Open HOAHub in Safari.", "Tap Share.", "Select Add to Home Screen."]],
    ["Desktop Chrome / Edge", ["Open HOAHub.", "Select the install icon in the address bar.", "Confirm installation."]],
  ];
  return `<div style="display:block">${groups.map(([title, items]) => `<div style="margin:0 0 12px;padding:14px;border:1px solid #e7f1f6;border-radius:12px;background:#f8fcfd"><h3 style="margin:0 0 8px;font-size:15px">${escapeHtml(title as string)}</h3>${bulletList(items as string[])}</div>`).join("")}</div>`;
}

function activationExpiryLabel(value: Date) {
  return value.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

function supportText(association: AssociationSettings) {
  return [
    association.email ? `Email: ${association.email}` : "",
    association.contactNumber ? `Contact: ${association.contactNumber}` : "",
    association.address ? `Office: ${association.address}` : "",
  ].filter(Boolean).join("\n") || "Contact your HOA office.";
}

function absoluteUrl(value: string, appUrl: string) {
  if (!value) return "";
  try { return new URL(value, `${appUrl}/`).toString(); } catch { return ""; }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
