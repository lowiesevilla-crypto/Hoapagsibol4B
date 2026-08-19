import { NextResponse } from "next/server";
import { assertSameOrigin, privateNoStoreHeaders } from "@/lib/anonymous-request-security";
import { performLogout, type LogoutScope } from "@/lib/auth-logout";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
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
