"use server";

import { compare } from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, defaultHomeForRole, deleteSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clearRateLimit, rateLimitAvailable, recordRateLimitFailure } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

export type LoginState = { error?: string };

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Check your login details." };

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip")?.trim() || "unknown";
  const [emailAllowed, ipAllowed] = await Promise.all([
    rateLimitAvailable("LOGIN_EMAIL", parsed.data.email, 8, 15 * 60 * 1000),
    rateLimitAvailable("LOGIN_IP", ip, 30, 15 * 60 * 1000),
  ]);
  if (!emailAllowed || !ipAllowed) return { error: "Too many sign-in attempts. Wait 15 minutes and try again." };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await compare(parsed.data.password, user.passwordHash))) {
    await Promise.all([recordRateLimitFailure("LOGIN_EMAIL", parsed.data.email), recordRateLimitFailure("LOGIN_IP", ip)]);
    return { error: "Incorrect email or password." };
  }

  await clearRateLimit("LOGIN_EMAIL", parsed.data.email);
  await createSession({ userId: user.id, role: user.role });
  redirect(defaultHomeForRole(user.role));
}

export async function logoutAction() {
  await deleteSession();
  redirect("/login");
}
