import "server-only";

import { createHash } from "node:crypto";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture, RegistrationResponseJSON, WebAuthnCredential } from "@simplewebauthn/server";
import { HomeownerActivationStatus, PasskeyChallengeType, Role } from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";
import { platformPrisma, prisma } from "@/lib/db";
import { normalizeAccountNumber, normalizeActivationEmail } from "@/lib/services/homeowner-activation";
import { setTenantContext } from "@/lib/tenant-context";
import { resolveTenant, tenantCanSignIn } from "@/lib/tenant";

const PASSKEY_TIMEOUT_MS = 60_000;
const CHALLENGE_TTL_MS = 5 * 60_000;

export function passkeyRp() {
  const appUrl = getAppUrl();
  const url = new URL(appUrl);
  return {
    rpName: "HOAHub",
    rpID: url.hostname,
    origin: url.origin,
  };
}

export function base64UrlFromBytes(value: Uint8Array) {
  return Buffer.from(value).toString("base64url");
}

export function bytesFromBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

export function passkeyChallengeHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function generatePasskeyRegistrationOptions(input: { userId: string; tenantId: string; name: string; email: string }) {
  const rp = passkeyRp();
  const existing = await prisma.userPasskeyCredential.findMany({
    where: { tenantId: input.tenantId, userId: input.userId },
    select: { credentialId: true, transports: true },
  });
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userID: Buffer.from(input.userId),
    userName: input.email,
    userDisplayName: input.name,
    timeout: PASSKEY_TIMEOUT_MS,
    attestationType: "none",
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
    excludeCredentials: existing.map((credential) => ({
      id: credential.credentialId,
      transports: transportsFromJson(credential.transports),
    })),
  });
  await prisma.userPasskeyChallenge.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      challengeHash: passkeyChallengeHash(options.challenge),
      type: PasskeyChallengeType.REGISTRATION,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
  return options;
}

export async function verifyPasskeyRegistration(input: { userId: string; tenantId: string; response: RegistrationResponseJSON; deviceName?: string }) {
  let challengeId = "";
  const rp = passkeyRp();
  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    requireUserVerification: false,
    expectedChallenge: async (challenge) => {
      const record = await prisma.userPasskeyChallenge.findFirst({
        where: {
          tenantId: input.tenantId,
          userId: input.userId,
          challengeHash: passkeyChallengeHash(challenge),
          type: PasskeyChallengeType.REGISTRATION,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      challengeId = record?.id || "";
      return Boolean(record);
    },
  });
  if (!verification.verified || !verification.registrationInfo || !challengeId) throw new Error("Passkey registration could not be verified.");

  const credential = verification.registrationInfo.credential;
  await prisma.$transaction([
    prisma.userPasskeyChallenge.update({ where: { id: challengeId }, data: { usedAt: new Date() } }),
    prisma.userPasskeyCredential.upsert({
      where: { credentialId: credential.id },
      create: {
        tenantId: input.tenantId,
        userId: input.userId,
        credentialId: credential.id,
        publicKey: base64UrlFromBytes(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: input.response.response.transports ?? [],
        deviceName: input.deviceName?.slice(0, 120) || null,
        backedUp: verification.registrationInfo.credentialBackedUp,
      },
      update: {
        publicKey: base64UrlFromBytes(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: input.response.response.transports ?? [],
        deviceName: input.deviceName?.slice(0, 120) || null,
        backedUp: verification.registrationInfo.credentialBackedUp,
      },
    }),
    prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.userId,
        module: "AUTH",
        action: "PASSKEY_REGISTERED",
        entityType: "User",
        entityId: input.userId,
      },
    }),
  ]);
}

