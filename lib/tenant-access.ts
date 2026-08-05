import "server-only";

import { TenantModule } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { platformRoles } from "@/lib/authorization/tenant-scope";
import { requireTenantModule } from "@/lib/tenant";

export { tenantRecord, tenantWhere } from "@/lib/authorization/tenant-scope";
export { platformRoles };

export async function requireTenantAccess(module?: TenantModule) {
  const user = await requireUser();
  if (module && !platformRoles.has(user.role)) await requireTenantModule(user.tenantId, module);
  return user;
}
