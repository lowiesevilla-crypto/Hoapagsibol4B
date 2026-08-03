import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { findOrCreateDirectConversation, getChatPayload } from "@/lib/services/chat";

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));
  const recipientId = String(body.recipientId || "");
  if (!recipientId) return NextResponse.json({ error: "Recipient is required." }, { status: 400 });
  const conversationId = await findOrCreateDirectConversation(user, recipientId);
  await writeAuditLog({ actorId: user.id, module: "CHAT", action: "OPEN_OR_CREATE_CONVERSATION", entityType: "ChatConversation", entityId: conversationId, metadata: { recipientId } });
  const payload = await getChatPayload(user, conversationId);
  return NextResponse.json({ conversationId, payload });
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));
  const conversationId = String(body.conversationId || "");
  const pinned = Boolean(body.pinned);
  if (!conversationId) return NextResponse.json({ error: "Conversation is required." }, { status: 400 });
  const participant = await prisma.chatParticipant.findFirst({ where: { tenantId: user.tenantId, conversationId, userId: user.id, conversation: { tenantId: user.tenantId } } });
  if (!participant) return NextResponse.json({ error: "You do not have access to this conversation." }, { status: 403 });
  await prisma.chatParticipant.update({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    data: { pinnedAt: pinned ? new Date() : null },
  });
  return NextResponse.json(await getChatPayload(user, conversationId));
}

export async function DELETE(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId") || "";
  if (!conversationId) return NextResponse.json({ error: "Conversation is required." }, { status: 400 });
  const participant = await prisma.chatParticipant.findFirst({ where: { tenantId: user.tenantId, conversationId, userId: user.id, conversation: { tenantId: user.tenantId } } });
  if (!participant) return NextResponse.json({ error: "You do not have access to this conversation." }, { status: 403 });
  await prisma.chatParticipant.update({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({ actorId: user.id, module: "CHAT", action: "DELETE_CONVERSATION_FOR_ME", entityType: "ChatConversation", entityId: conversationId });
  return NextResponse.json(await getChatPayload(user));
}
