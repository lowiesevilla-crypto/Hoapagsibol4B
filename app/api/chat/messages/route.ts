import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { createChatMessage, getChatPayload } from "@/lib/services/chat";
import { sanitizeHomeownerChatPayload } from "@/lib/services/homeowner-chat-view";

type UploadedAttachmentInput = { url?: unknown; fileName?: unknown; contentType?: unknown; size?: unknown };

function homeownerView<T>(role: Role, payload: T) {
  return role === Role.HOMEOWNER ? sanitizeHomeownerChatPayload(payload) : payload;
}

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));
  const conversationId = String(body.conversationId || "");
  if (!conversationId) return NextResponse.json({ error: "Conversation is required." }, { status: 400 });
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  try {
    const message = await createChatMessage({
      conversationId,
      senderId: user.id,
      tenantId: user.tenantId,
      body: typeof body.message === "string" ? body.message : "",
      replyToId: typeof body.replyToId === "string" ? body.replyToId : null,
      attachments: attachments.map((item: UploadedAttachmentInput) => ({
        url: String(item.url || ""),
        fileName: String(item.fileName || ""),
        contentType: String(item.contentType || ""),
        size: Number(item.size || 0),
      })),
    });
    await writeAuditLog({ actorId: user.id, module: "CHAT", action: "SEND_MESSAGE", entityType: "ChatMessage", entityId: message.id, metadata: { conversationId, attachments: attachments.length } });
    return NextResponse.json(homeownerView(user.role, await getChatPayload(user, conversationId)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to send message." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));
  const conversationId = String(body.conversationId || "");
  if (!conversationId) return NextResponse.json({ error: "Conversation is required." }, { status: 400 });
  const participant = await prisma.chatParticipant.findFirst({ where: { tenantId: user.tenantId, conversationId, userId: user.id, conversation: { tenantId: user.tenantId } } });
  if (!participant) return NextResponse.json({ error: "You do not have access to this conversation." }, { status: 403 });
  await prisma.chatParticipant.update({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    data: { lastReadAt: new Date() },
  });
  return NextResponse.json(homeownerView(user.role, await getChatPayload(user, conversationId)));
}

export async function DELETE(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const messageId = url.searchParams.get("messageId") || "";
  if (!messageId) return NextResponse.json({ error: "Message is required." }, { status: 400 });
  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, tenantId: user.tenantId, senderId: user.id, conversation: { tenantId: user.tenantId, participants: { some: { tenantId: user.tenantId, userId: user.id } } } },
  });
  if (!message) return NextResponse.json({ error: "Only the sender can delete this message for everyone." }, { status: 403 });
  await prisma.chatMessage.update({ where: { id: message.id }, data: { deletedForEveryoneAt: new Date() } });
  await writeAuditLog({ actorId: user.id, module: "CHAT", action: "DELETE_MESSAGE_FOR_EVERYONE", entityType: "ChatMessage", entityId: message.id, metadata: { conversationId: message.conversationId } });
  return NextResponse.json(homeownerView(user.role, await getChatPayload(user, message.conversationId)));
}
