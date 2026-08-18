import "server-only";

import { isPlatformRoleSet } from "@/lib/authorization/effective-access";
import { deleteSession, readSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clearVerifiedLoginChoices } from "@/lib/login-choice-cookie";
import { setTenantContext } from "@/lib/tenant-context";

export type LogoutScope = "current" | "all";

export type LogoutResult = {
  redirectTo: string;
  allSessionsRevoked: boolean;
};

export async function performLogout(scope: LogoutScope = "current"): Promise<LogoutResult> {
  const session = await readSession();
  const redirectTo = logoutRedirectForSession(session);
  let allSessionsRevoked = scope !== "all" || !session;

  if (scope === "all" && session) {
    const roles = session.roles ?? [session.role];
    setTenantContext({
      tenantId: session.tenantId,
      role: session.role,
      roles,
      platform: isPlatformRoleSet(roles),
    });

    try {
      await prisma.userSession.updateMany({
        where: { tenantId: session.tenantId, userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      allSessionsRevoked = true;
    } catch (error) {
      console.error("[auth] all-session logout revocation failed", {
        errorName: error instanceof Error ? error.name : typeof error,
      });
      allSessionsRevoked = false;
    }
  }

  // deleteSession is intentionally best-effort for the persisted session row but
  // authoritative for removing the signed browser cookie. This keeps normal logout
  // available even if the database is temporarily unavailable during sign-out.
  await deleteSession();
  await clearVerifiedLoginChoices().catch((error) => {
    console.error("[auth] login-choice cleanup failed during logout", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
  });

  return { redirectTo, allSessionsRevoked };
}

export function logoutRedirectForSession(session: Awaited<ReturnType<typeof readSession>>) {
  const roles = session?.roles ?? (session ? [session.role] : []);
  if (!session || isPlatformRoleSet(roles)) return "/login?loggedOut=1";

  // tenantSlug is part of the signed server session payload, so logout does not need
  // a database lookup just to determine the tenant-branded login destination.
  const tenantSlug = session.tenantSlug.trim();
  return tenantSlug ? `/${encodeURIComponent(tenantSlug)}/login?loggedOut=1` : "/login?loggedOut=1";
}
