import "server-only";

import { Role, TenantModule } from "@prisma/client";
import { requireTenantModule } from "@/lib/tenant";

const allowedRoles = new Set<Role>([
  Role.SUPER_ADMIN,
  Role.SYSTEM_ADMIN,
  Role.HOA_ADMIN,
  Role.BILLING_MANAGER,
  Role.ADMIN,
]);

type DashboardUser = { id: string; tenantId: string; role: Role; name: string; email: string };

export class FinanceDashboardAccessError extends Error {}

export async function assertFinanceDashboardAccess(user: DashboardUser) {
  if (!allowedRoles.has(user.role)) {
    throw new FinanceDashboardAccessError("You do not have permission to view executive finance reports.");
  }
  if (user.role !== Role.SUPER_ADMIN) {
    try {
      await Promise.all([
        requireTenantModule(user.tenantId, TenantModule.BILLING),
        requireTenantModule(user.tenantId, TenantModule.REPORTS),
      ]);
    } catch (error) {
      throw new FinanceDashboardAccessError(error instanceof Error ? error.message : "Finance reporting is not enabled for this HOA.");
    }
  }
}
