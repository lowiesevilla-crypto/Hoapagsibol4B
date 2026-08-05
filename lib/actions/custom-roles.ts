"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  customPermissionsForAssignments,
  normalizePermissionSelection,
  tenantAssignablePermissions,
} from "@/lib/authorization/custom-roles";
import {
  highRiskPermissionSelection,
  requireAuthorizationChangeReason,
  requireAuthorizationConfirmation,
} from "@/lib/authorization/permission-risk";
import {
  Permission,
  type Permission as PermissionValue,
} from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function safeReturnTo(value: FormDataEntryValue | null, tenantId: string) {
  const path = clean(value);
  if (path === "/admin/settings/roles") return path;
  if (path === `/platform/tenants/${tenantId}/users`) return path;
  if (new RegExp(`^/platform/tenants/${tenantId}/users/[A-Za-z0-9_-]+$`).test(path)) return path;
  return "/admin/settings/roles";
}

async function requireCustomRoleManager(tenantId: string) {
  const actor = await requireUser();
  const platformManager = actor.permissions.includes(Permission.PLATFORM_USERS_MANAGE)
    && actor.permissions.includes(Permission.ROLES_MANAGE);
  const tenantManager = actor.tenantId === tenantId
    && actor.permissions.includes(Permission.ROLES_MANAGE);
  if (!platformManager && !tenantManager) {
    redirect("/admin/dashboard?error=You%20do%20not%20have%20permission%20to%20manage%20roles.");
  }
  if (!platformManager && actor.tenantId !== tenantId) {
    redirect("/admin/dashboard?error=Cross-tenant%20role%20management%20is%20not%20allowed.");
  }
  return actor;
}

function assertGrantable(actorPermissions: readonly PermissionValue[], permissions: readonly PermissionValue[]) {
  const invalid = permissions.filter(
    (permission) => !tenantAssignablePermissions.includes(permission) || !actorPermissions.includes(permission),
  );
  if (invalid.length) throw new Error("One or more permissions cannot be granted by this administrator.");
}

function roleKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export async function saveTenantCustomRoleAction(formData: FormData) {
  const tenantId = clean(formData.get("tenantId"));
  const actor = await requireCustomRoleManager(tenantId);
  const returnTo = safeReturnTo(formData.get("returnTo"), tenantId);
  const id = clean(formData.get("id"));
  const name = clean(formData.get("name")).slice(0, 100);
  const description = clean(formData.get("description")).slice(0, 500) || null;
  const permissions = normalizePermissionSelection(formData.getAll("permissions").map(String));
  let reason: string;
  try {
    reason = requireAuthorizationChangeReason(formData.get("reason"));
    requireAuthorizationConfirmation(formData.get("confirmed"));
    if (name.length < 3) throw new Error("Role name must contain at least 3 characters.");
    if (!permissions.length) throw new Error("Select at least one permission.");
    assertGrantable(actor.permissions, permissions);
  } catch (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error instanceof Error ? error.message : "Custom role could not be saved.")}`);
  }
  const risk = highRiskPermissionSelection(permissions);
  const key = roleKey(clean(formData.get("key")) || name);
  if (!key) redirect(`${returnTo}?error=Enter%20a%20valid%20role%20name.`);

  try {
    await prisma.$transaction(async (tx) => {
      const existing = id
        ? await tx.tenantCustomRole.findFirst({
            where: { id, tenantId },
            include: { permissions: true, assignments: { where: { active: true }, select: { userId: true } } },
          })
        : null;
      if (id && !existing) throw new Error("Custom role not found.");
      const duplicate = await tx.tenantCustomRole.findFirst({
        where: { tenantId, OR: [{ key }, { name }], ...(id ? { id: { not: id } } : {}) },
        select: { id: true },
      });
      if (duplicate) throw new Error("A custom role already uses this name or key.");
      const role = existing
        ? await tx.tenantCustomRole.update({
            where: { id: existing.id },
            data: { name, key, description, active: true, updatedById: actor.id },
          })
        : await tx.tenantCustomRole.create({
            data: { tenantId, name, key, description, active: true, createdById: actor.id, updatedById: actor.id },
          });
      await tx.tenantCustomRolePermission.deleteMany({ where: { tenantId, roleId: role.id } });
      await tx.tenantCustomRolePermission.createMany({
        data: permissions.map((permission) => ({ tenantId, roleId: role.id, permission })),
      });
      const affectedUsers = existing?.assignments.map((assignment) => assignment.userId) ?? [];
      const revoked = affectedUsers.length
        ? await tx.userSession.updateMany({
            where: { tenantId, userId: { in: affectedUsers }, revokedAt: null },
            data: { revokedAt: new Date() },
          })
        : { count: 0 };
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.id,
          module: "AUTHORIZATION",
          action: existing ? "CUSTOM_ROLE_UPDATED" : "CUSTOM_ROLE_CREATED",
          entityType: "TenantCustomRole",
          entityId: role.id,
          reason,
          metadata: {
            oldValue: existing ? {
              name: existing.name,
              key: existing.key,
              description: existing.description,
              permissions: existing.permissions.map((item) => item.permission).sort(),
            } : null,
            newValue: { name, key, description, permissions },
            highRiskPermissions: risk,
            affectedUsers: affectedUsers.length,
            revokedSessions: revoked.count,
          },
        },
      });
    });
  } catch (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error instanceof Error ? error.message : "Custom role could not be saved.")}`);
  }
  redirect(`${returnTo}?success=Custom%20role%20saved.%20Affected%20sessions%20were%20revoked.`);
}