export async function findPasskeyLoginUser(input: { email?: string; accountNumber?: string; identifier?: string; tenantSlug?: string }) {
  const identifier = String(input.identifier || "").trim();
  const accountNumber = normalizeAccountNumber(input.accountNumber || (/^\d{11}$/.test(identifier) ? identifier : ""));
  const email = normalizeActivationEmail(input.email || (accountNumber ? "" : identifier));
  const tenantSlug = String(input.tenantSlug || "").trim().toLowerCase();
  if (tenantSlug) {
    const tenant = await resolveTenant(tenantSlug);
    if (!tenant) return { error: "HOA portal not found." } as const;
    if (!tenantCanSignIn(tenant)) return { error: tenant.advisories[0]?.message || "This HOA portal is currently unavailable." } as const;
    const user = await platformPrisma.user.findFirst({
      where: {
        tenantId: tenant.id,
        ...(accountNumber ? {} : { email }),
        active: true,
        role: Role.HOMEOWNER,
        homeownerProfile: { status: "ACTIVE", activationStatus: HomeownerActivationStatus.ACTIVE, activatedAt: { not: null }, ...(accountNumber ? { accountNumber } : {}) },
      },
      include: { homeownerProfile: true, tenant: { include: { advisories: { where: { active: true }, orderBy: { createdAt: "desc" }, take: 1 }, moduleEntitlements: true } }, passkeyCredentials: true },
    });
    if (!user) return { error: "No passkey-enabled homeowner account was found." } as const;
    if (!user.passkeyCredentials.length) return { error: "No passkey is enrolled for this homeowner account." } as const;
    setTenantContext({
      tenantId: user.tenantId,
      role: user.role,
      platform: false,
      enabledModules: new Set(user.tenant.moduleEntitlements.filter((item) => item.enabled).map((item) => item.module)),
    });
    return { user } as const;
  }
  const users = await platformPrisma.user.findMany({
    where: {
      ...(accountNumber ? {} : { email }),
      active: true,
      role: Role.HOMEOWNER,
      tenant: { status: "ACTIVE", subscriptionStatus: { not: "CANCELLED" } },
      homeownerProfile: { status: "ACTIVE", activationStatus: HomeownerActivationStatus.ACTIVE, activatedAt: { not: null }, ...(accountNumber ? { accountNumber } : {}) },
    },
    include: { homeownerProfile: true, tenant: { include: { advisories: { where: { active: true }, orderBy: { createdAt: "desc" }, take: 1 }, moduleEntitlements: true } }, passkeyCredentials: true },
    take: 10,
  });
  if (!users.length) return { error: "No passkey-enabled homeowner account was found." } as const;
  let user = users[0];
  if (users.length > 1 || accountNumber) {
    if (!accountNumber) return { error: "Enter your 11-digit homeowner account number so we can identify your HOA." } as const;
    const matched = users.find((item) => item.homeownerProfile?.accountNumber === accountNumber);
    if (!matched) return { error: "The account number does not match this registered email." } as const;
    user = matched;
  }
  if (!tenantCanSignIn(user.tenant)) return { error: user.tenant.advisories[0]?.message || "This HOA portal is currently unavailable." } as const;
  if (!user.passkeyCredentials.length) return { error: "No passkey is enrolled for this homeowner account." } as const;
  setTenantContext({
    tenantId: user.tenantId,
    role: user.role,
    platform: false,
    enabledModules: new Set(user.tenant.moduleEntitlements.filter((item) => item.enabled).map((item) => item.module)),
  });
  return { user } as const;
}

export async function generatePasskeyAuthenticationOptions(input: { userId: string; tenantId: string }) {
  const rp = passkeyRp();
  const credentials = await prisma.userPasskeyCredential.findMany({
    where: { tenantId: input.tenantId, userId: input.userId },
    select: { credentialId: true, transports: true },
  });
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    timeout: PASSKEY_TIMEOUT_MS,
    userVerification: "preferred",
    allowCredentials: credentials.map((credential) => ({
      id: credential.credentialId,
      transports: transportsFromJson(credential.transports),
    })),
  });
  await prisma.userPasskeyChallenge.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      challengeHash: passkeyChallengeHash(options.challenge),
      type: PasskeyChallengeType.AUTHENTICATION,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
  return options;
}

