import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";

export async function requireBillingSettingsAccess() {
  return requirePermission(Permission.BILLING_CONFIGURE);
}