export async function archiveTenantCustomRoleAction(formData: FormData) {
  const tenantId = clean(formData.get("tenantId"));
  const actor = await requireCustomRoleManager(tenantId);
  const returnTo = safeReturnTo(formData.get("returnTo"), tenantId);
  const id = clean(formData.get("id"));
  let reason: string;
  try {
    reason = requireAuthorizationChangeReason(formData.get("reason"));
    requireAuthorizationConfirmation(formData.get("confirmed"));
  } catch (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error instanceof Error ? error.message : "Custom role could not be archived.")}`);
  }
  try {
    await prisma.$transaction(async (tx) => {
      const role = await tx.tenantCustomRole.findFirst({
        where: { id, tenantId, active: true },
        include: { permissions: true, assignments: { where: { active: true }, select: { userId: true } } },
      });
      if (!role) throw new Error("Active custom role not found.");
      const userIds = [...new Set(role.assignments.map((assignment) => assignment.userId))];
      await tx.tenantCustomRole.update({ where: { id: role.id }, data: { active: false, updatedById: actor.id } });
      await tx.userTenantCustomRoleAssignment.updateMany({
        where: { tenantId, roleId: role.id, active: true },
        data: { active: false },
      });
      const revoked = userIds.length
        ? await tx.userSession.updateMany({
            where: { tenantId, userId: { in: userIds }, revokedAt: null },
            data: { revokedAt: new Date() },
          })
        : { count: 0 };
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.id,
          module: "AUTHORIZATION",
          action: "CUSTOM_ROLE_ARCHIVED",
          entityType: "TenantCustomRole",
          entityId: role.id,
          reason,
          metadata: {
            oldValue: { active: true, permissions: role.permissions.map((item) => item.permission).sort() },
            newValue: { active: false },
            affectedUsers: userIds.length,
            revokedSessions: revoked.count,
          },
        },
      });
    });
  } catch (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error instanceof Error ? error.message : "Custom role could not be archived.")}`);
  }
  redirect(`${returnTo}?success=Custom%20role%20archived.%20Affected%20sessions%20were%20revoked.`);
}

export async function replaceTenantUserCustomRolesAction(formData: FormData) {
  const tenantId = clean(formData.get("tenantId"));
  const userId = clean(formData.get("userId"));
  const actor = await requireCustomRoleManager(tenantId);
  const returnTo = safeReturnTo(formData.get("returnTo"), tenantId);
  if (!tenantId || !userId) redirect(`${returnTo}?error=Tenant%20user%20not%20found.`);
  if (actor.id === userId) redirect(`${returnTo}?error=Use%20another%20authorized%20administrator%20to%20change%20your%20own%20roles.`);
  let reason: string;
  try {
    reason = requireAuthorizationChangeReason(formData.get("reason"));
    requireAuthorizationConfirmation(formData.get("confirmed"));
  } catch (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error instanceof Error ? error.message : "Custom roles could not be assigned.")}`);
  }
  const desiredIds = [...new Set(formData.getAll("customRoleIds").map(String).filter(Boolean))];
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, tenantId },
        include: {
          tenantCustomRoleAssignments: {
            where: { active: true },
            include: { role: { include: { permissions: true } } },
          },
        },
      });
      if (!user) throw new Error("Tenant user not found.");
      const desiredRoles = desiredIds.length
        ? await tx.tenantCustomRole.findMany({
            where: { tenantId, id: { in: desiredIds }, active: true },
            include: { permissions: true },
          })
        : [];
      if (desiredRoles.length !== desiredIds.length) throw new Error("One or more custom roles are unavailable.");
      const desiredPermissions = [...new Set(desiredRoles.flatMap((role) => role.permissions.map((item) => item.permission)))]
        .filter((permission): permission is PermissionValue => tenantAssignablePermissions.includes(permission as PermissionValue));
      assertGrantable(actor.permissions, desiredPermissions);
      for (const role of desiredRoles) {
        await tx.userTenantCustomRoleAssignment.upsert({
          where: { tenantId_userId_roleId: { tenantId, userId, roleId: role.id } },
          update: { active: true, assignedBy: actor.id, assignedAt: new Date() },
          create: { tenantId, userId, roleId: role.id, active: true, assignedBy: actor.id },
        });
      }
      await tx.userTenantCustomRoleAssignment.updateMany({
        where: { tenantId, userId, roleId: { notIn: desiredIds }, active: true },
        data: { active: false },
      });
      const revoked = await tx.userSession.updateMany({
        where: { tenantId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const oldRoles = user.tenantCustomRoleAssignments.map((assignment) => ({
        id: assignment.role.id,
        name: assignment.role.name,
      }));
      const oldPermissions = [...customPermissionsForAssignments(user.tenantCustomRoleAssignments)].sort();
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.id,
          module: "AUTHORIZATION",
          action: "TENANT_USER_CUSTOM_ROLES_REPLACED",
          entityType: "User",
          entityId: userId,
          reason,
          metadata: {
            oldRoles,
            newRoles: desiredRoles.map((role) => ({ id: role.id, name: role.name })),
            oldPermissions,
            newPermissions: desiredPermissions.sort(),
            highRiskPermissions: highRiskPermissionSelection(desiredPermissions),
            revokedSessions: revoked.count,
          },
        },
      });
    });
  } catch (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error instanceof Error ? error.message : "Custom roles could not be assigned.")}`);
  }
  redirect(`${returnTo}?success=Custom%20roles%20updated.%20Existing%20sessions%20were%20revoked.`);
}
