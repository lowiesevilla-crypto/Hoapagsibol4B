import type { Role, TenantModule } from "@prisma/client";
import { Permission, hasPermission } from "@/lib/authorization/permissions";
import { DOCUMENT_MANAGEMENT_FEATURE_CODE } from "@/lib/document-repository/constants";
import { currentTenantContext } from "@/lib/tenant-context";

function effectiveRoles(context: NonNullable<ReturnType<typeof currentTenantContext>>) {
  const roles = context.roles?.length ? context.roles : context.role ? [context.role] : [];
  return roles as readonly Role[];
}

export function documentManagementModuleValue() {
  // Kept as a string-backed cast until the Prisma enum extension in Phase 1 schema integration
  // adds DOCUMENT_MANAGEMENT to TenantModule. This avoids reusing the generated-document
  // DOCUMENTS entitlement and preserves a distinct commercial capability boundary.
  return DOCUMENT_MANAGEMENT_FEATURE_CODE as TenantModule;
}

export function hasDocumentManagementEntitlement() {
  const context = currentTenantContext();
  if (!context) return false;
  if (!context.enabledModules) return false;
  return context.enabledModules.has(documentManagementModuleValue());
}

export function requireDocumentManagementEntitlement() {
  const context = currentTenantContext();
  if (!context) throw new Error("Tenant context is required for Document Management.");
  if (!hasDocumentManagementEntitlement()) {
    throw new Error("Document Management is not included in this tenant subscription.");
  }
  return context;
}

export function hasRepositoryPermission(permission: Permission) {
  const context = currentTenantContext();
  if (!context) return false;
  if (context.permissions?.has(permission)) return true;
  const roles = effectiveRoles(context);
  return roles.length > 0 && hasPermission(roles, permission);
}

export function requireRepositoryPermission(permission: Permission) {
  const context = requireDocumentManagementEntitlement();
  if (!hasRepositoryPermission(permission)) throw new Error("You do not have permission to perform this Document Management action.");
  return context;
}

export function requireRepositoryRead() {
  return requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_READ);
}

export function requireRepositoryUpload() {
  return requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_UPLOAD);
}

export function requireRepositoryDelete() {
  return requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_DELETE);
}

export function requireHomeownerRepositoryRead() {
  return requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_READ_PUBLIC);
}

export function assertRepositoryTenant(documentTenantId: string) {
  const context = currentTenantContext();
  if (!context) throw new Error("Tenant context is required for Document Management.");
  if (context.tenantId !== documentTenantId) throw new Error("Cross-tenant document access blocked.");
  return context;
}
