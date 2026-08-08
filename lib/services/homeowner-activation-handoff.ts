import "server-only";

import { HomeownerActivationStatus, HomeownerEmailVerificationStatus, Prisma, Role } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import { prepareSession } from "@/lib/auth";
import { platformPrisma, prisma } from "@/lib/db";
import { hashOpaqueToken, normalizeActivationEmail, temporaryActivationPasswordForVerificationToken } from "@/lib/services/homeowner-activation";
import { tenantCanSignIn } from "@/lib/tenant";
import { runWithTenant, setTenantContext } from "@/lib/tenant-context";

export const ACTIVATION_HANDOFF_COOKIE = "hoa_activation_handoff";
export const ACTIVATION_HANDOFF_MAX_AGE_SECONDS = 15 * 60;

const configuredSecret = process.env.AUTH_SECRET;
if (process.env.NODE_ENV === "production" && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error("AUTH_SECRET must contain at least 32 characters in production.");
}
const secret = new TextEncoder().encode(configuredSecret || "development-only-secret-change-me-now");
const GENERIC_HANDOFF_ERROR = "This activation handoff is invalid or has expired. Open the newest activation email and click Verify Email and Continue Activation again.";

type ActivationHandoffPayload = {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  profileId: string;
  credentialId: string;
  temporaryPassword?: string;
};

export type ActivationHandoffDetails = {
  accountNumber: string;
  email: string;
  tenantName: string;
  tenantSlug: string;
  propertyLabel: string;
  temporaryPassword: string;
};

