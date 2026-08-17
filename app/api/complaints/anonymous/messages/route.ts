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

function expectedOriginError(message: string) {
  return message === "Request origin is not allowed." || message === "Request origin is required.";
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
    const message = error instanceof Error ? error.message : "";
    if (message === "Message cursor is invalid.") return errorResponse(message, 400);
    if (message === "Anonymous complaint session is invalid or expired.") return errorResponse(message, 401);
    if (message === "Anonymous complaint conversation is currently unavailable.") return errorResponse(message, 503);
    return errorResponse("Anonymous complaint conversation could not be loaded.", 500);
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
    const message = error instanceof Error ? error.message : "";
    if (expectedOriginError(message)) return errorResponse(message, 403);
    if (message === "Anonymous complaint session is invalid or expired.") return errorResponse(message, 401);
    if (message === "Anonymous complaint conversation is currently unavailable.") return errorResponse(message, 503);
    if (message === "Too many messages. Please wait before sending another message.") return errorResponse(message, 429);
    if (
      message === "Enter a message." ||
      message === "Message request identifier is invalid." ||
      message.startsWith("Message must be ") ||
      message === "This message request identifier was already used for different content."
    ) return errorResponse(message, 400);
    if (message === "Message could not be saved safely. Please retry.") return errorResponse(message, 503);
    return errorResponse("Message could not be sent.", 500);
  }
}