import "server-only";

import { redirect } from "next/navigation";
import { defaultHomeForRoles, requireUser } from "@/lib/auth";
import type { Permission } from "@/lib/authorization/permissions";

function deniedHome(user: Awaited<ReturnType<typeof requireUser>>) {
  return defaultHomeForRoles(user.roles, user.role);
}

export async function requirePermission(permission: Permission) {
  const user = await requireUser();
  if (!user.permissions.includes(permission)) redirect(deniedHome(user));
  return user;
}

export async function requirePermissions(permissions: readonly Permission[]) {
  const user = await requireUser();
  if (!permissions.every((permission) => user.permissions.includes(permission))) {
    redirect(deniedHome(user));
  }
  return user;
}

export async function requireAnyPermission(permissions: readonly Permission[]) {
  const user = await requireUser();
  if (!permissions.some((permission) => user.permissions.includes(permission))) {
    redirect(deniedHome(user));
  }
  return user;
}
