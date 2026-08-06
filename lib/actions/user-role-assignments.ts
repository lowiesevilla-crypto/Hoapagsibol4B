"use server";

import { HomeownerActivationStatus, HomeownerStatus, Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  effectiveRolesForUser,
  primaryRoleForRoles,
} from "@/lib/authorization/effective-access";
import { canAssignRole } from "@/lib/authorization/role-policy";
import {
  Permission,
  type Permission as PermissionValue,
} from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import {
  ensureHomeownerAccountNumber,
  isValidHomeownerAccountNumber,
} from "@/lib/services/homeowner-account-number";
import { sendHomeownerActivationEmail } from "@/lib/services/homeowner-activation";
import {
  configurePureHomeownerAccount,
  type HomeownerConversionProfileInput,
  type PureHomeownerConfigurationResult,
} from "@/lib/services/homeowner-role-conversion";
import { tenantUserRoles } from "@/lib/tenant-roles";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function userDetailPath(tenantId: string, userId: string) {
  return `/platform/tenants/${tenantId}/users/${userId}`;
}

function redirectWithMessage(tenantId: string, userId: string, kind: "success" | "error", message: string): never {
  redirect(`${userDetailPath(tenantId, userId)}?${kind}=${encodeURIComponent(message)}`);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The homeowner account configuration could not be completed.";
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

async function deliverHomeownerInvitation(result: PureHomeownerConfigurationResult, actorId: string) {
  if (!result.activation || !result.invitation) return false;
  await sendHomeownerActivationEmail({
    ...result.invitation,
    temporaryPassword: result.activation.temporaryPassword,
    emailVerificationToken: result.activation.emailVerificationToken,
    expiresAt: result.activation.expiresAt,
    actorId,
  });
  return true;
}

function parseConversionProfile(formData: FormData): HomeownerConversionProfileInput {
  const phone = clean(formData.get("phone"));
  const address = clean(formData.get("address"));
  const block = clean(formData.get("block"));
  const lot = clean(formData.get("lot"));
  const phase = clean(formData.get("phase")) || null;
  const propertyType = clean(formData.get("propertyType")) || null;
  const occupancyStatus = clean(formData.get("occupancyStatus")) || null;
  const statusValue = clean(formData.get("status"));
  const monthlyDuesAmount = Number(clean(formData.get("monthlyDuesAmount")));

  if (!phone || !address || !block || !lot) {
    throw new Error("Phone, address, block, and lot are required to create the homeowner profile.");
  }
  if (phone.length > 30 || address.length > 250 || block.length > 30 || lot.length > 30) {
    throw new Error("One or more homeowner profile fields exceed the allowed length.");
  }
  if (!Number.isFinite(monthlyDuesAmount) || monthlyDuesAmount <= 0 || monthlyDuesAmount > 10_000_000) {
    throw new Error("Monthly dues must be greater than zero and within the allowed amount.");
  }
  const status = statusValue === HomeownerStatus.INACTIVE ? HomeownerStatus.INACTIVE : HomeownerStatus.ACTIVE;
  return { phone, address, block, lot, phase, propertyType, occupancyStatus, status, monthlyDuesAmount };
}

export async function updateTenantUserProfileAction(formData: FormData) {
  const tenantId = clean(formData.get("tenantId"));
  const userId = clean(formData.get("userId"));
  const actor = await requireTenantUserManager(tenantId, Permission.USERS_MANAGE);
  const name = clean(formData.get("name"));
  const email = clean(formData.get("email")).toLowerCase();
  const username = clean(formData.get("username")) || null;
  if (!tenantId || !userId || !name || !email) {
    redirect(`${userDetailPath(tenantId, userId)}?error=Check%20the%20required%20user%20fields.`);
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
  if (duplicate) redirect(`${userDetailPath(tenantId, userId)}?error=Email%20or%20username%20is%20already%20used%20in%20this%20HOA.`);
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
  redirectWithMessage(tenantId, userId, "success", "User profile updated successfully.");
}

export async function convertTenantUserToHomeownerAction(formData: FormData) {
  const tenantId = clean(formData.get("tenantId"));
  const userId = clean(formData.get("userId"));
  const actor = await requireTenantUserManager(tenantId, Permission.ROLES_MANAGE);
  if (!tenantId || !userId) redirect("/platform/tenants?error=Tenant%20user%20not%20found.");
  if (actor.id === userId) redirectWithMessage(tenantId, userId, "error", "Use another authorized administrator to convert your own account.");
  if (!roleCanBeGranted(actor.roles, Role.HOMEOWNER)) {
    redirectWithMessage(tenantId, userId, "error", "You cannot grant the Homeowner role.");
  }

  let result: PureHomeownerConfigurationResult;
  try {
    const profile = parseConversionProfile(formData);
    result = await configurePureHomeownerAccount({
      tenantId,
      userId,
      actorId: actor.id,
      profile,
      accountNumber: clean(formData.get("accountNumber")) || null,
    });
  } catch (error) {
    redirectWithMessage(tenantId, userId, "error", errorMessage(error));
  }
  const invited = await deliverHomeownerInvitation(result!, actor.id);
  redirectWithMessage(
    tenantId,
    userId,
    "success",
    invited
      ? "User converted to Homeowner. The profile and account number were configured, previous access was revoked, and an activation invitation was queued."
      : "User converted to Homeowner. The profile and account number were configured and previous access was revoked. Send an activation invitation after registering an active email and operational profile.",
  );
}

export async function repairTenantHomeownerConfigurationAction(formData: FormData) {
  const tenantId = clean(formData.get("tenantId"));
  const userId = clean(formData.get("userId"));
  const actor = await requireTenantUserManager(tenantId, Permission.ROLES_MANAGE);
  if (!tenantId || !userId) redirect("/platform/tenants?error=Tenant%20user%20not%20found.");
  if (actor.id === userId) redirectWithMessage(tenantId, userId, "error", "Use another authorized administrator to repair your own account.");

  const user = await prisma.user.findFirst({
    where: { tenantId, id: userId },
    include: { homeownerProfile: true, userRoleAssignments: true },
  });
  if (!user?.homeownerProfile) redirectWithMessage(tenantId, userId, "error", "This user does not have a homeowner profile. Complete the conversion form first.");
  const roles = effectiveRolesForUser(user.role, user.userRoleAssignments);
  if (roles.length !== 1 || roles[0] !== Role.HOMEOWNER) {
    redirectWithMessage(tenantId, userId, "error", "Configuration repair is available only for a pure Homeowner account. Save the intended roles first.");
  }

  let result: PureHomeownerConfigurationResult;
  try {
    result = await configurePureHomeownerAccount({ tenantId, userId, actorId: actor.id });
  } catch (error) {
    redirectWithMessage(tenantId, userId, "error", errorMessage(error));
  }
  const invited = await deliverHomeownerInvitation(result!, actor.id);
  redirectWithMessage(
    tenantId,
    userId,
    "success",
    invited
      ? "Homeowner configuration repaired. A valid account number is assigned, previous incomplete credentials were revoked, and a new activation invitation was queued."
      : "Homeowner configuration repaired. The account number and digital-access state are now consistent.",
  );
}

export async function replaceTenantUserRolesAction(formData: FormData) {
  const tenantId = clean(formData.get("tenantId"));
  const userId = clean(formData.get("userId"));
  const actor = await requireTenantUserManager(tenantId, Permission.ROLES_MANAGE);
  if (!tenantId || !userId) redirect("/platform/tenants?error=Tenant%20user%20not%20found.");
  if (actor.id === userId) redirectWithMessage(tenantId, userId, "error", "Use another authorized administrator to change your own roles.");

  const desiredRoles = [...new Set(formData.getAll("roles").map(String))]
    .filter((role): role is Role => Object.values(Role).includes(role as Role));
  if (!desiredRoles.length || desiredRoles.some((role) => !tenantUserRoles.includes(role))) {
    redirectWithMessage(tenantId, userId, "error", "Select at least one supported tenant role.");
  }
  if (desiredRoles.some((role) => !roleCanBeGranted(actor.roles, role))) {
    redirectWithMessage(tenantId, userId, "error", "You cannot grant one or more selected roles.");
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    include: { userRoleAssignments: true, homeownerProfile: true },
  });
  if (!user) redirect(`/platform/tenants/${tenantId}/users?error=Tenant%20user%20not%20found.`);
  const oldRoles = effectiveRolesForUser(user.role, user.userRoleAssignments);
  const newRoles = [...desiredRoles].sort((left, right) => left.localeCompare(right));
  const includesHomeowner = newRoles.includes(Role.HOMEOWNER);
  const pureHomeowner = newRoles.length === 1 && newRoles[0] === Role.HOMEOWNER;

  if (includesHomeowner && !user.homeownerProfile) {
    redirectWithMessage(
      tenantId,
      userId,
      "error",
      "A Homeowner role requires a complete homeowner profile. Use the conversion form below to enter the property, contact, and monthly-dues information.",
    );
  }

  const currentlyPureHomeowner = oldRoles.length === 1 && oldRoles[0] === Role.HOMEOWNER;
  const homeownerNeedsBootstrap = Boolean(
    pureHomeowner
    && user.homeownerProfile
    && (
      !currentlyPureHomeowner
      || !isValidHomeownerAccountNumber(user.homeownerProfile.accountNumber)
      || user.homeownerProfile.activationStatus === HomeownerActivationStatus.NOT_INVITED
    )
  );

  if (homeownerNeedsBootstrap) {
    let result: PureHomeownerConfigurationResult;
    try {
      result = await configurePureHomeownerAccount({ tenantId, userId, actorId: actor.id });
    } catch (error) {
      redirectWithMessage(tenantId, userId, "error", errorMessage(error));
    }
    const invited = await deliverHomeownerInvitation(result!, actor.id);
    redirectWithMessage(
      tenantId,
      userId,
      "success",
      invited
        ? "Roles updated and homeowner configuration completed. Existing sessions and previous incomplete credentials were revoked, and an activation invitation was queued."
        : "Roles updated and homeowner configuration completed. Existing sessions were revoked.",
    );
  }

  let accountNumberGenerated = false;
  if (includesHomeowner && user.homeownerProfile) {
    const previous = user.homeownerProfile.accountNumber;
    try {
      const assigned = await ensureHomeownerAccountNumber(user.homeownerProfile);
      accountNumberGenerated = previous !== assigned;
    } catch (error) {
      redirectWithMessage(tenantId, userId, "error", errorMessage(error));
    }
  }

  const primaryRole = primaryRoleForRoles(newRoles, user.role);
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
        metadata: {
          oldRoles,
          newRoles,
          compatibilityPrimaryRole: primaryRole,
          revokedSessions: revokedSessions.count,
          homeownerAccountNumberGenerated: accountNumberGenerated,
        },
      },
    });
  });

  redirectWithMessage(tenantId, userId, "success", "Roles updated. Existing sessions were revoked.");
}
