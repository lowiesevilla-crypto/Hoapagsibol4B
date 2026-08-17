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
    const message = error instanceof Error ? error.message : "Anonymous complaint session could not be created.";
    const status = message.startsWith("Too many attempts") ? 429 : message.includes("origin") ? 403 : 401;
    return errorResponse(message, status);
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
    const message = error instanceof Error ? error.message : "Anonymous complaint session could not be revoked.";
    return errorResponse(message, message.includes("origin") ? 403 : 400);
  }
}
