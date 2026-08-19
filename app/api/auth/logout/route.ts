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

  // Interactive logout must finish revocation/cookie clearing before the browser
  // performs a new document request. Returning JSON avoids fetch following the 303
  // while the auth cookie is being changed. The client validates this same-origin
  // login destination and then performs location.replace().
  if (request.headers.get("X-HOA-Logout-Navigation") === "fetch") {
    const response = NextResponse.json(
      { redirectTo: `${destination.pathname}${destination.search}${destination.hash}` },
      { status: 200 },
    );
    for (const [key, value] of Object.entries(privateNoStoreHeaders)) response.headers.set(key, value);
    return response;
  }

  // Progressive enhancement / no-JavaScript fallback: normal form POST receives a
  // 303 after the server has revoked the session and cleared authentication cookies.
  const response = NextResponse.redirect(destination, 303);
  for (const [key, value] of Object.entries(privateNoStoreHeaders)) response.headers.set(key, value);
  return response;
}
