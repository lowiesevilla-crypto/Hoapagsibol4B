import { Role } from "@prisma/client";

export const platformRoles = new Set<Role>([Role.SUPER_ADMIN, Role.PLATFORM_ADMIN]);

export function tenantRecord<T extends { tenantId: string }>(
  user: { tenantId: string; role: Role },
  record: T | null,
): T {
  if (!record || (!platformRoles.has(user.role) && record.tenantId !== user.tenantId)) {
    throw new Error("Record not found or access denied.");
  }
  return record;
}

export function tenantWhere<T extends object>(tenantId: string, where: T): T & { tenantId: string } {
  return { ...where, tenantId };
}
