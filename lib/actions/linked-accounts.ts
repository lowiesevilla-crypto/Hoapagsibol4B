"use server";

import { redirect } from "next/navigation";
import { createSession, defaultHomeForRoles, deleteSession, requireUser } from "@/lib/auth";
import { isPlatformRoleSet } from "@/lib/authorization/effective-access";
import { prisma } from "@/lib/db";
import { listLinkedAccounts } from "@/lib/linked-accounts";
import { setTenantContext } from "@/lib/tenant-context";

export async function switchLinkedAccountAction(formData: FormData) {
  const currentUser = await requireUser();
  const targetUserId = String(formData.get("targetUserId") || "").trim();
  if (!targetUserId) throw new Error("Choose an HOA account to open.");

  const linkedAccounts = await listLinkedAccounts(currentUser.email, currentUser.id);
  const target = linkedAccounts.find((account) => account.userId === targetUserId);
  if (!target) throw new Error("The selected account is not linked to your verified email address.");

  if (target.current) redirect(defaultHomeForRoles(target.roles, target.primaryRole));

  await deleteSession();
  const platform = isPlatformRoleSet(target.roles);
  setTenantContext({
    tenantId: target.tenantId,
    role: target.primaryRole,
    roles: target.roles,
    platform,
    enabledModules: platform ? undefined : new Set(target.enabledModules),
  });

  await prisma.auditLog.create({
    data: {
      tenantId: target.tenantId,
      actorId: target.userId,
      module: "AUTH",
      action: "LINKED_ACCOUNT_SWITCH",
      entityType: "User",
      entityId: target.userId,
      metadata: {
        sourceTenantId: currentUser.tenantId,
        targetTenantId: target.tenantId,
        roles: target.roles,
      },
    },
  });

  await createSession({
    userId: target.userId,
    role: target.primaryRole,
    roles: target.roles,
    tenantId: target.tenantId,
    tenantSlug: target.tenantSlug,
  });
  redirect(defaultHomeForRoles(target.roles, target.primaryRole));
}
