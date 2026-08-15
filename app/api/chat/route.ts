import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getChatPayload } from "@/lib/services/chat";
import { sanitizeHomeownerChatPayload } from "@/lib/services/homeowner-chat-view";

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversation");
  const search = url.searchParams.get("search") || "";
  const payload = await getChatPayload(user, conversationId, search);
  return NextResponse.json(user.role === Role.HOMEOWNER ? sanitizeHomeownerChatPayload(payload) : payload);
}
