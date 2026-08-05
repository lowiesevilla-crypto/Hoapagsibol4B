"use server";

import { hash } from "bcryptjs";
import { Role, TenantModule, TenantStatus, TenantSubscriptionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tenantAccessRoles, tenantUserRoles } from "@/lib/tenant-roles";

async function requirePlatformUser() {
  const user = await requireUser();
  if (!user.roles.includes(Role.SUPER_ADMIN) && !user.roles.includes(Role.PLATFORM_ADMIN)) redirect("/admin/dashboard");
  return user;
}

function clean(value: FormDataEntryValue | null) { return String(value || "").trim(); }
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export async function createTenantAction(formData: FormData) {
  await requirePlatformUser();
  const name = clean(formData.get("name"));
  const shortName = clean(formData.get("shortName"));
  const slug = clean(formData.get("slug")).toLowerCase();
  const adminName = clean(formData.get("adminName"));
  const adminEmail = clean(formData.get("adminEmail")).toLowerCase();
  const password = clean(formData.get("password"));
  const adminRole = clean(formData.get("adminRole")) as Role;
  if (!name || !shortName || !slugPattern.test(slug) || !adminName || !adminEmail || password.length < 10 || !tenantAccessRoles.includes(adminRole)) redirect("/platform/tenants/new?error=Complete%20all%20required%20fields.%20Slug%20may%20contain%20lowercase%20letters,%20numbers,%20and%20single%20hyphens%20only.");
  if (await prisma.tenant.findUnique({ where: { slug } })) redirect("/platform/tenants/new?error=That%20tenant%20slug%20is%20already%20used.");
  const modules = Object.values(TenantModule);
  const actor = await requirePlatformUser();
  const tenant = await prisma.$transaction(async (tx) => {
    const created = await tx.tenant.create({ data: { name, shortName, slug, address: clean(formData.get("address")) || null, contactNumber: clean(formData.get("contactNumber")) || null, email: clean(formData.get("email")) || null, secRegistrationNumber: clean(formData.get("secRegistrationNumber")) || null, tinNumber: clean(formData.get("tinNumber")) || null, subscriptionPlan: clean(formData.get("subscriptionPlan")) || "STANDARD", subscriptionStatus: TenantSubscriptionStatus.TRIAL, moduleEntitlements: { create: modules.map((module) => ({ module, enabled: formData.getAll("modules").includes(module) })) } } });
    const adminUser = await tx.user.create({ data: { tenantId: created.id, name: adminName, email: adminEmail, passwordHash: await hash(password, 12), role: adminRole } });
    await tx.userRoleAssignment.create({ data: { tenantId: created.id, userId: adminUser.id, role: adminRole, assignedBy: actor.id } });
    await tx.auditLog.create({ data: { tenantId: created.id, actorId: actor.id, module: "PLATFORM", action: "TENANT_CREATED", entityType: "Tenant", entityId: created.id, metadata: { slug: created.slug, plan: created.subscriptionPlan, initialAdminRole: adminRole } } });
    return created;
  });
  redirect(`/platform/tenants/${tenant.id}?success=created&message=Tenant%20and%20its%20first%20administrator%20were%20created%20successfully.`);
}

export async function createTenantUserAction(formData: FormData) {
  const actor = await requirePlatformUser();
  const tenantId = clean(formData.get("tenantId"));
  const role = clean(formData.get("role")) as Role;
  const name = clean(formData.get("name"));
  const email = clean(formData.get("email")).toLowerCase();
  const username = clean(formData.get("username")) || null;
  const password = clean(formData.get("password"));
  if (!tenantId || !name || !email || password.length < 10 || !tenantAccessRoles.includes(role)) {
    redirect(`/platform/tenants/${tenantId}/users?error=Complete%20the%20new%20access%20account%20fields.%20Passwords%20must%20contain%20at%20least%2010%20characters.`);
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) redirect("/platform/tenants?error=Tenant%20not%20found.");
  const duplicate = await prisma.user.findFirst({ where: { tenantId, OR: [{ email }, ...(username ? [{ username }] : [])] } });
  if (duplicate) redirect(`/platform/tenants/${tenantId}/users?error=Email%20or%20username%20is%20already%20used%20in%20this%20HOA.`);
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { tenantId, name, email, username, passwordHash: await hash(password, 12), role } });
    await tx.userRoleAssignment.create({ data: { tenantId, userId: user.id, role, assignedBy: actor.id } });
    await tx.auditLog.create({ data: { tenantId, actorId: actor.id, module: "PLATFORM", action: "TENANT_ACCESS_ACCOUNT_CREATED", entityType: "User", entityId: user.id, metadata: { roles: [role], email } } });
    return user;
  });
  redirect(`/platform/tenants/${tenantId}/users/${created.id}?success=created&message=${encodeURIComponent(`${role.replaceAll("_", " ")} access account created successfully.`)}`);
}

