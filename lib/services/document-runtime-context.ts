import "server-only";

import { Role, type User } from "@prisma/client";
import { DocumentRuntimeError } from "@/lib/services/document-runtime-errors";

export type DocumentPermission =
  | "VIEW_DEFINITIONS"
  | "MANAGE_DEFINITIONS"
  | "VIEW_TEMPLATES"
  | "MANAGE_TENANT_TEMPLATES"
  | "PUBLISH_TEMPLATES"
  | "MANAGE_POLICIES"
  | "MANAGE_WORKFLOWS"
  | "APPROVE_REQUESTS"
  | "OVERRIDE_POLICY"
  | "MANAGE_NUMBERING"
  | "REVOKE_VERIFICATION"
  | "VIEW_AUDIT"
  | "PREVIEW_DOCUMENT"
  | "VALIDATE_GENERATION"
  | "ISSUE_DOCUMENT"
  | "REISSUE_DOCUMENT"
  | "RELEASE_DOCUMENT"
  | "VIEW_ISSUED_DOCUMENT"
  | "VIEW_GENERATION_HISTORY"
  | "RETRY_GENERATION";

export type DocumentExecutionContext = {
  authenticatedUserId: string;
  tenantId: string;
  role: Role;
  platform: boolean;
  correlationId?: string;
  permissions?: readonly DocumentPermission[];
};

export function documentContextFromUser(user: Pick<User, "id" | "tenantId" | "role">, correlationId?: string): DocumentExecutionContext {
  return {
    authenticatedUserId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    platform: user.role === Role.SUPER_ADMIN || user.role === Role.PLATFORM_ADMIN,
    correlationId,
  };
}

export function assertDocumentTenant(context: DocumentExecutionContext, tenantId: string) {
  if (!context.tenantId || context.tenantId !== tenantId) throw new DocumentRuntimeError("CROSS_TENANT", "Cross-tenant document access rejected.");
}

export function requireDocumentPermission(context: DocumentExecutionContext, permission: DocumentPermission) {
  if (context.platform) return;
  const permissions = context.permissions || permissionsForRole(context.role);
  if (!permissions.includes(permission)) throw new DocumentRuntimeError("PERMISSION_DENIED", `Permission denied for document operation: ${permission}.`);
}

export function permissionsForRole(role: Role): readonly DocumentPermission[] {
  if (role === Role.HOMEOWNER) return ["VIEW_DEFINITIONS", "PREVIEW_DOCUMENT", "VALIDATE_GENERATION", "VIEW_ISSUED_DOCUMENT"];
  if (role === Role.EMPLOYEE) return ["VIEW_DEFINITIONS"];
  if (role === Role.BILLING_MANAGER) return ["VIEW_DEFINITIONS", "VIEW_TEMPLATES", "APPROVE_REQUESTS", "PREVIEW_DOCUMENT", "VALIDATE_GENERATION", "VIEW_ISSUED_DOCUMENT"];
  if (role === Role.STAFF || role === Role.PAYROLL_MANAGER) return ["VIEW_DEFINITIONS", "VIEW_TEMPLATES"];
  return [
    "VIEW_DEFINITIONS", "MANAGE_DEFINITIONS", "VIEW_TEMPLATES", "MANAGE_TENANT_TEMPLATES",
    "PUBLISH_TEMPLATES", "MANAGE_POLICIES", "MANAGE_WORKFLOWS", "APPROVE_REQUESTS",
    "OVERRIDE_POLICY", "MANAGE_NUMBERING", "REVOKE_VERIFICATION", "VIEW_AUDIT",
    "PREVIEW_DOCUMENT", "VALIDATE_GENERATION", "ISSUE_DOCUMENT", "REISSUE_DOCUMENT",
    "RELEASE_DOCUMENT", "VIEW_ISSUED_DOCUMENT", "VIEW_GENERATION_HISTORY", "RETRY_GENERATION",
  ];
}
