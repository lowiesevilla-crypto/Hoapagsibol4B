import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { assertSameOrigin, privateNoStoreHeaders } from "@/lib/anonymous-request-security";
import {
  ANONYMOUS_COMPLAINT_COOKIE,
  createAnonymousComplaintSession,
  revokeAnonymousComplaintSession,
} from "@/lib/services/complaint-anonymous-session";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: privateNoStoreHeaders });
}

function expectedOriginError(message: string) {
  return message === "Request origin is not allowed." || message === "Request origin is required.";
}

function createSessionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "Tracking code or PIN was not found.") return { message, status: 401 };
  if (message === "Anonymous complaint conversation is currently unavailable.") return { message, status: 503 };
  if (message === "Too many attempts. Please try again later.") return { message, status: 429 };
  if (expectedOriginError(message)) return { message, status: 403 };
  return { message: "Anonymous complaint session could not be created.", status: 500 };
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json().catch(() => ({}));
    const result = await createAnonymousComplaintSession(
      String(body.trackingCode || ""),
      String(body.pin || ""),
    );
    const response = NextResponse.json(
      { conversation: result.conversation, expiresAt: result.expiresAt.toISOString() },
      { headers: privateNoStoreHeaders },
    );
    response.cookies.set(ANONYMOUS_COMPLAINT_COOKIE, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: result.expiresAt,
    });
    return response;
  } catch (error) {
    const safe = createSessionError(error);
    return errorResponse(safe.message, safe.status);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const cookieStore = await cookies();
    const token = cookieStore.get(ANONYMOUS_COMPLAINT_COOKIE)?.value || "";
    await revokeAnonymousComplaintSession(token);
    const response = NextResponse.json({ revoked: true }, { headers: privateNoStoreHeaders });
    response.cookies.set(ANONYMOUS_COMPLAINT_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
      maxAge: 0,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (expectedOriginError(message)) return errorResponse(message, 403);
    return errorResponse("Anonymous complaint session could not be revoked.", 500);
  }
}