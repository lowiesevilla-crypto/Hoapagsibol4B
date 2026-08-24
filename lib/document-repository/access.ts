import type { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { Permission, hasPermission } from "@/lib/authorization/permissions";
import { resolveDocumentManagementEntitlement } from "@/lib/document-repository/entitlement";
import { currentTenantContext, type TenantRequestContext } from "@/lib/tenant-context";

function effectiveRoles(context: TenantRequestContext) {
  const roles = context.roles?.length ? context.roles : context.role ? [context.role] : [];
  return roles as readonly Role[];
}

function contextHasRepositoryPermission(context: TenantRequestContext, permission: Permission) {
  if (context.permissions?.has(permission)) return true;
  const roles = effectiveRoles(context);
  return roles.length > 0 && hasPermission(roles, permission);
}

async function resolveRepositoryContext() {
  const existing = currentTenantContext();
  if (existing) return existing;

  // Server-component rendering may cross async boundaries after requireUser().
  // Re-resolve the authenticated actor rather than failing a valid request only
  // because the ambient AsyncLocalStorage context is temporarily unavailable.
  const user = await requireUser();
  return currentTenantContext() ?? {
    tenantId: user.tenantId,
    role: user.role,
    roles: user.roles,
    permissions: new Set(user.permissions),
    platform: user.roles.some((role) => role === "SUPER_ADMIN" || role === "PLATFORM_ADMIN"),
  } satisfies TenantRequestContext;
}

export async function requireDocumentManagementEntitlement() {
  const context = await resolveRepositoryContext();
  const entitlement = await resolveDocumentManagementEntitlement(context.tenantId);
  if (!entitlement.enabled) {
    throw new Error("Document Management is not included in this tenant subscription.");
  }
  return { context, entitlement };
}

export function hasRepositoryPermission(permission: Permission) {
  const context = currentTenantContext();
  return context ? contextHasRepositoryPermission(context, permission) : false;
}

export async function canRepositoryPermission(permission: Permission) {
  const context = await resolveRepositoryContext();
  return contextHasRepositoryPermission(context, permission);
}

export async function requireRepositoryPermission(permission: Permission) {
  const resolved = await requireDocumentManagementEntitlement();
  if (!contextHasRepositoryPermission(resolved.context, permission)) {
    throw new Error("You do not have permission to perform this Document Management action.");
  }
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