export async function generatePasskeyDiscoveryAuthenticationOptions() {
  const rp = passkeyRp();
  return generateAuthenticationOptions({
    rpID: rp.rpID,
    timeout: PASSKEY_TIMEOUT_MS,
    userVerification: "preferred",
  });
}

export async function verifyPasskeyAuthentication(input: { response: AuthenticationResponseJSON; discoveryChallengeHash?: string }) {
  const credentialRecord = await platformPrisma.userPasskeyCredential.findUnique({
    where: { credentialId: input.response.id },
    include: { user: { include: { tenant: { include: { advisories: { where: { active: true }, orderBy: { createdAt: "desc" }, take: 1 }, moduleEntitlements: true } }, homeownerProfile: true } } },
  });
  if (!credentialRecord || !credentialRecord.user.active || credentialRecord.user.role !== Role.HOMEOWNER || credentialRecord.user.homeownerProfile?.activationStatus !== HomeownerActivationStatus.ACTIVE || !credentialRecord.user.homeownerProfile.activatedAt) {
    throw new Error("Passkey authentication could not be verified.");
  }
  if (!tenantCanSignIn(credentialRecord.user.tenant)) throw new Error(credentialRecord.user.tenant.advisories[0]?.message || "This HOA portal is currently unavailable.");

  setTenantContext({
    tenantId: credentialRecord.tenantId,
    role: credentialRecord.user.role,
    platform: false,
    enabledModules: new Set(credentialRecord.user.tenant.moduleEntitlements.filter((item) => item.enabled).map((item) => item.module)),
  });

  let challengeId = "";
  let discoveryChallengeMatched = false;
  const rp = passkeyRp();
  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    requireUserVerification: false,
    credential: toWebAuthnCredential(credentialRecord),
    expectedChallenge: async (challenge) => {
      const challengeHash = passkeyChallengeHash(challenge);
      const record = await prisma.userPasskeyChallenge.findFirst({
        where: {
          tenantId: credentialRecord.tenantId,
          userId: credentialRecord.userId,
          challengeHash,
          type: PasskeyChallengeType.AUTHENTICATION,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      challengeId = record?.id || "";
      discoveryChallengeMatched = !record && Boolean(input.discoveryChallengeHash) && input.discoveryChallengeHash === challengeHash;
      return Boolean(record) || discoveryChallengeMatched;
    },
  });
  if (!verification.verified || (!challengeId && !discoveryChallengeMatched)) throw new Error("Passkey authentication could not be verified.");

  await prisma.$transaction([
    ...(challengeId ? [prisma.userPasskeyChallenge.update({ where: { id: challengeId }, data: { usedAt: new Date() } })] : []),
    prisma.userPasskeyCredential.update({
      where: { id: credentialRecord.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        backedUp: verification.authenticationInfo.credentialBackedUp,
        lastUsedAt: new Date(),
      },
    }),
    prisma.user.update({ where: { id: credentialRecord.userId }, data: { lastLoginAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        tenantId: credentialRecord.tenantId,
        actorId: credentialRecord.userId,
        module: "AUTH",
        action: "PASSKEY_LOGIN",
        entityType: "User",
        entityId: credentialRecord.userId,
      },
    }),
  ]);

  return {
    userId: credentialRecord.userId,
    role: credentialRecord.user.role,
    tenantId: credentialRecord.tenantId,
    tenantSlug: credentialRecord.user.tenant.slug,
  };
}

function toWebAuthnCredential(credential: { credentialId: string; publicKey: string; counter: bigint; transports: unknown }): WebAuthnCredential {
  return {
    id: credential.credentialId,
    publicKey: bytesFromBase64Url(credential.publicKey),
    counter: Number(credential.counter),
    transports: transportsFromJson(credential.transports),
  };
}

function transportsFromJson(value: unknown): AuthenticatorTransportFuture[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is AuthenticatorTransportFuture => typeof item === "string");
}
