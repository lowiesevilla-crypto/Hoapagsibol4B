"use server";

import { HomeownerActivationStatus, Role } from "@prisma/client";
import { compare } from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, defaultHomeForRoles, deleteSession, readSession } from "@/lib/auth";
import {
  effectiveRolesForUser,
  isPlatformRoleSet,
  primaryRoleForRoles,
} from "@/lib/authorization/effective-access";
import { platformPrisma, prisma } from "@/lib/db";
import { clearVerifiedLoginChoices, readVerifiedLoginChoices, setVerifiedLoginChoices } from "@/lib/login-choice-cookie";
import { clearRateLimit, rateLimitAvailable, recordRateLimitFailure } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";
import { resolveTenant, tenantCanSignIn } from "@/lib/tenant";
import { setTenantContext } from "@/lib/tenant-context";
import { normalizeActivationEmail } from "@/lib/services/homeowner-activation";

export type LoginChoice = {
  userId: string;
  tenantName: string;
  tenantSlug: string;
  roleLabel: string;
  accountNumber?: string;
  propertyLabel?: string;
};

export type AuthNavigationState = { error?: string; redirectTo?: string };
export type LoginState = AuthNavigationState & { choices?: LoginChoice[] };

type ResolvedLoginUser = Awaited<ReturnType<typeof resolveLoginUser>>;
type SuccessfulLoginUser = Exclude<ResolvedLoginUser, null | { error: string } | { choices: LoginChoice[] }>;

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const selectedUserId = String(formData.get("selectedUserId") || "").trim();

  // Account selection is step two of an already verified login. The browser never
  // receives or retains the password: a short-lived HttpOnly signed cookie limits
  // selection to the user IDs proven by the first credential check.
  if (selectedUserId) {
    const allowedUserIds = await readVerifiedLoginChoices();
    if (!allowedUserIds?.includes(selectedUserId)) {
      await clearVerifiedLoginChoices();
      return { error: "Your verified sign-in has expired. Sign in again to choose an HOA account." };
    }
    const resolvedSelection = await resolveVerifiedLoginChoice(selectedUserId);
    if (!resolvedSelection) {
      await clearVerifiedLoginChoices();
      return { error: "The selected HOA account is no longer available. Sign in again." };
    }
    await clearVerifiedLoginChoices();
    return finishLogin(resolvedSelection, true);
  }

  await clearVerifiedLoginChoices();
  const parsed = loginSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Check your login details." };

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip")?.trim() || "unknown";
  const tenantSlug = String(formData.get("tenantSlug") || "").trim().toLowerCase();
  const identifier = parsed.data.identifier.trim();
  const identifierType = /^\d{11}$/.test(identifier) ? "accountNumber" : "email";
  const normalizedIdentifier = identifierType === "accountNumber" ? identifier : normalizeActivationEmail(identifier);
  const loginScope = tenantSlug || "universal";
  const [emailAllowed, ipAllowed] = await Promise.all([
    rateLimitAvailable("LOGIN_EMAIL", `${loginScope}:${identifierType}:${normalizedIdentifier}`, 8, 15 * 60 * 1000),
    rateLimitAvailable("LOGIN_IP", ip, 30, 15 * 60 * 1000),
  ]);
  if (!emailAllowed || !ipAllowed) return { error: "Too many sign-in attempts. Wait 15 minutes and try again." };

  const resolved = await resolveLoginUser({
    tenantSlug,
    identifierType,
    identifier: normalizedIdentifier,
    password: parsed.data.password,
  });
  if (!resolved || "error" in resolved) {
    await Promise.all([
      recordRateLimitFailure("LOGIN_EMAIL", `${loginScope}:${identifierType}:${normalizedIdentifier}`),
      recordRateLimitFailure("LOGIN_IP", ip),
    ]);
    return { error: resolved && "error" in resolved ? resolved.error : "Incorrect identifier or password." };
  }

  await clearRateLimit("LOGIN_EMAIL", `${loginScope}:${identifierType}:${normalizedIdentifier}`);
  if ("choices" in resolved) {
    if (!resolved.choices?.length) {
      return { error: "No eligible HOA account is available for this sign-in." };
    }
    await setVerifiedLoginChoices(resolved.choices.map((choice) => choice.userId));
    return { choices: resolved.choices };
  }

  return finishLogin(resolved, false);
}

