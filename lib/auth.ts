import "server-only";

import { Role } from "@prisma/client";
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

const COOKIE_NAME = "hoa_session";
const configuredSecret = process.env.AUTH_SECRET;
if (process.env.NODE_ENV === "production" && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error("AUTH_SECRET must contain at least 32 characters in production.");
}
const secret = new TextEncoder().encode(configuredSecret || "development-only-secret-change-me-now");

type SessionPayload = { userId: string; role: Role };

function homeForRole(role: Role) {
  if (role === Role.HOMEOWNER) return "/portal/dashboard";
  if (role === Role.EMPLOYEE) return "/employee/attendance";
  if (role === Role.SYSTEM_ADMIN) return "/admin/settings";
  return "/admin/dashboard";
}

function canUseRole(actualRole: Role, requiredRole: Role) {
  if (requiredRole === Role.ADMIN) return actualRole === Role.ADMIN || actualRole === Role.SYSTEM_ADMIN;
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
    if (typeof payload.userId !== "string" || !Object.values(Role).includes(payload.role as Role)) return null;
    return { userId: payload.userId, role: payload.role as Role };
  } catch {
    return null;
  }
}

export async function requireUser(requiredRole?: Role) {
  const session = await readSession();
  if (!session) redirect("/login");
  if (requiredRole && !canUseRole(session.role, requiredRole)) {
    redirect(homeForRole(session.role));
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, homeownerProfile: { select: { id: true } }, employeeProfile: { select: { id: true } } },
  });
  if (!user || user.role !== session.role) redirect("/login");
  if (requiredRole && !canUseRole(user.role, requiredRole)) redirect(homeForRole(user.role));
  return user;
}

export function defaultHomeForRole(role: Role) {
  return homeForRole(role);
}
