"use server";

import { HomeownerActivationStatus, Role } from "@prisma/client";
import { compare } from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, defaultHomeForRole, deleteSession, readSession } from "@/lib/auth";
import { platformPrisma, prisma } from "@/lib/db";
import { clearRateLimit, rateLimitAvailable, recordRateLimitFailure } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";
import { resolveTenant, tenantCanSignIn } from "@/lib/tenant";
import { setTenantContext } from "@/lib/tenant-context";
import { normalizeActivationEmail } from "@/lib/services/homeowner-activation";

export type AuthNavigationState = { error?: string; redirectTo?: string };
export type LoginState = AuthNavigationState;

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
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

  const resolved = await resolveLoginUser({ tenantSlug, identifierType, identifier: normalizedIdentifier, password: parsed.data.password });
  if (!resolved || "error" in resolved) {
    await Promise.all([
      recordRateLimitFailure("LOGIN_EMAIL", `${loginScope}:${identifierType}:${normalizedIdentifier}`),
      recordRateLimitFailure("LOGIN_IP", ip),
    ]);
    return { error: resolved && "error" in resolved ? resolved.error : "Incorrect identifier or password." };
  }
  const { tenant, user } = resolved;

  setTenantContext({
    tenantId: tenant.id,
    platform: false,
    enabledModules: new Set(tenant.moduleEntitlements.filter((item) => item.enabled).map((item) => item.module)),
  });

  await clearRateLimit("LOGIN_EMAIL", `${loginScope}:${identifierType}:${normalizedIdentifier}`);

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
        metadata: { tenantSlug: tenant.slug },
      },
    }),
  ]);

  await createSession({ userId: user.id, role: user.role, tenantId: tenant.id, tenantSlug: tenant.slug });
  return { redirectTo: defaultHomeForRole(user.role) };
}

export async function logoutAction() {
  const session = await readSession();
  const redirectTo = await logoutRedirectForSession(session);
  await deleteSession();
  redirect(redirectTo);
}

export async function logoutAllSessionsAction() {
  const session = await readSession();
  const redirectTo = await logoutRedirectForSession(session);
  if (!session) redirect(redirectTo);
  setTenantContext({
    tenantId: session.tenantId,
    role: session.role,
    platform: session.role === "SUPER_ADMIN" || session.role === "PLATFORM_ADMIN",
  });
  await prisma.userSession.updateMany({
    where: { tenantId: session.tenantId, userId: session.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await deleteSession();
  redirect(redirectTo);
}

export async function logoutNavigationAction(_state: AuthNavigationState): Promise<AuthNavigationState> {
  const session = await readSession();
  const redirectTo = await logoutRedirectForSession(session);
  await deleteSession();
  return { redirectTo };
}

export async function logoutAllSessionsNavigationAction(_state: AuthNavigationState): Promise<AuthNavigationState> {
  const session = await readSession();
  const redirectTo = await logoutRedirectForSession(session);
  if (!session) return { redirectTo };
  setTenantContext({
    tenantId: session.tenantId,
    role: session.role,
    platform: session.role === "SUPER_ADMIN" || session.role === "PLATFORM_ADMIN",
  });
  await prisma.userSession.updateMany({
    where: { tenantId: session.tenantId, userId: session.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await deleteSession();
  return { redirectTo };
}

async function resolveLoginUser(input: { tenantSlug: string; identifierType: "email" | "accountNumber"; identifier: string; password: string }) {
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
        : { role: Role.HOMEOWNER, homeownerProfile: { accountNumber: input.identifier } }),
    },
    include: {
      homeownerProfile: true,
      tenant: { include: { advisories: { where: { active: true }, orderBy: { createdAt: "desc" }, take: 1 }, moduleEntitlements: true } },
    },
    take: 10,
  });
  const authorized = users.filter((candidate) => {
    if (!tenantCanSignIn(candidate.tenant)) return false;
    if (candidate.role !== Role.HOMEOWNER) return input.identifierType === "email";
    return candidate.homeownerProfile?.status === "ACTIVE"
      && candidate.homeownerProfile.emailStatus === "VERIFIED"
      && candidate.homeownerProfile.activationStatus === HomeownerActivationStatus.ACTIVE
      && Boolean(candidate.homeownerProfile.activatedAt);
  });
  const matches = [];
  for (const candidate of authorized) {
    if (await compare(input.password, candidate.passwordHash)) matches.push(candidate);
  }
  if (!matches.length) return null;
  if (!tenant && matches.length > 1) return { error: "Multiple HOA accounts match this login. Sign in with your 11-digit homeowner account number." } as const;
  const user = matches[0];
  return { user, tenant: user.tenant } as const;
}

async function logoutRedirectForSession(session: Awaited<ReturnType<typeof readSession>>) {
  if (!session || session.role === Role.SUPER_ADMIN || session.role === Role.PLATFORM_ADMIN) return "/login?loggedOut=1";
  const tenant = await platformPrisma.tenant.findFirst({
    where: { id: session.tenantId, slug: session.tenantSlug },
    select: { slug: true },
  });
  return tenant?.slug ? `/${tenant.slug}/login?loggedOut=1` : "/login?loggedOut=1";
}
