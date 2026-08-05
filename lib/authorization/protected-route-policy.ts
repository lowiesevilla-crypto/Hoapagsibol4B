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

function normalizeRoles(roleOrRoles: string | readonly string[]) {
  return Array.isArray(roleOrRoles) ? [...new Set(roleOrRoles)] : [roleOrRoles];
}

function hasAnyRole(roles: readonly string[], accepted: ReadonlySet<string>) {
  return roles.some((role) => accepted.has(role));
}

function safeHomeForRoles(roles: readonly string[]) {
  if (hasAnyRole(roles, platformRoles)) return "/platform/tenants";
  if (hasAnyRole(roles, adminRoles)) return "/admin/dashboard";
  if (roles.includes("HOMEOWNER")) return "/portal/dashboard";
  if (roles.includes("EMPLOYEE")) return "/employee/attendance";
  return "/login";
}

export function isProtectedApplicationPath(pathname: string) {
  return ["/admin", "/portal", "/employee", "/platform"].some((prefix) =>
    pathname.startsWith(prefix),
  );
}

export function protectedPathRedirect(roleOrRoles: string | readonly string[], pathname: string): string | null {
  const roles = normalizeRoles(roleOrRoles);
  if (pathname.startsWith("/platform")) {
    return hasAnyRole(roles, platformRoles) ? null : safeHomeForRoles(roles);
  }
  if (pathname.startsWith("/admin")) {
    return hasAnyRole(roles, adminRoles) ? null : safeHomeForRoles(roles);
  }
  if (pathname.startsWith("/portal")) {
    return roles.includes("HOMEOWNER") ? null : safeHomeForRoles(roles);
  }
  if (pathname.startsWith("/employee")) {
    return roles.includes("EMPLOYEE") ? null : safeHomeForRoles(roles);
  }
  return null;
}

export function canAccessProtectedPath(roleOrRoles: string | readonly string[], pathname: string) {
  return protectedPathRedirect(roleOrRoles, pathname) === null;
}
