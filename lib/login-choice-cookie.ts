import "server-only";

import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import { cookies } from "next/headers";

const LOGIN_CHOICE_COOKIE_NAME = "hoa_login_choice";
const LOGIN_CHOICE_PURPOSE = "hoa-login-choice-v1";
const LOGIN_CHOICE_MAX_AGE_SECONDS = 5 * 60;

const configuredSecret = process.env.AUTH_SECRET;
if (process.env.NODE_ENV === "production" && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error("AUTH_SECRET must contain at least 32 characters in production.");
}
const secret = new TextEncoder().encode(configuredSecret || "development-only-secret-change-me-now");

export async function setVerifiedLoginChoices(userIds: string[]) {
  const allowedUserIds = [...new Set(userIds.map((value) => value.trim()).filter(Boolean))];
  if (allowedUserIds.length < 2 || allowedUserIds.length > 50) {
    throw new Error("Verified login account choices are invalid.");
  }

  const token = await new SignJWT({ purpose: LOGIN_CHOICE_PURPOSE, userIds: allowedUserIds })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${LOGIN_CHOICE_MAX_AGE_SECONDS}s`)
    .sign(secret);

  const store = await cookies();
  store.set(LOGIN_CHOICE_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LOGIN_CHOICE_MAX_AGE_SECONDS,
  });
}

export async function readVerifiedLoginChoices(): Promise<string[] | null> {
  const token = (await cookies()).get(LOGIN_CHOICE_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.purpose !== LOGIN_CHOICE_PURPOSE || !Array.isArray(payload.userIds)) return null;
    const userIds = payload.userIds.filter((value): value is string => typeof value === "string" && value.length > 0);
    if (userIds.length < 2 || userIds.length > 50) return null;
    return [...new Set(userIds)];
  } catch {
    return null;
  }
}

export async function clearVerifiedLoginChoices() {
  (await cookies()).delete(LOGIN_CHOICE_COOKIE_NAME);
}
