"use server";

import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  effectivePermissionsForAccess,
} from "@/lib/authorization/custom-roles";
import {
  effectiveRolesForUser,
  primaryRoleForRoles,
} from "@/lib/authorization/effective-access";
import {
  highRiskPermissionSelection,
  requireAuthorizationChangeReason,
  requireAuthorizationConfirmation,
} from "@/lib/authorization/permission-risk";
import { canAssignRole } from "@/lib/authorization/role-policy";
import {
  Permission,
  type Permission as PermissionValue,
} from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { tenantUserRoles } from "@/lib/tenant-roles";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function userReturnTo(tenantId: string, userId: string) {
  return `/platform/tenants/${tenantId}/users/${userId}`;
}

async function requireTenantUserManager(
  tenantId: string,
  tenantPermission: PermissionValue,
) {
  const actor = await requireUser();
  const platformManager = actor.permissions.includes(Permission.PLATFORM_USERS_MANAGE);
  const tenantManager = actor.tenantId === tenantId
    && actor.permissions.includes(tenantPermission);
  if (!platformManager && !tenantManager) {
    redirect("/admin/dashboard?error=You%20do%20not%20have%20permission%20to%20manage%20tenant%20users.");
  }
  if (!platformManager && actor.tenantId !== tenantId) {
    redirect("/admin/dashboard?error=Cross-tenant%20user%20management%20is%20not%20allowed.");
  }
  return actor;
}

function roleCanBeGranted(actorRoles: readonly Role[], targetRole: Role) {
  return actorRoles.some((actorRole) => canAssignRole(actorRole, targetRole));
}

export async function updateTenantUserProfileAction(formData: FormData) {
  const tenantId = clean(formData.get("tenantId"));
  const userId = clean(formData.get("userId"));
  const actor = await requireTenantUserManager(tenantId, Permission.USERS_MANAGE);
  const name = clean(formData.get("name"));
  const email = clean(formData.get("email")).toLowerCase();
  const username = clean(formData.get("username")) || null;
  if (!tenantId || !userId || !name || !email) {
    redirect(`${userReturnTo(tenantId, userId)}?error=Check%20the%20required%20user%20fields.`);
  }
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) redirect(`/platform/tenants/${tenantId}/users?error=Tenant%20user%20not%20found.`);
  const duplicate = await prisma.user.findFirst({
    where: {
      tenantId,
      id: { not: userId },
      OR: [{ email }, ...(username ? [{ username }] : [])],
    },
    select: { id: true },
  });
  if (duplicate) redirect(`${userReturnTo(tenantId, userId)}?error=Email%20or%20username%20is%20already%20used%20in%20this%20HOA.`);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { name, email, username } });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        module: "AUTHORIZATION",
        action: "TENANT_USER_PROFILE_UPDATED",
        entityType: "User",
        entityId: userId,
        metadata: { oldEmail: user.email, newEmail: email },
      },
    });
  });
  redirect(`${userReturnTo(tenantId, userId)}?success=User%20profile%20updated%20successfully.`);
}

export async function replaceTenantUserRolesAction(formData: FormData) {
  const tenantId = clean(formData.get("tenantId"));
  const userId = clean(formData.get("userId"));
  const returnTo = userReturnTo(tenantId, userId);
  const actor = await requireTenantUserManager(tenantId, Permission.ROLES_MANAGE);
  if (!tenantId || !userId) redirect("/platform/tenants?error=Tenant%20user%20not%20found.");
  if (actor.id === userId) redirect(`${returnTo}?error=Use%20another%20authorized%20administrator%20to%20change%20your%20own%20roles.`);
  let reason: string;
  try {
    reason = requireAuthorizationChangeReason(formData.get("reason"));
    requireAuthorizationConfirmation(formData.get("confirmed"));
  } catch (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error instanceof Error ? error.message : "Role assignments could not be changed.")}`);
  }

  const desiredRoles = [...new Set(formData.getAll("roles").map(String))]
    .filter((role): role is Role => Object.values(Role).includes(role as Role));
  if (!desiredRoles.length || desiredRoles.some((role) => !tenantUserRoles.includes(role))) {
    redirect(`${returnTo}?error=Select%20at%20least%20one%20supported%20tenant%20role.`);
  }
  if (desiredRoles.some((role) => !roleCanBeGranted(actor.roles, role))) {
    redirect(`${returnTo}?error=You%20cannot%20grant%20one%20or%20more%20selected%20roles.`);
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    include: {
      userRoleAssignments: true,
      tenantCustomRoleAssignments: {
        where: { active: true },
        include: { role: { include: { permissions: true } } },
      },
    },
  });
  if (!user) redirect(`/platform/tenants/${tenantId}/users?error=Tenant%20user%20not%20found.`);
  const oldRoles = effectiveRolesForUser(user.role, user.userRoleAssignments);
  const newRoles = [...desiredRoles].sort((left, right) => left.localeCompare(right));
  const primaryRole = primaryRoleForRoles(newRoles, user.role);
  const oldPermissions = [...effectivePermissionsForAccess(oldRoles, user.tenantCustomRoleAssignments)].sort();
  const newPermissions = [...effectivePermissionsForAccess(newRoles, user.tenantCustomRoleAssignments)].sort();
  const changedAt = new Date();

  await prisma.$transaction(async (tx) => {
    for (const role of newRoles) {
      await tx.userRoleAssignment.upsert({
        where: { tenantId_userId_role: { tenantId, userId, role } },
        update: { active: true, assignedBy: actor.id, assignedAt: changedAt },
        create: { tenantId, userId, role, active: true, assignedBy: actor.id, assignedAt: changedAt },
      });
    }
    await tx.userRoleAssignment.updateMany({
      where: { tenantId, userId, role: { notIn: newRoles }, active: true },
      data: { active: false },
    });
    await tx.user.update({ where: { id: userId }, data: { role: primaryRole } });
    const revokedSessions = await tx.userSession.updateMany({
      where: { tenantId, userId, revokedAt: null },
      data: { revokedAt: changedAt },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        module: "AUTHORIZATION",
        action: "TENANT_USER_ROLES_REPLACED",
        entityType: "User",
        entityId: userId,
        reason,
        metadata: {
          oldRoles,
          newRoles,
          compatibilityPrimaryRole: primaryRole,
          oldPermissions,
          newPermissions,
          highRiskPermissions: highRiskPermissionSelection(newPermissions),
          revokedSessions: revokedSessions.count,
        },
      },
    });
  });

  redirect(`${returnTo}?success=Roles%20updated.%20Existing%20sessions%20were%20revoked.`);
}
