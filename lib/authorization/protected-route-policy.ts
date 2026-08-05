const platformRoles = new Set(["SUPER_ADMIN", "PLATFORM_ADMIN"]);
const adminRoles = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "SYSTEM_ADMIN",
  "HOA_ADMIN",
  "BILLING_MANAGER",
  "PAYROLL_MANAGER",
  "STAFF",
]);

type ProtectedAccess = {
  roles?: readonly string[];
  permissions?: readonly string[];
};

function normalizeAccess(access: string | readonly string[] | ProtectedAccess) {
  if (typeof access === "string") return { roles: [access], permissions: [] };
  if (Array.isArray(access)) return { roles: [...new Set(access)], permissions: [] };
  return {
    roles: [...new Set(access.roles ?? [])],
    permissions: [...new Set(access.permissions ?? [])],
  };
}

function hasAnyRole(roles: readonly string[], accepted: ReadonlySet<string>) {
  return roles.some((role) => accepted.has(role));
}

function safeHomeForAccess(roles: readonly string[], permissions: readonly string[]) {
  if (permissions.includes("platform.access") || hasAnyRole(roles, platformRoles)) return "/platform/tenants";
  if (permissions.includes("admin.access") || hasAnyRole(roles, adminRoles)) return "/admin/dashboard";
  if (permissions.includes("homeowner.portal.access") || roles.includes("HOMEOWNER")) return "/portal/dashboard";
  if (permissions.includes("employee.portal.access") || roles.includes("EMPLOYEE")) return "/employee/attendance";
  return "/login";
}

export function isProtectedApplicationPath(pathname: string) {
  return ["/admin", "/portal", "/employee", "/platform"].some((prefix) =>
    pathname.startsWith(prefix),
  );
}

export function protectedPathRedirect(
  access: string | readonly string[] | ProtectedAccess,
  pathname: string,
): string | null {
  const { roles, permissions } = normalizeAccess(access);
  if (pathname.startsWith("/platform")) {
    const allowed = permissions.includes("platform.access") || hasAnyRole(roles, platformRoles);
    return allowed ? null : safeHomeForAccess(roles, permissions);
  }
  if (pathname.startsWith("/admin")) {
    const allowed = permissions.includes("admin.access") || hasAnyRole(roles, adminRoles);
    return allowed ? null : safeHomeForAccess(roles, permissions);
  }
  if (pathname.startsWith("/portal")) {
    const allowed = permissions.includes("homeowner.portal.access") || roles.includes("HOMEOWNER");
    return allowed ? null : safeHomeForAccess(roles, permissions);
  }
  if (pathname.startsWith("/employee")) {
    const allowed = permissions.includes("employee.portal.access") || roles.includes("EMPLOYEE");
    return allowed ? null : safeHomeForAccess(roles, permissions);
  }
  return null;
}

export function canAccessProtectedPath(
  access: string | readonly string[] | ProtectedAccess,
  pathname: string,
) {
  return protectedPathRedirect(access, pathname) === null;
}