async function finishLogin(resolved: SuccessfulLoginUser, selectedFromMultipleAccounts: boolean): Promise<LoginState> {
  const { tenant, user } = resolved;
  const roles = effectiveRolesForUser(user.role, user.userRoleAssignments);
  const role = primaryRoleForRoles(roles, user.role);

  setTenantContext({
    tenantId: tenant.id,
    role,
    roles,
    platform: isPlatformRoleSet(roles),
    enabledModules: new Set(tenant.moduleEntitlements.filter((item) => item.enabled).map((item) => item.module)),
  });

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorId: user.id,
        module: "AUTH",
        action: "TENANT_LOGIN",
        entityType: "User",
        entityId: user.id,
        metadata: { tenantSlug: tenant.slug, roles, selectedFromMultipleAccounts, identityKey: "verified_email" },
      },
    }),
  ]);

  await createSession({ userId: user.id, role, roles, tenantId: tenant.id, tenantSlug: tenant.slug });
  return { redirectTo: defaultHomeForRoles(roles, role) };
}

export async function logoutAction() {
  const session = await readSession();
  const redirectTo = await logoutRedirectForSession(session);
  await deleteSession();
  await clearVerifiedLoginChoices();
  redirect(redirectTo);
}

export async function logoutAllSessionsAction() {
  const session = await readSession();
  const redirectTo = await logoutRedirectForSession(session);
  if (!session) redirect(redirectTo);
  const roles = session.roles ?? [session.role];
  setTenantContext({
    tenantId: session.tenantId,
    role: session.role,
    roles,
    platform: isPlatformRoleSet(roles),
  });
  await prisma.userSession.updateMany({
    where: { tenantId: session.tenantId, userId: session.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await deleteSession();
  await clearVerifiedLoginChoices();
  redirect(redirectTo);
}

export async function logoutNavigationAction(_state: AuthNavigationState): Promise<AuthNavigationState> {
  const session = await readSession();
  const redirectTo = await logoutRedirectForSession(session);
  await deleteSession();
  await clearVerifiedLoginChoices();
  return { redirectTo };
}

export async function logoutAllSessionsNavigationAction(_state: AuthNavigationState): Promise<AuthNavigationState> {
  const session = await readSession();
  const redirectTo = await logoutRedirectForSession(session);
  if (!session) return { redirectTo };
  const roles = session.roles ?? [session.role];
  setTenantContext({
    tenantId: session.tenantId,
    role: session.role,
    roles,
    platform: isPlatformRoleSet(roles),
  });
  await prisma.userSession.updateMany({
    where: { tenantId: session.tenantId, userId: session.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await deleteSession();
  await clearVerifiedLoginChoices();
  return { redirectTo };
}

async function resolveLoginUser(input: {
  tenantSlug: string;
  identifierType: "email" | "accountNumber";
  identifier: string;
  password: string;
}) {
  if (input.identifierType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.identifier)) return null;
  const tenant = input.tenantSlug ? await resolveTenant(input.tenantSlug) : null;
  if (input.tenantSlug && !tenant) return null;
  if (tenant && !tenantCanSignIn(tenant)) return { error: tenant.advisories[0]?.message || "This HOA portal is currently unavailable." } as const;
  const users = await platformPrisma.user.findMany({
    where: {
      ...(tenant ? { tenantId: tenant.id } : { tenant: { status: "ACTIVE", subscriptionStatus: { not: "CANCELLED" } } }),
      active: true,
      ...(input.identifierType === "email"
        ? { email: input.identifier }
        : { homeownerProfile: { accountNumber: input.identifier } }),
    },
    include: {
      homeownerProfile: true,
      userRoleAssignments: { where: { active: true }, select: { role: true, active: true } },
      tenant: { include: { advisories: { where: { active: true }, orderBy: { createdAt: "desc" }, take: 1 }, moduleEntitlements: true } },
    },
    orderBy: [{ tenant: { name: "asc" } }, { name: "asc" }],
    take: 50,
  });
  const authorized = users.filter((candidate) => {
    if (!tenantCanSignIn(candidate.tenant)) return false;
    const roles = effectiveRolesForUser(candidate.role, candidate.userRoleAssignments);
    if (!roles.includes(Role.HOMEOWNER)) return input.identifierType === "email";
    if (!candidate.homeownerProfile) return input.identifierType === "email";
    return candidate.homeownerProfile.status === "ACTIVE"
      && candidate.homeownerProfile.emailStatus === "VERIFIED"
      && candidate.homeownerProfile.activationStatus === HomeownerActivationStatus.ACTIVE
      && Boolean(candidate.homeownerProfile.activatedAt);
  });
  const passwordMatches = [];
  for (const candidate of authorized) {
    if (await compare(input.password, candidate.passwordHash)) passwordMatches.push(candidate);
  }
  if (!passwordMatches.length) return null;

  // A verified email is the cross-tenant identity key. A valid password for any
  // linked active account proves the identity, then the user explicitly chooses
  // which isolated tenant/account session to open.
  const selectable = input.identifierType === "email" ? authorized : passwordMatches;

  if (selectable.length > 1) {
    const choices: LoginChoice[] = selectable.map((candidate) => {
      const roles = effectiveRolesForUser(candidate.role, candidate.userRoleAssignments);
      return {
        userId: candidate.id,
        tenantName: candidate.tenant.name,
        tenantSlug: candidate.tenant.slug,
        roleLabel: roles.map(formatRoleLabel).join(" / "),
        accountNumber: candidate.homeownerProfile?.accountNumber || undefined,
        propertyLabel: candidate.homeownerProfile
          ? `Block ${candidate.homeownerProfile.block}, Lot ${candidate.homeownerProfile.lot}`
          : undefined,
      };
    });
    return { choices } as const;
  }

  const user = selectable[0] || passwordMatches[0];
  return { user, tenant: user.tenant } as const;
}

async function resolveVerifiedLoginChoice(userId: string): Promise<SuccessfulLoginUser | null> {
  const user = await platformPrisma.user.findFirst({
    where: {
      id: userId,
      active: true,
      tenant: { status: "ACTIVE", subscriptionStatus: { not: "CANCELLED" } },
    },
    include: {
      homeownerProfile: true,
      userRoleAssignments: { where: { active: true }, select: { role: true, active: true } },
      tenant: { include: { advisories: { where: { active: true }, orderBy: { createdAt: "desc" }, take: 1 }, moduleEntitlements: true } },
    },
  });
  if (!user || !tenantCanSignIn(user.tenant)) return null;
  const roles = effectiveRolesForUser(user.role, user.userRoleAssignments);
  if (roles.includes(Role.HOMEOWNER) && user.homeownerProfile) {
    const profile = user.homeownerProfile;
    if (profile.status !== "ACTIVE"
      || profile.emailStatus !== "VERIFIED"
      || profile.activationStatus !== HomeownerActivationStatus.ACTIVE
      || !profile.activatedAt) return null;
  }
  return { user, tenant: user.tenant } as SuccessfulLoginUser;
}

function formatRoleLabel(role: Role) {
  return role.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

async function logoutRedirectForSession(session: Awaited<ReturnType<typeof readSession>>) {
  const roles = session?.roles ?? (session ? [session.role] : []);
  if (!session || isPlatformRoleSet(roles)) return "/login?loggedOut=1";
  const tenant = await platformPrisma.tenant.findFirst({
    where: { id: session.tenantId, slug: session.tenantSlug },
    select: { slug: true },
  });
  return tenant?.slug ? `/${tenant.slug}/login?loggedOut=1` : "/login?loggedOut=1";
}
