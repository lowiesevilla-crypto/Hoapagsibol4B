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

function isTrustedLogoutPost(request: Request) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin || referer) {
    try {
      assertSameOrigin(request);
      return true;
    } catch {
      // Reverse proxies can present the route handler with a canonical request URL
      // while the browser legitimately posts from another explicitly configured app
      // origin. Keep the stronger exact-origin check first, then accept only a source
      // that is present in the server's allow-list. Never trust an arbitrary Host.
      if (trustedConfiguredSource(origin) || trustedConfiguredSource(referer)) return true;
    }
  }

  // Native document form submissions can legitimately arrive without usable Origin
  // or Referer headers under restrictive browser/privacy policies. In that case rely
  // on browser-controlled Fetch Metadata proving a same-origin top-level navigation.
  return (
    request.headers.get("sec-fetch-site") === "same-origin" &&
    request.headers.get("sec-fetch-mode") === "navigate" &&
    request.headers.get("sec-fetch-dest") === "document"
  );
}

export async function POST(request: Request) {
  if (!isTrustedLogoutPost(request)) {
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

  // Logout is intentionally a normal same-origin document POST. Session revocation
  // and cookie clearing finish before the 303 is emitted, which avoids React Server
  // Action state races and gives every shell the same deterministic navigation path.
  // BrowserCacheRecovery handles a later Back/BFCache traversal by forcing protected
  // history entries through authoritative server-side session validation.
  const response = NextResponse.redirect(destination, 303);
  for (const [key, value] of Object.entries(privateNoStoreHeaders)) response.headers.set(key, value);
  return response;
}