export async function updateTenantAction(formData: FormData) {
  const actor = await requirePlatformUser();
  const tenantId = clean(formData.get("tenantId"));
  const status = clean(formData.get("status")) as TenantStatus;
  const subscriptionStatus = clean(formData.get("subscriptionStatus")) as TenantSubscriptionStatus;
  const slug = clean(formData.get("slug")).toLowerCase();
  if (!tenantId || !Object.values(TenantStatus).includes(status) || !Object.values(TenantSubscriptionStatus).includes(subscriptionStatus)) throw new Error("Invalid tenant settings.");
  if (!slugPattern.test(slug)) redirect(`/platform/tenants/${tenantId}?error=Enter%20a%20valid%20URL-safe%20slug.`);
  const current = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!current) redirect("/platform/tenants?error=Tenant%20not%20found.");
  const duplicate = await prisma.tenant.findFirst({ where: { slug, id: { not: tenantId } } });
  if (duplicate) redirect(`/platform/tenants/${tenantId}?error=That%20tenant%20slug%20is%20already%20used.`);
  const enabled = new Set(formData.getAll("modules").map(String));
  await prisma.$transaction([
    prisma.tenant.update({ where: { id: tenantId }, data: { slug, status, subscriptionStatus, subscriptionPlan: clean(formData.get("subscriptionPlan")) || "STANDARD" } }),
    ...Object.values(TenantModule).map((module) => prisma.tenantModuleEntitlement.upsert({ where: { tenantId_module: { tenantId, module } }, update: { enabled: enabled.has(module) }, create: { tenantId, module, enabled: enabled.has(module) } })),
  ]);
  const advisory = clean(formData.get("advisory"));
  await prisma.tenantAdvisory.updateMany({ where: { tenantId, active: true }, data: { active: false } });
  if (advisory) await prisma.tenantAdvisory.create({ data: { tenantId, message: advisory } });
  await prisma.auditLog.create({ data: { tenantId, actorId: actor.id, module: "PLATFORM", action: current.slug === slug ? "TENANT_UPDATED" : "TENANT_SLUG_UPDATED", entityType: "Tenant", entityId: tenantId, metadata: { oldSlug: current.slug, newSlug: slug, oldStatus: current.status, newStatus: status, advisoryUpdated: Boolean(advisory) } } });
  revalidatePath(`/platform/tenants/${tenantId}`);
  redirect(`/platform/tenants/${tenantId}?success=Tenant%20settings%20updated.`);
}

export async function updateTenantUserAction(formData: FormData) {
  const actor = await requirePlatformUser(); const tenantId = clean(formData.get("tenantId")); const userId = clean(formData.get("userId"));
  const role = clean(formData.get("role")) as Role; const name = clean(formData.get("name")); const email = clean(formData.get("email")).toLowerCase(); const username = clean(formData.get("username")) || null;
  if (!tenantId || !userId || !name || !email || !tenantUserRoles.includes(role)) redirect(`/platform/tenants/${tenantId}/users/${userId}?error=Check%20the%20required%20user%20fields.`);
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId }, include: { userRoleAssignments: { where: { active: true } } } }); if (!user) redirect(`/platform/tenants/${tenantId}/users?error=Tenant%20user%20not%20found.`);
  const duplicate = await prisma.user.findFirst({ where: { tenantId, id: { not: userId }, OR: [{ email }, ...(username ? [{ username }] : [])] } });
  if (duplicate) redirect(`/platform/tenants/${tenantId}/users/${userId}?error=Email%20or%20username%20is%20already%20used%20in%20this%20HOA.`);
  const oldRoles = user.userRoleAssignments.length ? user.userRoleAssignments.map((assignment) => assignment.role) : [user.role];
  const roleChanged = oldRoles.length !== 1 || oldRoles[0] !== role;
  const changedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { name, email, username, role } });
    await tx.userRoleAssignment.upsert({ where: { tenantId_userId_role: { tenantId, userId, role } }, update: { active: true, assignedBy: actor.id, assignedAt: changedAt }, create: { tenantId, userId, role, assignedBy: actor.id, assignedAt: changedAt } });
    await tx.userRoleAssignment.updateMany({ where: { tenantId, userId, role: { not: role }, active: true }, data: { active: false } });
    const revokedSessions = roleChanged
      ? await tx.userSession.updateMany({
          where: { tenantId, userId, revokedAt: null },
          data: { revokedAt: changedAt },
        })
      : { count: 0 };
    await tx.auditLog.create({ data: { tenantId, actorId: actor.id, module: "AUTHORIZATION", action: roleChanged ? "TENANT_USER_ROLES_REPLACED" : "TENANT_USER_UPDATED", entityType: "User", entityId: userId, metadata: { oldRoles, newRoles: [role], revokedSessions: revokedSessions.count } } });
  });
  redirect(`/platform/tenants/${tenantId}/users/${userId}?success=User%20updated%20successfully.`);
}