export async function createActivationHandoffFromVerifiedToken(rawToken: string) {
  const value = String(rawToken || "").trim();
  if (!value || value.length > 512) return { error: GENERIC_HANDOFF_ERROR } as const;

  const record = await platformPrisma.homeownerEmailVerificationToken.findUnique({
    where: { tokenHash: hashOpaqueToken(value) },
    include: { user: { include: { homeownerProfile: true, tenant: true } } },
  });
  const profile = record?.user.homeownerProfile;
  if (!record || !record.usedAt || record.expiresAt <= new Date() || !profile || !record.user.active || record.user.role !== Role.HOMEOWNER) {
    return { error: GENERIC_HANDOFF_ERROR } as const;
  }
  if (profile.tenantId !== record.tenantId || profile.emailStatus !== HomeownerEmailVerificationStatus.VERIFIED) {
    return { error: GENERIC_HANDOFF_ERROR } as const;
  }

  const credential = await platformPrisma.homeownerActivationCredential.findFirst({
    where: {
      tenantId: record.tenantId,
      userId: record.userId,
      usedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!credential) return { error: GENERIC_HANDOFF_ERROR } as const;

  const candidateTemporaryPassword = temporaryActivationPasswordForVerificationToken(value);
  const temporaryPassword = await compare(candidateTemporaryPassword, credential.credentialHash)
    ? candidateTemporaryPassword
    : "";

  const payload: ActivationHandoffPayload = {
    tenantId: record.tenantId,
    tenantSlug: record.user.tenant.slug,
    userId: record.userId,
    profileId: profile.id,
    credentialId: credential.id,
    temporaryPassword,
  };
  const handoff = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACTIVATION_HANDOFF_MAX_AGE_SECONDS}s`)
    .setAudience("homeowner-activation")
    .sign(secret);

  return {
    handoff,
    details: {
      accountNumber: profile.accountNumber || "",
      email: record.user.email,
      tenantName: record.user.tenant.name,
      tenantSlug: record.user.tenant.slug,
      propertyLabel: `Block ${profile.block}, Lot ${profile.lot}`,
      temporaryPassword,
    } satisfies ActivationHandoffDetails,
  } as const;
}

export async function readActivationHandoff(handoff: string | null | undefined): Promise<ActivationHandoffPayload | null> {
  const token = String(handoff || "").trim();
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { audience: "homeowner-activation" });
    const parsed: ActivationHandoffPayload = {
      tenantId: typeof payload.tenantId === "string" ? payload.tenantId : "",
      tenantSlug: typeof payload.tenantSlug === "string" ? payload.tenantSlug : "",
      userId: typeof payload.userId === "string" ? payload.userId : "",
      profileId: typeof payload.profileId === "string" ? payload.profileId : "",
      credentialId: typeof payload.credentialId === "string" ? payload.credentialId : "",
      temporaryPassword: typeof payload.temporaryPassword === "string" ? payload.temporaryPassword : "",
    };
    return parsed.tenantId && parsed.tenantSlug && parsed.userId && parsed.profileId && parsed.credentialId ? parsed : null;
  } catch {
    return null;
  }
}

export async function getActivationHandoffDetails(handoff: string | null | undefined) {
  const payload = await readActivationHandoff(handoff);
  if (!payload) return null;
  const profile = await platformPrisma.homeownerProfile.findFirst({
    where: {
      id: payload.profileId,
      tenantId: payload.tenantId,
      userId: payload.userId,
      emailStatus: HomeownerEmailVerificationStatus.VERIFIED,
      user: { active: true, role: Role.HOMEOWNER, tenant: { slug: payload.tenantSlug, status: "ACTIVE", subscriptionStatus: { not: "CANCELLED" } } },
    },
    include: { user: { include: { tenant: true } } },
  });
  if (!profile) return null;
  const credential = await platformPrisma.homeownerActivationCredential.findFirst({
    where: { id: payload.credentialId, tenantId: payload.tenantId, userId: payload.userId, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (!credential) return null;
  return {
    accountNumber: profile.accountNumber || "",
    email: profile.user.email,
    tenantName: profile.user.tenant.name,
    tenantSlug: profile.user.tenant.slug,
    propertyLabel: `Block ${profile.block}, Lot ${profile.lot}`,
    temporaryPassword: payload.temporaryPassword || "",
  } satisfies ActivationHandoffDetails;
}

export async function completeHomeownerActivationFromHandoff(input: { handoff: string; email: string; password: string }) {
  const payload = await readActivationHandoff(input.handoff);
  if (!payload) return { error: GENERIC_HANDOFF_ERROR } as const;

  const profile = await platformPrisma.homeownerProfile.findFirst({
    where: { id: payload.profileId, tenantId: payload.tenantId, userId: payload.userId },
    include: {
      user: {
        include: {
          tenant: { include: { advisories: { where: { active: true }, orderBy: { createdAt: "desc" }, take: 1 }, moduleEntitlements: true } },
        },
      },
    },
  });
  if (!profile || !profile.user.active || profile.user.role !== Role.HOMEOWNER || profile.user.tenant.slug !== payload.tenantSlug) {
    return { error: GENERIC_HANDOFF_ERROR } as const;
  }
  if (normalizeActivationEmail(input.email) !== normalizeActivationEmail(profile.user.email)) {
    return { error: "Enter the same registered email address that received this activation invitation." } as const;
  }
  if (!tenantCanSignIn(profile.user.tenant)) return { error: profile.user.tenant.advisories[0]?.message || "This HOA portal is currently unavailable." } as const;
  if (profile.activationStatus === HomeownerActivationStatus.DISABLED) return { error: "This homeowner activation has been disabled. Contact the HOA office." } as const;
  if (profile.activationStatus === HomeownerActivationStatus.CANCELLED) return { error: "This homeowner activation invitation was cancelled. Contact the HOA office." } as const;
  if (profile.activationStatus === HomeownerActivationStatus.ACTIVE && profile.activatedAt) return { error: "This homeowner account is already activated. Use the login page to sign in." } as const;
  if (profile.emailStatus !== HomeownerEmailVerificationStatus.VERIFIED) return { error: GENERIC_HANDOFF_ERROR } as const;

  setTenantContext({
    tenantId: profile.tenantId,
    role: Role.HOMEOWNER,
    roles: [Role.HOMEOWNER],
    platform: false,
    enabledModules: new Set(profile.user.tenant.moduleEntitlements.filter((item) => item.enabled).map((item) => item.module)),
  });

  const credential = await prisma.homeownerActivationCredential.findFirst({
    where: { id: payload.credentialId, tenantId: profile.tenantId, userId: profile.userId, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!credential) return { error: GENERIC_HANDOFF_ERROR } as const;

  const preparedSession = await prepareSession({
    userId: profile.userId,
    role: Role.HOMEOWNER,
    roles: [Role.HOMEOWNER],
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
          emailStatus: HomeownerEmailVerificationStatus.VERIFIED,
          user: { id: profile.userId, tenantId: profile.tenantId, role: Role.HOMEOWNER, active: true },
        },
        include: { user: true },
      });
      if (!currentProfile || currentProfile.activationStatus === HomeownerActivationStatus.ACTIVE || currentProfile.activatedAt) {
        throw new Error("This homeowner account is already activated. Use the login page to sign in.");
      }
      if (normalizeActivationEmail(currentProfile.user.email) !== normalizeActivationEmail(input.email)) {
        throw new Error("Enter the same registered email address that received this activation invitation.");
      }
      const currentCredential = await tx.homeownerActivationCredential.findFirst({
        where: { id: credential.id, tenantId: profile.tenantId, userId: profile.userId, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      });
      if (!currentCredential) throw new Error(GENERIC_HANDOFF_ERROR);

      await tx.userSession.updateMany({ where: { tenantId: profile.tenantId, userId: profile.userId, revokedAt: null }, data: { revokedAt: now } });
      await tx.user.update({ where: { id: profile.userId }, data: { passwordHash, lastLoginAt: now } });
      await tx.homeownerActivationCredential.update({ where: { id: currentCredential.id }, data: { usedAt: now } });
      await tx.homeownerEmailVerificationToken.updateMany({ where: { tenantId: profile.tenantId, userId: profile.userId, usedAt: null }, data: { usedAt: now } });
      await tx.homeownerProfile.update({
        where: { tenantId_id: { tenantId: profile.tenantId, id: profile.id } },
        data: {
          activationStatus: HomeownerActivationStatus.ACTIVE,
          emailStatus: HomeownerEmailVerificationStatus.VERIFIED,
          emailVerifiedAt: currentProfile.emailVerifiedAt ?? now,
          activatedAt: now,
        },
      });
      await tx.userSession.create({ data: preparedSession.data });
      await tx.auditLog.create({
        data: {
          tenantId: profile.tenantId,
          actorId: profile.userId,
          module: "AUTH",
          action: "HOMEOWNER_ACTIVATED",
          entityType: "User",
          entityId: profile.userId,
          metadata: { sessionCreated: true, activationMode: "verified_email_handoff", termsAccepted: true },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }), { role: Role.HOMEOWNER });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Activation could not be completed. Please try again or ask HOA staff to send a new activation invitation." } as const;
  }

  return { session: preparedSession, tenantSlug: profile.user.tenant.slug } as const;
}
