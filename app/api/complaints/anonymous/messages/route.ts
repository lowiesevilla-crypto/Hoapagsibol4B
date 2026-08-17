import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { assertSameOrigin, privateNoStoreHeaders } from "@/lib/anonymous-request-security";
import {
  ANONYMOUS_COMPLAINT_COOKIE,
  getAnonymousComplaintConversation,
  postAnonymousComplaintMessage,
} from "@/lib/services/complaint-anonymous-session";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: privateNoStoreHeaders });
}

async function sessionToken() {
  return (await cookies()).get(ANONYMOUS_COMPLAINT_COOKIE)?.value || "";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const after = url.searchParams.get("after");
    const conversation = await getAnonymousComplaintConversation(await sessionToken(), after);
    return NextResponse.json({ conversation }, { headers: privateNoStoreHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Anonymous complaint session is invalid or expired.";
    return errorResponse(message, message.includes("cursor") ? 400 : 401);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json().catch(() => ({}));
    const message = await postAnonymousComplaintMessage(await sessionToken(), {
      body: body.message,
      clientMessageId: body.clientMessageId,
    });
    return NextResponse.json({ message }, { status: 201, headers: privateNoStoreHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Message could not be sent.";
    const status = message.includes("origin") ? 403 : message.startsWith("Too many messages") ? 429 : message.includes("session") ? 401 : 400;
    return errorResponse(message, status);
  }
}
