import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma, Role } from "@prisma/client";
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  canUseAssignedRole,
  effectiveRolesForUser,
  isPlatformRoleSet,
  primaryRoleForRoles,
  roleSnapshotForRoles,
} from "@/lib/authorization/effective-access";
import { permissionsForRoles } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { adminHomeForRole } from "@/lib/role-access";
import { setTenantContext } from "@/lib/tenant-context";

const COOKIE_NAME = "hoa_session";
const configuredSecret = process.env.AUTH_SECRET;
if (process.env.NODE_ENV === "production" && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error("AUTH_SECRET must contain at least 32 characters in production.");
}
const secret = new TextEncoder().encode(configuredSecret || "development-only-secret-change-me-now");

export type SessionPayload = {
  userId: string;
  role: Role;
  roles?: Role[];
  roleSnapshot?: string;
  tenantId: string;
  tenantSlug: string;
  sessionId?: string;
};
export type PreparedSession = {
  payload: SessionPayload & { sessionId: string; roles: Role[]; roleSnapshot: string };
  maxAge: number;
  data: Prisma.UserSessionUncheckedCreateInput;
};

function homeForRole(role: Role) {
  if (role === Role.HOMEOWNER) return "/portal/dashboard";
  if (role === Role.EMPLOYEE) return "/employee/attendance";
  if (role === Role.SUPER_ADMIN || role === Role.PLATFORM_ADMIN) return "/platform/tenants";
  if (role === Role.SYSTEM_ADMIN) return "/admin/settings";
  return adminHomeForRole(role);
}

export async function createSession(payload: SessionPayload) {
  const prepared = await prepareSession(payload);
  await prisma.userSession.create({ data: prepared.data });
  await setSessionCookie(prepared);
}

