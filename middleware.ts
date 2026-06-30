import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose/jwt/verify";

const configuredSecret = process.env.AUTH_SECRET;
if (process.env.NODE_ENV === "production" && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error("AUTH_SECRET must contain at least 32 characters in production.");
}
const secret = new TextEncoder().encode(configuredSecret || "development-only-secret-change-me-now");

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("hoa_session")?.value;
  const loginUrl = new URL("/login", request.url);
  if (!token) return NextResponse.redirect(loginUrl);
  try {
    const { payload } = await jwtVerify(token, secret);
    const path = request.nextUrl.pathname;
    const role = String(payload.role || "");
    const isAdminRole = role === "ADMIN" || role === "SYSTEM_ADMIN";
    if (path.startsWith("/admin") && !isAdminRole) return NextResponse.redirect(new URL("/portal/dashboard", request.url));
    if (path.startsWith("/portal") && role !== "HOMEOWNER") return NextResponse.redirect(new URL(role === "SYSTEM_ADMIN" ? "/admin/settings" : "/admin/dashboard", request.url));
    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete("hoa_session");
    return response;
  }
}

export const config = { matcher: ["/admin/:path*", "/portal/:path*"] };
