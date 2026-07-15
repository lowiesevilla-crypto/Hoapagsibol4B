import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { adminHomeForRole } from "@/lib/role-access";

const billingSettingsRoles = new Set<Role>([
  Role.SUPER_ADMIN,
  Role.SYSTEM_ADMIN,
  Role.HOA_ADMIN,
  Role.ADMIN,
  Role.BILLING_MANAGER,
]);

export async function requireBillingSettingsAccess() {
  const user = await requireUser();
  if (!billingSettingsRoles.has(user.role)) redirect(adminHomeForRole(user.role));
  return user;
}