export async function prepareSession(payload: SessionPayload): Promise<PreparedSession> {
  const configuredMaxAge = Number(process.env.SESSION_MAX_AGE_SECONDS);
  const maxAge = Number.isInteger(configuredMaxAge) && configuredMaxAge >= 900 && configuredMaxAge <= 60 * 60 * 24 * 30
    ? configuredMaxAge
    : 60 * 60 * 8;
  const sessionId = payload.sessionId ?? randomUUID();
  const expiresAt = new Date(Date.now() + maxAge * 1000);
  const requestHeaders = await safeRequestHeaders();
  const roles = effectiveRolesForUser(payload.role, (payload.roles ?? [payload.role]).map((role) => ({ role })));
  const role = primaryRoleForRoles(roles, payload.role);
  const roleSnapshot = roleSnapshotForRoles(roles);
  return {
    payload: { ...payload, role, roles, roleSnapshot, sessionId },
    maxAge,
    data: {
      tenantId: payload.tenantId,
      userId: payload.userId,
      tokenHash: sessionHash(sessionId),
      expiresAt,
      userAgentHash: optionalHash(requestHeaders.get("user-agent")),
      ipHash: optionalHash(requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip")),
    },
  };
}

export async function setSessionCookie(prepared: PreparedSession) {
  const token = await new SignJWT(prepared.payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${prepared.maxAge}s`)
    .sign(secret);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: prepared.maxAge,
  });
}

export async function deleteSession() {
  const session = await readSession();
  if (session?.sessionId) {
    const roles = session.roles ?? [session.role];
    setTenantContext({ tenantId: session.tenantId, role: session.role, roles, platform: isPlatformRoleSet(roles) });
    await prisma.userSession.updateMany({
      where: { tenantId: session.tenantId, tokenHash: sessionHash(session.sessionId), revokedAt: null },
      data: { revokedAt: new Date() },
    }).catch(() => undefined);
  }
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.userId !== "string" || typeof payload.tenantId !== "string" || typeof payload.tenantSlug !== "string" || !Object.values(Role).includes(payload.role as Role)) return null;
    const roles = Array.isArray(payload.roles)
      ? payload.roles.filter((role): role is Role => typeof role === "string" && Object.values(Role).includes(role as Role))
      : [payload.role as Role];
    if (!roles.length || !roles.includes(payload.role as Role)) return null;
    return {
      userId: payload.userId,
      role: payload.role as Role,
      roles,
      roleSnapshot: typeof payload.roleSnapshot === "string" ? payload.roleSnapshot : undefined,
      tenantId: payload.tenantId,
      tenantSlug: payload.tenantSlug,
      sessionId: typeof payload.sessionId === "string" ? payload.sessionId : undefined,
    };
  } catch {
    return null;
  }
}

export async function sessionIsCurrent(session: SessionPayload) {
  const sessionRoles = session.roles ?? [session.role];
  setTenantContext({ tenantId: session.tenantId, role: session.role, roles: sessionRoles, platform: isPlatformRoleSet(sessionRoles) });
  const user = await prisma.user.findFirst({
    where: {
      id: session.userId,
      tenantId: session.tenantId,
      active: true,
      tenant: { slug: session.tenantSlug, status: "ACTIVE", subscriptionStatus: { not: "CANCELLED" } },
    },
    select: { id: true, role: true, userRoleAssignments: { where: { active: true }, select: { role: true, active: true } } },
  });
  if (!user || !sessionRoles.includes(session.role)) return false;
  const effectiveRoles = effectiveRolesForUser(user.role, user.userRoleAssignments);
  if (!effectiveRoles.includes(session.role)) return false;
  if (session.roleSnapshot && session.roleSnapshot !== roleSnapshotForRoles(effectiveRoles)) return false;
  if (!session.sessionId) return false;
  const activeSession = await prisma.userSession.findFirst({
    where: { tenantId: session.tenantId, userId: session.userId, tokenHash: sessionHash(session.sessionId), revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return Boolean(activeSession);
}

export async function requireUser(requiredRole?: Role) {
  const session = await readSession();
  if (!session) redirect("/login");
  const sessionRoles = session.roles ?? [session.role];
  const sessionPlatform = isPlatformRoleSet(sessionRoles);
  setTenantContext({ tenantId: session.tenantId, role: session.role, roles: sessionRoles, platform: sessionPlatform });
  if (requiredRole && !canUseAssignedRole(sessionRoles, requiredRole)) redirect(homeForRole(session.role));

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      tenantId: true,
      name: true,
      email: true,
      role: true,
      active: true,
      tenant: { select: { slug: true, status: true, subscriptionStatus: true } },
      homeownerProfile: { select: { id: true } },
      employeeProfile: { select: { id: true } },
      userRoleAssignments: { where: { active: true }, select: { role: true, active: true } },
    },
  });
  if (!user || !user.active || user.tenantId !== session.tenantId || user.tenant.slug !== session.tenantSlug) redirect("/login");

  const roles = effectiveRolesForUser(user.role, user.userRoleAssignments);
  const roleSnapshot = roleSnapshotForRoles(roles);
  if (!roles.includes(session.role)) redirect("/login");
  if (session.roleSnapshot && session.roleSnapshot !== roleSnapshot) redirect("/login");
  if (!session.sessionId) redirect("/login");

  const activeSession = await prisma.userSession.findFirst({
    where: { tenantId: session.tenantId, userId: session.userId, tokenHash: sessionHash(session.sessionId), revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (!activeSession) redirect("/login");
  await prisma.userSession.update({ where: { id: activeSession.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);

  if (user.tenant.status !== "ACTIVE" || user.tenant.subscriptionStatus === "CANCELLED") redirect(`/${session.tenantSlug}/login?error=tenant-inactive`);
  if (requiredRole && !canUseAssignedRole(roles, requiredRole)) redirect(homeForRole(primaryRoleForRoles(roles, user.role)));

  const platform = isPlatformRoleSet(roles);
  const permissions = permissionsForRoles(roles);
  if (!platform) {
    const entitlements = await prisma.tenantModuleEntitlement.findMany({ where: { tenantId: user.tenantId, enabled: true }, select: { module: true } });
    setTenantContext({
      tenantId: user.tenantId,
      role: primaryRoleForRoles(roles, user.role),
      roles,
      permissions,
      platform: false,
      enabledModules: new Set(entitlements.map((item) => item.module)),
    });
  } else {
    setTenantContext({ tenantId: user.tenantId, role: primaryRoleForRoles(roles, user.role), roles, permissions, platform: true });
  }

  return {
    ...user,
    role: primaryRoleForRoles(roles, user.role),
    roles,
    permissions,
  };
}

export function defaultHomeForRole(role: Role) {
  return homeForRole(role);
}

export function defaultHomeForRoles(roles: readonly Role[], preferredRole?: Role) {
  return homeForRole(primaryRoleForRoles(roles, preferredRole));
}

function sessionHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function optionalHash(value?: string | null) {
  return value ? sessionHash(value) : null;
}

async function safeRequestHeaders() {
  try {
    return await headers();
  } catch {
    return new Headers();
  }
}
