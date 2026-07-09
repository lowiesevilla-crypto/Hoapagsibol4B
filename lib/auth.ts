import "server-only";

import { Role } from "@prisma/client";
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { adminHomeForRole } from "@/lib/role-access";
import { setTenantContext } from "@/lib/tenant-context";

const COOKIE_NAME = "hoa_session";
const configuredSecret = process.env.AUTH_SECRET;
if (process.env.NODE_ENV === "production" && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error("AUTH_SECRET must contain at least 32 characters in production.");
}
const secret = new TextEncoder().encode(configuredSecret || "development-only-secret-change-me-now");

export type SessionPayload = { userId: string; role: Role; tenantId: string; tenantSlug: string };

function homeForRole(role: Role) {
  if (role === Role.HOMEOWNER) return "/portal/dashboard";
  if (role === Role.EMPLOYEE) return "/employee/attendance";
  if (role === Role.SUPER_ADMIN || role === Role.PLATFORM_ADMIN) return "/platform/tenants";
  if (role === Role.SYSTEM_ADMIN) return "/admin/settings";
  return adminHomeForRole(role);
}

function canUseRole(actualRole: Role, requiredRole: Role) {
  if (requiredRole === Role.ADMIN) return (actualRole as string) === Role.ADMIN || [Role.SYSTEM_ADMIN, Role.HOA_ADMIN, Role.BILLING_MANAGER, Role.PAYROLL_MANAGER, Role.STAFF, Role.SUPER_ADMIN].some((role) => role === actualRole);
  if (requiredRole === Role.PLATFORM_ADMIN) return actualRole === Role.PLATFORM_ADMIN || actualRole === Role.SUPER_ADMIN;
  if (requiredRole === Role.SYSTEM_ADMIN) return actualRole === Role.SYSTEM_ADMIN || actualRole === Role.SUPER_ADMIN || actualRole === Role.PLATFORM_ADMIN;
  return actualRole === requiredRole;
}

export async function createSession(payload: SessionPayload) {
  const configuredMaxAge = Number(process.env.SESSION_MAX_AGE_SECONDS);
  const maxAge = Number.isInteger(configuredMaxAge) && configuredMaxAge >= 900 && configuredMaxAge <= 60 * 60 * 24 * 30
    ? configuredMaxAge
    : 60 * 60 * 8;
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secret);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function deleteSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.userId !== "string" || typeof payload.tenantId !== "string" || typeof payload.tenantSlug !== "string" || !Object.values(Role).includes(payload.role as Role)) return null;
    return { userId: payload.userId, role: payload.role as Role, tenantId: payload.tenantId, tenantSlug: payload.tenantSlug };
  } catch {
    return null;
  }
}

export async function sessionIsCurrent(session: SessionPayload) {
  setTenantContext({ tenantId: session.tenantId, role: session.role, platform: session.role === Role.SUPER_ADMIN || session.role === Role.PLATFORM_ADMIN });
  const user = await prisma.user.findFirst({ where: { id: session.userId, tenantId: session.tenantId, role: session.role, active: true, tenant: { slug: session.tenantSlug, status: "ACTIVE", subscriptionStatus: { not: "CANCELLED" } } }, select: { id: true } });
  return Boolean(user);
}

export async function requireUser(requiredRole?: Role) {
  const session = await readSession();
  if (!session) redirect("/login");
  const platform = session.role === Role.SUPER_ADMIN || session.role === Role.PLATFORM_ADMIN;
  setTenantContext({ tenantId: session.tenantId, role: session.role, platform });
  if (requiredRole && !canUseRole(session.role, requiredRole)) {
    redirect(homeForRole(session.role));
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, tenantId: true, name: true, email: true, role: true, active: true, tenant: { select: { slug: true, status: true, subscriptionStatus: true } }, homeownerProfile: { select: { id: true } }, employeeProfile: { select: { id: true } } },
  });
  if (!user || !user.active || user.role !== session.role || user.tenantId !== session.tenantId || user.tenant.slug !== session.tenantSlug) redirect("/login");
  if (user.tenant.status !== "ACTIVE" || user.tenant.subscriptionStatus === "CANCELLED") redirect(`/${session.tenantSlug}/login?error=tenant-inactive`);
  if (requiredRole && !canUseRole(user.role, requiredRole)) redirect(homeForRole(user.role));
  if (!platform) {
    const entitlements = await prisma.tenantModuleEntitlement.findMany({ where: { tenantId: user.tenantId, enabled: true }, select: { module: true } });
    setTenantContext({ tenantId: user.tenantId, role: user.role, platform: false, enabledModules: new Set(entitlements.map((item) => item.module)) });
  }
  return user;
}

export function defaultHomeForRole(role: Role) {
  return homeForRole(role);
}
