import { NextResponse } from "next/server";
import { assertSameOrigin, privateNoStoreHeaders } from "@/lib/anonymous-request-security";
import { allowedOrigins } from "@/lib/app-url";
import { performLogout, type LogoutScope } from "@/lib/auth-logout";

export const dynamic = "force-dynamic";

function trustedConfiguredSource(value: string | null) {
  if (!value || value === "null") return false;
  try {
    return allowedOrigins().has(new URL(value).origin);
  } catch {
    return false;
  }
}

function isTrustedLogoutMutation(request: Request) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin || referer) {
    try {
      assertSameOrigin(request);
      return true;
    } catch {
      if (trustedConfiguredSource(origin) || trustedConfiguredSource(referer)) return true;
    }
  }

  return (
    request.method === "POST" &&
    request.headers.get("sec-fetch-site") === "same-origin" &&
    request.headers.get("sec-fetch-mode") === "navigate" &&
    request.headers.get("sec-fetch-dest") === "document"
  );
}

async function handleLogout(request: Request) {
  if (!isTrustedLogoutMutation(request)) {
    return new NextResponse("Forbidden", { status: 403, headers: privateNoStoreHeaders });
  }

  let scope: LogoutScope = "current";
  try {
    const formData = await request.formData();
    scope = formData.get("scope") === "all" ? "all" : "current";
  } catch {
    // A malformed body still performs a safe current-session logout.
  }

  const result = await performLogout(scope);
  const destination = new URL(result.redirectTo, request.url);
  if (scope === "all" && !result.allSessionsRevoked) destination.searchParams.set("allSessions", "partial");

  const response = NextResponse.redirect(destination, 303);
  for (const [key, value] of Object.entries(privateNoStoreHeaders)) response.headers.set(key, value);
  return response;
}

// Keep POST for direct same-origin document clients. The isolated transition uses
// DELETE so stale Next-Action POST metadata cannot divert logout into Server Action
// dispatch before this Route Handler runs. Both methods share identical revocation,
// origin validation, no-store response, and authoritative HTTP 303 behavior.
export const POST = handleLogout;
export const DELETE = handleLogout;
