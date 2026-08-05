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

export function isProtectedApplicationPath(pathname: string) {
  return ["/admin", "/portal", "/employee", "/platform"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function protectedPathRedirect(role: string, pathname: string): string | null {
  if (pathname === "/platform" || pathname.startsWith("/platform/")) {
    return platformRoles.has(role) ? null : "/admin/dashboard";
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (adminRoles.has(role)) return null;
    return role === "PLATFORM_ADMIN" ? "/platform/tenants" : "/portal/dashboard";
  }
  if (pathname === "/portal" || pathname.startsWith("/portal/")) {
    if (role === "HOMEOWNER") return null;
    if (role === "SYSTEM_ADMIN") return "/admin/settings";
    if (role === "EMPLOYEE") return "/employee/attendance";
    return "/admin/dashboard";
  }
  if (pathname === "/employee" || pathname.startsWith("/employee/")) {
    if (role === "EMPLOYEE") return null;
    return adminRoles.has(role) ? "/admin/dashboard" : "/portal/dashboard";
  }
  return null;
}

export function canAccessProtectedPath(role: string, pathname: string) {
  return protectedPathRedirect(role, pathname) === null;
}
