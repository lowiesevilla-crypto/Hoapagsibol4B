"use server";

import { HomeownerActivationStatus } from "@prisma/client";
import { compare } from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, defaultHomeForRole, deleteSession, readSession } from "@/lib/auth";
import { platformPrisma, prisma } from "@/lib/db";
import { clearRateLimit, rateLimitAvailable, recordRateLimitFailure } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";
import { DEFAULT_TENANT_SLUG, resolveTenant, tenantCanSignIn } from "@/lib/tenant";
import { setTenantContext } from "@/lib/tenant-context";
import { normalizeAccountNumber } from "@/lib/services/homeowner-activation";

export type LoginState = { error?: string };

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Check your login details." };

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip")?.trim() || "unknown";
  const tenantSlug = String(formData.get("tenantSlug") || "").trim().toLowerCase();
  const loginScope = tenantSlug || "universal";
  const [emailAllowed, ipAllowed] = await Promise.all([
    rateLimitAvailable("LOGIN_EMAIL", `${loginScope}:${parsed.data.email}`, 8, 15 * 60 * 1000),
    rateLimitAvailable("LOGIN_IP", ip, 30, 15 * 60 * 1000),
  ]);
  if (!emailAllowed || !ipAllowed) return { error: "Too many sign-in attempts. Wait 15 minutes and try again." };

  const tenant = await resolveLoginTenant({ tenantSlug, email: parsed.data.email, accountNumber: normalizeAccountNumber(formData.get("accountNumber")) });
  if (!tenant) return { error: "HOA portal not found." };
  if ("error" in tenant) return { error: tenant.error };
  if (!tenantCanSignIn(tenant)) return { error: tenant.advisories[0]?.message || "This HOA portal is currently unavailable." };

  setTenantContext({
    tenantId: tenant.id,
    platform: false,
    enabledModules: new Set(tenant.moduleEntitlements.filter((item) => item.enabled).map((item) => item.module)),
  });

  const user = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: parsed.data.email }, include: { homeownerProfile: true } });
  if (!user || !user.active || !(await compare(parsed.data.password, user.passwordHash))) {
    await Promise.all([
      recordRateLimitFailure("LOGIN_EMAIL", `${loginScope}:${parsed.data.email}`),
      recordRateLimitFailure("LOGIN_IP", ip),
    ]);
    return { error: "Incorrect email or password." };
  }
  if (user.role === "HOMEOWNER" && user.homeownerProfile?.activationStatus !== HomeownerActivationStatus.ACTIVE) {
    return { error: "This homeowner account must be activated before portal login. Open Activate account and use the temporary password sent to the registered email." };
  }

  await clearRateLimit("LOGIN_EMAIL", `${loginScope}:${parsed.data.email}`);

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

export async function logoutAllSessionsAction() {
  const session = await readSession();
  if (!session) redirect("/login");
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
  redirect(session.tenantSlug ? `/${session.tenantSlug}/login` : "/login");
}

async function resolveLoginTenant(input: { tenantSlug: string; email: string; accountNumber: string }) {
  if (input.tenantSlug) return resolveTenant(input.tenantSlug);

  const users = await platformPrisma.user.findMany({
    where: {
      email: input.email,
      active: true,
      tenant: { status: "ACTIVE", subscriptionStatus: { not: "CANCELLED" } },
    },
    include: { homeownerProfile: true, tenant: true },
    take: 10,
  });
  if (!users.length) return null;

  let user = users[0];
  if (users.length > 1 || input.accountNumber) {
    if (!input.accountNumber) return { error: "Enter your 11-digit homeowner account number so we can identify your HOA." } as const;
    const matched = users.find((item) => item.homeownerProfile?.accountNumber === input.accountNumber);
    if (!matched) return { error: "The account number does not match this registered email." } as const;
    user = matched;
  }
  return resolveTenant(user.tenant.slug || DEFAULT_TENANT_SLUG);
}
