import { Role } from "@prisma/client";

export const documentTemplateAdminRoles = [
  Role.SUPER_ADMIN,
  Role.PLATFORM_ADMIN,
  Role.SYSTEM_ADMIN,
  Role.HOA_ADMIN,
  Role.ADMIN,
] as const;

export function canManageDocumentTemplates(role: Role) {
  return documentTemplateAdminRoles.includes(role as typeof documentTemplateAdminRoles[number]);
}
