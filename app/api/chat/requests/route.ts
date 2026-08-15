import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getChatPrivacySnapshot, respondToMessageRequest } from "@/lib/services/chat-privacy";

export async function POST(request: Request) {
  const user = await requireUser(Role.HOMEOWNER);
  const body = await request.json().catch(() => ({}));
  const requestId = String(body.requestId || "");
  const action = String(body.action || "").toUpperCase();
  if (!requestId || (action !== "ACCEPT" && action !== "DECLINE")) {
    return NextResponse.json({ error: "Choose Accept or Decline for a valid message request." }, { status: 400 });
  }
  try {
    await respondToMessageRequest({ tenantId: user.tenantId, userId: user.id, requestId, action });
    await writeAuditLog({ actorId: user.id, module: "CHAT", action: action === "ACCEPT" ? "ACCEPT_MESSAGE_REQUEST" : "DECLINE_MESSAGE_REQUEST", entityType: "ChatMessageRequest", entityId: requestId });
    return NextResponse.json(await getChatPrivacySnapshot(user.tenantId, user.id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update message request." }, { status: 400 });
  }
}
