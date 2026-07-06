"use server";

import { compare } from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, defaultHomeForRole, deleteSession, readSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clearRateLimit, rateLimitAvailable, recordRateLimitFailure } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";
import { DEFAULT_TENANT_SLUG, resolveTenant, tenantCanSignIn } from "@/lib/tenant";
import { setTenantContext } from "@/lib/tenant-context";

export type LoginState = { error?: string };

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Check your login details." };

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip")?.trim() || "unknown";
  const tenantSlug = String(formData.get("tenantSlug") || DEFAULT_TENANT_SLUG).trim().toLowerCase();
  const [emailAllowed, ipAllowed] = await Promise.all([
    rateLimitAvailable("LOGIN_EMAIL", `${tenantSlug}:${parsed.data.email}`, 8, 15 * 60 * 1000),
    rateLimitAvailable("LOGIN_IP", ip, 30, 15 * 60 * 1000),
  ]);
  if (!emailAllowed || !ipAllowed) return { error: "Too many sign-in attempts. Wait 15 minutes and try again." };

  const tenant = await resolveTenant(tenantSlug);
  if (!tenant) return { error: "HOA portal not found." };
  if (!tenantCanSignIn(tenant)) return { error: tenant.advisories[0]?.message || "This HOA portal is currently unavailable." };

  setTenantContext({
    tenantId: tenant.id,
    platform: false,
    enabledModules: new Set(tenant.moduleEntitlements.filter((item) => item.enabled).map((item) => item.module)),
  });

  const user = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: parsed.data.email } });
  if (!user || !user.active || !(await compare(parsed.data.password, user.passwordHash))) {
    await Promise.all([
      recordRateLimitFailure("LOGIN_EMAIL", `${tenantSlug}:${parsed.data.email}`),
      recordRateLimitFailure("LOGIN_IP", ip),
    ]);
    return { error: "Incorrect email or password." };
  }

  await clearRateLimit("LOGIN_EMAIL", `${tenantSlug}:${parsed.data.email}`);

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
  redirect(defaultHomeForRole(user.role));
}

export async function logoutAction() {
  const session = await readSession();
  await deleteSession();

  if (session?.role === "SUPER_ADMIN" || session?.role === "PLATFORM_ADMIN") {
    redirect("/login");
  }

  redirect(session?.tenantSlug ? `/${session.tenantSlug}/login` : "/login");
}