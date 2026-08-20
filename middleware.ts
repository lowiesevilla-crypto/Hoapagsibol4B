import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose/jwt/verify";
import { allowedOrigins, getAppUrl } from "@/lib/app-url";
import { safeReturnTo } from "@/lib/auth-return-to";
import {
  isProtectedApplicationPath,
  protectedPathRedirect,
} from "@/lib/authorization/protected-route-policy";

const configuredSecret = process.env.AUTH_SECRET;
if (process.env.NODE_ENV === "production" && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error("AUTH_SECRET must contain at least 32 characters in production.");
}
const secret = new TextEncoder().encode(configuredSecret || "development-only-secret-change-me-now");

const LOGOUT_NEXT_INTERNAL_HEADERS = [
  "next-action",
  "rsc",
  "next-router-state-tree",
  "next-router-prefetch",
  "next-url",
] as const;

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

function loginWithReturnTo(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  const returnTo = safeReturnTo(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (returnTo) loginUrl.searchParams.set("returnTo", returnTo);
  return loginUrl;
}

function logoutRouteHandlerRequest(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  for (const header of LOGOUT_NEXT_INTERNAL_HEADERS) requestHeaders.delete(header);
  return cors(NextResponse.next({ request: { headers: requestHeaders } }), request);
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const appUrl = new URL(getAppUrl());
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
  const localHost = forwardedHost === "localhost:3000" || forwardedHost === "127.0.0.1:3000" || forwardedHost === "[::1]:3000";
  const allowLocalOrigin = process.env.ALLOW_LOCAL_ORIGINS === "true" && localHost;
  if (process.env.NODE_ENV === "production" && appUrl.protocol === "https:" && !allowLocalOrigin && (forwardedProto !== "https" || forwardedHost !== appUrl.host)) {
    return NextResponse.redirect(new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, appUrl));
  }

  const origin = request.headers.get("origin");
  const mutation = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  const webhook = path === "/api/payments/webhook/gcash"
    || path === "/api/platform/billing/webhooks/paymongo"
    || path === "/api/homeowner-payments/webhooks/paymongo";
  if (mutation && origin && !webhook && !allowedOrigins().has(origin)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  if (request.method === "OPTIONS" && path.startsWith("/api/")) {
    if (!origin || !allowedOrigins().has(origin)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
    const response = new NextResponse(null, { status: 204 });
    response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-HOA-Payment-Webhook-Secret, Paymongo-Signature");
    return cors(response, request);
  }

  // The logout mutation is an ordinary Route Handler POST. A stale Next.js client can
  // carry App Router / Server Action transport headers into a later document form
  // navigation. Strip only those framework-internal hints, only for this endpoint,
  // before Next performs action dispatch. Origin enforcement above and the route's
  // own same-origin / Fetch-Metadata validation remain authoritative.
  if (path === "/api/auth/logout" && request.method === "POST") {
    return logoutRouteHandlerRequest(request);
  }

  if (!isProtectedApplicationPath(path)) return cors(NextResponse.next(), request);

  const token = request.cookies.get("hoa_session")?.value;
  const loginUrl = loginWithReturnTo(request);
  if (!token) return NextResponse.redirect(loginUrl);
  try {
    const { payload } = await jwtVerify(token, secret);
    const primaryRole = String(payload.role || "");
    const roles = Array.isArray(payload.roles)
      ? payload.roles.filter((role): role is string => typeof role === "string")
      : [primaryRole];
    const redirectPath = protectedPathRedirect(roles.length ? roles : primaryRole, path);
    if (redirectPath) return NextResponse.redirect(new URL(redirectPath, request.url));
    if (path === "/portal/pay" && request.nextUrl.searchParams.get("online") === "confirming") {
      return NextResponse.redirect(new URL("/portal/pay/paymongo-confirm", request.url));
    }
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-hoa-pathname", path);
    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete("hoa_session");
    return response;
  }
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
