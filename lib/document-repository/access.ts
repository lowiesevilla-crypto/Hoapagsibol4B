import type { Role } from "@prisma/client";
import { Permission, hasPermission } from "@/lib/authorization/permissions";
import { resolveDocumentManagementEntitlement } from "@/lib/document-repository/entitlement";
import { currentTenantContext } from "@/lib/tenant-context";

function effectiveRoles(context: NonNullable<ReturnType<typeof currentTenantContext>>) {
  const roles = context.roles?.length ? context.roles : context.role ? [context.role] : [];
  return roles as readonly Role[];
}

export async function requireDocumentManagementEntitlement() {
  const context = currentTenantContext();
  if (!context) throw new Error("Tenant context is required for Document Management.");
  const entitlement = await resolveDocumentManagementEntitlement(context.tenantId);
  if (!entitlement.enabled) {
    throw new Error("Document Management is not included in this tenant subscription.");
  }
  return { context, entitlement };
}

export function hasRepositoryPermission(permission: Permission) {
  const context = currentTenantContext();
  if (!context) return false;
  if (context.permissions?.has(permission)) return true;
  const roles = effectiveRoles(context);
  return roles.length > 0 && hasPermission(roles, permission);
}

export async function requireRepositoryPermission(permission: Permission) {
  const resolved = await requireDocumentManagementEntitlement();
  if (!hasRepositoryPermission(permission)) throw new Error("You do not have permission to perform this Document Management action.");
  return resolved;
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
