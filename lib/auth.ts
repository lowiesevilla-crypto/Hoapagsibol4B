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
import {
  authorizationSnapshotForAccess,
  effectivePermissionsForAccess,
} from "@/lib/authorization/custom-roles";
import {
  isPermission,
  permissionsForRoles,
  Permission,
  type Permission as PermissionValue,
} from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { adminHomeForPermissions, adminHomeForRole } from "@/lib/role-access";
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
  permissions?: PermissionValue[];
  authorizationSnapshot?: string;
  tenantId: string;
  tenantSlug: string;
  sessionId?: string;
};
export type PreparedSession = {
  payload: SessionPayload & {
    sessionId: string;
    roles: Role[];
    roleSnapshot: string;
    permissions: PermissionValue[];
    authorizationSnapshot: string;
  };
  maxAge: number;
  data: Prisma.UserSessionUncheckedCreateInput;
};

const customAssignmentSelect = {
  where: { active: true },
  select: {
    active: true,
    role: {
      select: {
        id: true,
        key: true,
        name: true,
        active: true,
        updatedAt: true,
        permissions: { select: { permission: true } },
      },
    },
  },
} as const;

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
  const access = await resolvePreparedAccess(payload);
  return {
    payload: {
      ...payload,
      role: access.role,
      roles: access.roles,
      roleSnapshot: roleSnapshotForRoles(access.roles),
      permissions: access.permissions,
      authorizationSnapshot: access.authorizationSnapshot,
      sessionId,
    },
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

async function resolvePreparedAccess(payload: SessionPayload) {
  const user = await prisma.user.findFirst({
    where: { id: payload.userId, tenantId: payload.tenantId, active: true },
    select: {
      role: true,
      userRoleAssignments: { where: { active: true }, select: { role: true, active: true } },
      tenantCustomRoleAssignments: customAssignmentSelect,
    },
  }).catch(() => null);
  const roles = user
    ? effectiveRolesForUser(user.role, user.userRoleAssignments)
    : effectiveRolesForUser(payload.role, (payload.roles ?? [payload.role]).map((role) => ({ role })));
  const assignments = user?.tenantCustomRoleAssignments ?? [];
  const permissions = user
    ? [...effectivePermissionsForAccess(roles, assignments)]
    : normalizePermissions(payload.permissions ?? [...permissionsForRoles(roles)]);
  return {
    role: primaryRoleForRoles(roles, user?.role ?? payload.role),
    roles,
    permissions,
    authorizationSnapshot: user
      ? authorizationSnapshotForAccess(roles, assignments)
      : payload.authorizationSnapshot ?? authorizationSnapshotForAccess(roles, []),
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
    setTenantContext({
      tenantId: session.tenantId,
      role: session.role,
      roles,
      permissions: new Set(session.permissions ?? [...permissionsForRoles(roles)]),
      platform: session.permissions?.includes(Permission.PLATFORM_ACCESS) ?? isPlatformRoleSet(roles),
    });
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
    const permissions = Array.isArray(payload.permissions)
      ? payload.permissions.filter(isPermission)
      : undefined;
    return {
      userId: payload.userId,
      role: payload.role as Role,
      roles,
      roleSnapshot: typeof payload.roleSnapshot === "string" ? payload.roleSnapshot : undefined,
      permissions,
      authorizationSnapshot: typeof payload.authorizationSnapshot === "string" ? payload.authorizationSnapshot : undefined,
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
  setTenantContext({
    tenantId: session.tenantId,
    role: session.role,
    roles: sessionRoles,
    permissions: new Set(session.permissions ?? [...permissionsForRoles(sessionRoles)]),
    platform: session.permissions?.includes(Permission.PLATFORM_ACCESS) ?? isPlatformRoleSet(sessionRoles),
  });
  const user = await prisma.user.findFirst({
    where: {
      id: session.userId,
      tenantId: session.tenantId,
      active: true,
      tenant: { slug: session.tenantSlug, status: "ACTIVE", subscriptionStatus: { not: "CANCELLED" } },
    },
    select: {
      id: true,
      role: true,
      userRoleAssignments: { where: { active: true }, select: { role: true, active: true } },
      tenantCustomRoleAssignments: customAssignmentSelect,
    },
  });
  if (!user || !sessionRoles.includes(session.role)) return false;
  const effectiveRoles = effectiveRolesForUser(user.role, user.userRoleAssignments);
  if (!effectiveRoles.includes(session.role)) return false;
  if (session.roleSnapshot && session.roleSnapshot !== roleSnapshotForRoles(effectiveRoles)) return false;
  const authorizationSnapshot = authorizationSnapshotForAccess(effectiveRoles, user.tenantCustomRoleAssignments);
  if (session.authorizationSnapshot && session.authorizationSnapshot !== authorizationSnapshot) return false;
  if (!session.authorizationSnapshot && user.tenantCustomRoleAssignments.length) return false;
  const effectivePermissions = [...effectivePermissionsForAccess(effectiveRoles, user.tenantCustomRoleAssignments)]
    .sort((left, right) => left.localeCompare(right));
  if (session.permissions && normalizePermissions(session.permissions).join("|") !== effectivePermissions.join("|")) return false;
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
  const sessionPermissions = session.permissions ?? [...permissionsForRoles(sessionRoles)];
  const sessionPlatform = sessionPermissions.includes(Permission.PLATFORM_ACCESS) || isPlatformRoleSet(sessionRoles);
  setTenantContext({
    tenantId: session.tenantId,
    role: session.role,
    roles: sessionRoles,
    permissions: new Set(sessionPermissions),
    platform: sessionPlatform,
  });
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
      tenantCustomRoleAssignments: customAssignmentSelect,
    },
  });
  if (!user || !user.active || user.tenantId !== session.tenantId || user.tenant.slug !== session.tenantSlug) redirect("/login");

  const roles = effectiveRolesForUser(user.role, user.userRoleAssignments);
  const roleSnapshot = roleSnapshotForRoles(roles);
  const permissions = effectivePermissionsForAccess(roles, user.tenantCustomRoleAssignments);
  const authorizationSnapshot = authorizationSnapshotForAccess(roles, user.tenantCustomRoleAssignments);
  if (!roles.includes(session.role)) redirect("/login");
  if (session.roleSnapshot && session.roleSnapshot !== roleSnapshot) redirect("/login");
  if (session.authorizationSnapshot && session.authorizationSnapshot !== authorizationSnapshot) redirect("/login");
  if (!session.authorizationSnapshot && user.tenantCustomRoleAssignments.length) redirect("/login");
  if (session.permissions && normalizePermissions(session.permissions).join("|") !== [...permissions].sort((left, right) => left.localeCompare(right)).join("|")) redirect("/login");
  if (!session.sessionId) redirect("/login");

  const activeSession = await prisma.userSession.findFirst({
    where: { tenantId: session.tenantId, userId: session.userId, tokenHash: sessionHash(session.sessionId), revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (!activeSession) redirect("/login");
  await prisma.userSession.update({ where: { id: activeSession.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);

  if (user.tenant.status !== "ACTIVE" || user.tenant.subscriptionStatus === "CANCELLED") redirect(`/${session.tenantSlug}/login?error=tenant-inactive`);
  if (requiredRole && !canUseAssignedRole(roles, requiredRole)) redirect(defaultHomeForAccess(roles, [...permissions], user.role));

  const role = primaryRoleForRoles(roles, user.role);
  const platform = permissions.has(Permission.PLATFORM_ACCESS) || isPlatformRoleSet(roles);
  if (!platform) {
    const entitlements = await prisma.tenantModuleEntitlement.findMany({ where: { tenantId: user.tenantId, enabled: true }, select: { module: true } });
    setTenantContext({
      tenantId: user.tenantId,
      role,
      roles,
      permissions,
      platform: false,
      enabledModules: new Set(entitlements.map((item) => item.module)),
    });
  } else {
    setTenantContext({ tenantId: user.tenantId, role, roles, permissions, platform: true });
  }

  return {
    ...user,
    role,
    roles,
    permissions: [...permissions],
    authorizationSnapshot,
    customRoles: user.tenantCustomRoleAssignments.map((assignment) => ({
      id: assignment.role.id,
      key: assignment.role.key,
      name: assignment.role.name,
    })),
  };
}

export function defaultHomeForRole(role: Role) {
  return homeForRole(role);
}

export function defaultHomeForRoles(roles: readonly Role[], preferredRole?: Role) {
  return homeForRole(primaryRoleForRoles(roles, preferredRole));
}

export function defaultHomeForAccess(
  roles: readonly Role[],
  permissions: readonly PermissionValue[],
  preferredRole?: Role,
) {
  if (permissions.includes(Permission.PLATFORM_ACCESS)) return "/platform/tenants";
  if (permissions.includes(Permission.SETTINGS_MANAGE)) return "/admin/settings";
  if (permissions.includes(Permission.ADMIN_ACCESS)) return adminHomeForPermissions(permissions);
  if (permissions.includes(Permission.HOMEOWNER_PORTAL_ACCESS)) return "/portal/dashboard";
  if (permissions.includes(Permission.EMPLOYEE_PORTAL_ACCESS)) return "/employee/attendance";
  return defaultHomeForRoles(roles, preferredRole);
}

function normalizePermissions(values: readonly PermissionValue[]) {
  return [...new Set(values.filter(isPermission))].sort((left, right) => left.localeCompare(right));
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