export async function toggleTenantUserAction(formData: FormData) {
  const actor = await requirePlatformUser(); const tenantId = clean(formData.get("tenantId")); const userId = clean(formData.get("userId"));
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } }); if (!user || user.id === actor.id) redirect(`/platform/tenants/${tenantId}/users?error=This%20account%20cannot%20be%20changed.`);
  const nextActive = !user.active;
  const changedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { active: nextActive } });
    const revokedSessions = nextActive
      ? { count: 0 }
      : await tx.userSession.updateMany({
          where: { tenantId, userId: user.id, revokedAt: null },
          data: { revokedAt: changedAt },
        });
    await tx.auditLog.create({ data: { tenantId, actorId: actor.id, module: "PLATFORM", action: user.active ? "TENANT_USER_DEACTIVATED" : "TENANT_USER_ACTIVATED", entityType: "User", entityId: user.id, metadata: { active: nextActive, revokedSessions: revokedSessions.count } } });
  });
  redirect(`/platform/tenants/${tenantId}/users?success=User%20status%20updated.`);
}

export async function resetTenantUserPasswordAction(formData: FormData) {
  const actor = await requirePlatformUser(); const tenantId = clean(formData.get("tenantId")); const userId = clean(formData.get("userId")); const password = clean(formData.get("password"));
  if (password.length < 10) redirect(`/platform/tenants/${tenantId}/users/${userId}?error=Temporary%20password%20must%20contain%20at%20least%2010%20characters.`);
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } }); if (!user) redirect(`/platform/tenants/${tenantId}/users?error=Tenant%20user%20not%20found.`);
  await prisma.$transaction([prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hash(password, 12) } }), prisma.auditLog.create({ data: { tenantId, actorId: actor.id, module: "PLATFORM", action: "TENANT_USER_PASSWORD_RESET", entityType: "User", entityId: user.id } })]);
  redirect(`/platform/tenants/${tenantId}/users/${userId}?success=Temporary%20password%20saved.`);
}

export async function removeTenantUserAction(formData: FormData) {
  const actor = await requirePlatformUser(); const tenantId = clean(formData.get("tenantId")); const userId = clean(formData.get("userId"));
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId }, include: { homeownerProfile: true, employeeProfile: true, userRoleAssignments: { where: { active: true } } } });
  if (!user || user.id === actor.id) redirect(`/platform/tenants/${tenantId}/users?error=This%20account%20cannot%20be%20removed.`);
  if (user.homeownerProfile || user.employeeProfile) redirect(`/platform/tenants/${tenantId}/users/${userId}?error=Users%20with%20homeowner%20or%20employee%20records%20must%20be%20deactivated,%20not%20removed.`);
  await prisma.$transaction([prisma.auditLog.create({ data: { tenantId, actorId: actor.id, module: "PLATFORM", action: "TENANT_USER_REMOVED", entityType: "User", entityId: user.id, metadata: { email: user.email, roles: user.userRoleAssignments.map((assignment) => assignment.role) } } }), prisma.user.delete({ where: { id: user.id } })]);
  redirect(`/platform/tenants/${tenantId}/users?success=User%20removed%20from%20tenant.`);
}
