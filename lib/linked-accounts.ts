import "server-only";

import { HomeownerActivationStatus, Role, TenantModule } from "@prisma/client";
import { effectiveRolesForUser, primaryRoleForRoles } from "@/lib/authorization/effective-access";
import { platformPrisma } from "@/lib/db";
import { normalizeActivationEmail } from "@/lib/services/homeowner-activation";
import { tenantCanSignIn } from "@/lib/tenant";

export type LinkedAccount = {
  userId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantLogoUrl: string | null;
  name: string;
  email: string;
  roles: Role[];
  primaryRole: Role;
  accountNumber: string | null;
  propertyLabel: string | null;
  current: boolean;
  enabledModules: TenantModule[];
};

export async function listLinkedAccounts(email: string, currentUserId?: string): Promise<LinkedAccount[]> {
  const normalizedEmail = normalizeActivationEmail(email);
  if (!normalizedEmail) return [];

  const users = await platformPrisma.user.findMany({
    where: {
      email: normalizedEmail,
      active: true,
      tenant: { status: "ACTIVE", subscriptionStatus: { not: "CANCELLED" } },
    },
    include: {
      homeownerProfile: true,
      userRoleAssignments: { where: { active: true }, select: { role: true, active: true } },
      tenant: {
        include: {
          advisories: { where: { active: true }, orderBy: { createdAt: "desc" }, take: 1 },
          moduleEntitlements: { where: { enabled: true }, select: { module: true } },
        },
      },
    },
    orderBy: [{ tenantId: "asc" }, { name: "asc" }],
    take: 100,
  });

  return users.flatMap((user) => {
    if (!tenantCanSignIn(user.tenant)) return [];
    const roles = effectiveRolesForUser(user.role, user.userRoleAssignments);
    const hasNonHomeownerRole = roles.some((role) => role !== Role.HOMEOWNER);
    const homeownerIsActive = Boolean(
      user.homeownerProfile
      && user.homeownerProfile.status === "ACTIVE"
      && user.homeownerProfile.emailStatus === "VERIFIED"
      && user.homeownerProfile.activationStatus === HomeownerActivationStatus.ACTIVE
      && user.homeownerProfile.activatedAt,
    );
    if (!hasNonHomeownerRole && !homeownerIsActive) return [];

    return [{
      userId: user.id,
      tenantId: user.tenantId,
      tenantName: user.tenant.name,
      tenantSlug: user.tenant.slug,
      tenantLogoUrl: user.tenant.logoUrl,
      name: user.name,
      email: user.email,
      roles,
      primaryRole: primaryRoleForRoles(roles, user.role),
      accountNumber: user.homeownerProfile?.accountNumber || null,
      propertyLabel: user.homeownerProfile
        ? `Block ${user.homeownerProfile.block}, Lot ${user.homeownerProfile.lot}`
        : null,
      current: user.id === currentUserId,
      enabledModules: user.tenant.moduleEntitlements.map((item) => item.module),
    }];
  }).sort((left, right) => left.tenantName.localeCompare(right.tenantName) || left.name.localeCompare(right.name));
}

export function displayRole(role: Role) {
  return role.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
