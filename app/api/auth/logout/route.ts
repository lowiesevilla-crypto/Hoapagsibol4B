import { NextResponse } from "next/server";
import { assertSameOrigin, privateNoStoreHeaders } from "@/lib/anonymous-request-security";
import { allowedOrigins } from "@/lib/app-url";
import { performLogout, type LogoutScope } from "@/lib/auth-logout";

export const dynamic = "force-dynamic";

const TRANSITION_REQUEST_HEADER = "x-hoahub-logout-transition";
const TRANSITION_DESTINATION_HEADER = "X-HOAHub-Logout-Destination";

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

async function executeLogout(request: Request, scope: LogoutScope) {
  if (!isTrustedLogoutMutation(request)) {
    return { response: new NextResponse("Forbidden", { status: 403, headers: privateNoStoreHeaders }) } as const;
  }

  const result = await performLogout(scope);
  const destination = new URL(result.redirectTo, request.url);
  if (scope === "all" && !result.allSessionsRevoked) destination.searchParams.set("allSessions", "partial");
  return { destination } as const;
}

function applyPrivateNoStore(response: NextResponse) {
  for (const [key, value] of Object.entries(privateNoStoreHeaders)) response.headers.set(key, value);
  return response;
}

export async function POST(request: Request) {
  let scope: LogoutScope = "current";
  try {
    const formData = await request.formData();
    scope = formData.get("scope") === "all" ? "all" : "current";
  } catch {
    // A malformed body still performs a safe current-session logout.
  }

  const result = await executeLogout(request, scope);
  if ("response" in result) return result.response;
  return applyPrivateNoStore(NextResponse.redirect(result.destination, 303));
}

export async function PUT(request: Request) {
  if (request.headers.get(TRANSITION_REQUEST_HEADER) !== "1") {
    return new NextResponse("Forbidden", { status: 403, headers: privateNoStoreHeaders });
  }

  const scope: LogoutScope = new URL(request.url).searchParams.get("scope") === "all" ? "all" : "current";
  const result = await executeLogout(request, scope);
  if ("response" in result) return result.response;

  // The isolated transition needs only a bounded server-resolved destination. Returning
  // it on a no-content response avoids a fetch redirect chain while keeping revocation,
  // tenant/session authority, and destination selection on the server.
  const destination = `${result.destination.pathname}${result.destination.search}${result.destination.hash}`;
  return applyPrivateNoStore(new NextResponse(null, {
    status: 204,
    headers: { [TRANSITION_DESTINATION_HEADER]: destination },
  }));
}
