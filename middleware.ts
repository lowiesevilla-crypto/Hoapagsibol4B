import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose/jwt/verify";
import { allowedOrigins, getAppUrl } from "@/lib/app-url";

const configuredSecret = process.env.AUTH_SECRET;
if (process.env.NODE_ENV === "production" && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error("AUTH_SECRET must contain at least 32 characters in production.");
}
const secret = new TextEncoder().encode(configuredSecret || "development-only-secret-change-me-now");

function cors(response: NextResponse, request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) return response;
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins().has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const appUrl = new URL(getAppUrl());
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
  if (process.env.NODE_ENV === "production" && appUrl.protocol === "https:" && (forwardedProto !== "https" || forwardedHost !== appUrl.host)) {
    return NextResponse.redirect(new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, appUrl));
  }

  const origin = request.headers.get("origin");
  const mutation = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  const webhook = path === "/api/payments/webhook/gcash";
  if (mutation && origin && !webhook && !allowedOrigins().has(origin)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  if (request.method === "OPTIONS" && path.startsWith("/api/")) {
    if (!origin || !allowedOrigins().has(origin)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
    const response = new NextResponse(null, { status: 204 });
    response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-HOA-Payment-Webhook-Secret");
    return cors(response, request);
  }

  const protectedPath = path.startsWith("/admin") || path.startsWith("/portal") || path.startsWith("/employee");
  if (!protectedPath) return cors(NextResponse.next(), request);

  const token = request.cookies.get("hoa_session")?.value;
  const loginUrl = new URL("/login", request.url);
  if (!token) return NextResponse.redirect(loginUrl);
  try {
    const { payload } = await jwtVerify(token, secret);
    const role = String(payload.role || "");
    const isAdminRole = role === "ADMIN" || role === "SYSTEM_ADMIN";
    if (path.startsWith("/admin") && !isAdminRole) return NextResponse.redirect(new URL("/portal/dashboard", request.url));
    if (path.startsWith("/portal") && role !== "HOMEOWNER") return NextResponse.redirect(new URL(role === "SYSTEM_ADMIN" ? "/admin/settings" : role === "EMPLOYEE" ? "/employee/attendance" : "/admin/dashboard", request.url));
    if (path.startsWith("/employee") && role !== "EMPLOYEE") return NextResponse.redirect(new URL(isAdminRole ? "/admin/dashboard" : "/portal/dashboard", request.url));
    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete("hoa_session");
    return response;
  }
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
