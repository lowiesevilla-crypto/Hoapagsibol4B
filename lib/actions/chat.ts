"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { chatDeleteSchema, chatMessageSchema, chatStartSchema } from "@/lib/validation";

const chatPaths = ["/admin/chat", "/portal/chat", "/employee/chat"];

export async function touchPresence(context: string) {
  const user = await requireUser();
  await prisma.userPresence.upsert({
    where: { userId: user.id },
    update: { lastSeenAt: new Date(), context },
    create: { userId: user.id, context },
  });
  return user;
}

export async function startChatAction(formData: FormData) {
  const user = await requireUser();
  const parsed = chatStartSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid chat message.");
  if (parsed.data.recipientId === user.id) throw new Error("Choose another person to chat with.");

  const recipient = await prisma.user.findFirst({
    where: { id: parsed.data.recipientId, tenantId: user.tenantId },
    select: { id: true, role: true },
  });
  if (!recipient) throw new Error("Recipient not found.");

  const now = new Date();
  const conversation = await prisma.chatConversation.create({
    data: {
      tenantId: user.tenantId,
      subject: parsed.data.subject || null,
      homeownerId: user.role === Role.HOMEOWNER ? user.id : recipient.role === Role.HOMEOWNER ? recipient.id : null,
      assignedToId: user.role === Role.HOMEOWNER ? recipient.id : user.id,
      createdById: user.id,
      lastMessageAt: now,
      participants: {
        create: [
          { tenantId: user.tenantId, userId: user.id, lastReadAt: now },
          { tenantId: user.tenantId, userId: recipient.id },
        ],
      },
      messages: {
        create: {
          tenantId: user.tenantId,
          senderId: user.id,
          body: parsed.data.message,
          attachmentUrl: parsed.data.attachmentUrl || null,
          attachmentName: parsed.data.attachmentName || null,
          attachmentContentType: parsed.data.attachmentContentType || null,
        },
      },
    },
  });

  await writeAuditLog({ actorId: user.id, module: "CHAT", action: "START_CONVERSATION", entityType: "ChatConversation", entityId: conversation.id, metadata: { recipientId: recipient.id } });
  revalidateChat();
  redirect(`${chatHome(user.role)}?conversation=${conversation.id}&success=sent`);
}

export async function sendChatMessageAction(formData: FormData) {
  const user = await requireUser();
  const parsed = chatMessageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid chat message.");

  const participant = await prisma.chatParticipant.findFirst({
    where: { tenantId: user.tenantId, conversationId: parsed.data.conversationId, userId: user.id, conversation: { tenantId: user.tenantId } },
  });
  if (!participant) throw new Error("You do not have access to this conversation.");

  const now = new Date();
  await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        tenantId: user.tenantId,
        conversationId: parsed.data.conversationId,
        senderId: user.id,
        body: parsed.data.message || null,
        attachmentUrl: parsed.data.attachmentUrl || null,
        attachmentName: parsed.data.attachmentName || null,
        attachmentContentType: parsed.data.attachmentContentType || null,
      },
    }),
    prisma.chatConversation.update({ where: { id: parsed.data.conversationId }, data: { lastMessageAt: now } }),
    prisma.chatParticipant.update({ where: { conversationId_userId: { conversationId: parsed.data.conversationId, userId: user.id } }, data: { lastReadAt: now, deletedAt: null } }),
  ]);

  revalidateChat();
  redirect(`${chatHome(user.role)}?conversation=${parsed.data.conversationId}&success=sent`);
}

export async function markChatReadAction(formData: FormData) {
  const user = await requireUser();
  const conversationId = String(formData.get("conversationId") || "");
  if (!conversationId) throw new Error("Conversation is required.");
  const participant = await prisma.chatParticipant.findFirst({ where: { tenantId: user.tenantId, conversationId, userId: user.id, conversation: { tenantId: user.tenantId } } });
  if (!participant) throw new Error("You do not have access to this conversation.");
  await prisma.chatParticipant.update({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    data: { lastReadAt: new Date() },
  });
  revalidateChat();
  redirect(`${chatHome(user.role)}?conversation=${conversationId}`);
}

export async function deleteChatAction(formData: FormData) {
  const user = await requireUser();
  const parsed = chatDeleteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid delete request.");

  if (parsed.data.mode === "ME") {
    if (!parsed.data.conversationId) throw new Error("Conversation is required.");
    const participant = await prisma.chatParticipant.findFirst({ where: { tenantId: user.tenantId, conversationId: parsed.data.conversationId, userId: user.id, conversation: { tenantId: user.tenantId } } });
    if (!participant) throw new Error("You do not have access to this conversation.");
    await prisma.chatParticipant.update({
      where: { conversationId_userId: { conversationId: parsed.data.conversationId, userId: user.id } },
      data: { deletedAt: new Date() },
    });
    await writeAuditLog({ actorId: user.id, module: "CHAT", action: "DELETE_CONVERSATION_FOR_ME", entityType: "ChatConversation", entityId: parsed.data.conversationId });
    revalidateChat();
    redirect(`${chatHome(user.role)}?success=deleted`);
  }

  if (!parsed.data.messageId) throw new Error("Message is required.");
  const message = await prisma.chatMessage.findFirst({
    where: { id: parsed.data.messageId, tenantId: user.tenantId, senderId: user.id, conversation: { tenantId: user.tenantId, participants: { some: { tenantId: user.tenantId, userId: user.id } } } },
  });
  if (!message) throw new Error("Only the sender can delete this message for everyone.");
  await prisma.chatMessage.update({ where: { id: message.id }, data: { deletedForEveryoneAt: new Date() } });
  await writeAuditLog({ actorId: user.id, module: "CHAT", action: "DELETE_MESSAGE_FOR_EVERYONE", entityType: "ChatMessage", entityId: message.id, metadata: { conversationId: message.conversationId } });
  revalidateChat();
  redirect(`${chatHome(user.role)}?conversation=${message.conversationId}&success=deleted`);
}

function chatHome(role: Role) {
  if (role === Role.HOMEOWNER) return "/portal/chat";
  if (role === Role.EMPLOYEE) return "/employee/chat";
  return "/admin/chat";
}

function revalidateChat() {
  for (const path of chatPaths) revalidatePath(path);
}
