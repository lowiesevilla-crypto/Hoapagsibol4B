import { requirePermission } from "@/lib/authorization/guards";
import {
  Permission,
  type Permission as PermissionValue,
} from "@/lib/authorization/permissions";

export async function requireBillingSettingsAccess(
  permission: PermissionValue = Permission.BILLING_CONFIGURE,
) {
  return requirePermission(permission);
}
