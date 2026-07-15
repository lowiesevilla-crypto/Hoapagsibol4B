import "server-only";

import { Role, type Prisma, type User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getChatSettings } from "@/lib/system-settings";

const onlineWindowMs = 5 * 60 * 1000;

export type ChatScope = "admin" | "portal" | "employee";

export function scopeForRole(role: Role): ChatScope {
  if (role === Role.HOMEOWNER) return "portal";
  if (role === Role.EMPLOYEE) return "employee";
  return "admin";
}

export function chatHome(role: Role) {
  if (role === Role.HOMEOWNER) return "/portal/chat";
  if (role === Role.EMPLOYEE) return "/employee/chat";
  return "/admin/chat";
}

export async function touchUserPresence(userId: string, context: string) {
  await prisma.userPresence.upsert({
    where: { userId },
    update: { lastSeenAt: new Date(), context },
    create: { userId, context },
  });
}

export async function getChatPayload(user: Pick<User, "id" | "role" | "tenantId">, selectedConversationId?: string | null, search = "") {
  await touchUserPresence(user.id, "HOA Chat Center");
  const scope = scopeForRole(user.role);
  const [settings, recipients, conversations] = await Promise.all([
    getChatSettings(user.tenantId),
    getRecipients(scope, user.id, search),
    prisma.chatConversation.findMany({
      where: { participants: { some: { userId: user.id, deletedAt: null } } },
      include: conversationInclude,
      orderBy: [{ participants: { _count: "desc" } }, { lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: 60,
    }),
  ]);

  const visibleConversations = conversations.sort((a, b) => {
    const aPin = a.participants.find((item) => item.userId === user.id)?.pinnedAt?.valueOf() ?? 0;
    const bPin = b.participants.find((item) => item.userId === user.id)?.pinnedAt?.valueOf() ?? 0;
    if (aPin !== bPin) return bPin - aPin;
    return (b.lastMessageAt?.valueOf() ?? b.createdAt.valueOf()) - (a.lastMessageAt?.valueOf() ?? a.createdAt.valueOf());
  });
  const selectedId = selectedConversationId || null;
  const selectedConversation = selectedId
    ? await prisma.chatConversation.findFirst({
        where: { id: selectedId, participants: { some: { userId: user.id, deletedAt: null } } },
        include: {
          participants: conversationInclude.participants,
          messages: {
            include: {
              sender: { select: chatUserSelect },
              attachments: true,
              replyTo: { include: { sender: { select: chatUserSelect } } },
            },
            orderBy: { createdAt: "desc" },
            take: 120,
          },
        },
      })
    : null;

  if (selectedConversation) {
    const readAt = new Date();
    await prisma.chatParticipant.update({
      where: { conversationId_userId: { conversationId: selectedConversation.id, userId: user.id } },
      data: { lastReadAt: readAt },
    });
    const listParticipant = visibleConversations.find((conversation) => conversation.id === selectedConversation.id)?.participants.find((participant) => participant.userId === user.id);
    if (listParticipant) listParticipant.lastReadAt = readAt;
  }

  const unreadCounts = new Map(await Promise.all(visibleConversations.map(async (conversation) => {
    const me = conversation.participants.find((participant) => participant.userId === user.id);
    const count = selectedConversation?.id === conversation.id ? 0 : await countUnreadMessages(conversation.id, user.id, me?.lastReadAt);
    return [conversation.id, count] as const;
  })));

  return {
    currentUserId: user.id,
    scope,
    settings,
    recipients: recipients.map(serializeUser),
    conversations: visibleConversations.map((conversation) => serializeConversation(conversation, user.id, false, unreadCounts.get(conversation.id) ?? 0)),
    selectedConversation: selectedConversation ? serializeConversation(selectedConversation, user.id, true, 0) : null,
  };
}

export async function getUnreadChatCount(userId: string) {
  const participants = await prisma.chatParticipant.findMany({
    where: { userId, deletedAt: null },
    select: { conversationId: true, lastReadAt: true },
  });
  const counts = await Promise.all(participants.map((participant) => countUnreadMessages(participant.conversationId, userId, participant.lastReadAt)));
  return counts.reduce((sum, count) => sum + count, 0);
}

export async function getRecipients(scope: ChatScope, currentUserId: string, search = "") {
  const roleFilter =
    scope === "portal"
      ? [Role.ADMIN, Role.SYSTEM_ADMIN, Role.EMPLOYEE]
      : scope === "employee"
        ? [Role.ADMIN, Role.SYSTEM_ADMIN, Role.HOMEOWNER]
        : [Role.ADMIN, Role.SYSTEM_ADMIN, Role.HOMEOWNER, Role.EMPLOYEE];
  const normalized = search.trim();
  return prisma.user.findMany({
    where: {
      id: { not: currentUserId },
      role: { in: roleFilter },
      ...(normalized
        ? {
            OR: [
              { name: { contains: normalized } },
              { email: { contains: normalized } },
              { homeownerProfile: { is: { block: { contains: normalized } } } },
              { homeownerProfile: { is: { lot: { contains: normalized } } } },
              { homeownerProfile: { is: { address: { contains: normalized } } } },
              { employeeProfile: { is: { employeeNumber: { contains: normalized } } } },
              { employeeProfile: { is: { position: { contains: normalized } } } },
            ],
          }
        : {}),
    },
    select: chatUserSelect,
    orderBy: [{ role: "asc" }, { name: "asc" }],
    take: 150,
  });
}

export async function findOrCreateDirectConversation(currentUser: Pick<User, "id" | "role">, recipientId: string) {
  if (currentUser.id === recipientId) throw new Error("Choose another person to chat with.");
  const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { id: true, role: true, name: true } });
  if (!recipient) throw new Error("Recipient not found.");

  const existing = await prisma.chatConversation.findFirst({
    where: {
      participants: { every: { userId: { in: [currentUser.id, recipient.id] } }, some: { userId: currentUser.id }, },
      AND: [{ participants: { some: { userId: recipient.id } } }],
    },
    include: { participants: true },
    orderBy: { updatedAt: "desc" },
  });
  if (existing && existing.participants.length === 2) {
    await prisma.chatParticipant.update({ where: { conversationId_userId: { conversationId: existing.id, userId: currentUser.id } }, data: { deletedAt: null } });
    return existing.id;
  }

  const now = new Date();
  const conversation = await prisma.chatConversation.create({
    data: {
      subject: null,
      homeownerId: currentUser.role === Role.HOMEOWNER ? currentUser.id : recipient.role === Role.HOMEOWNER ? recipient.id : null,
      assignedToId: currentUser.role === Role.HOMEOWNER ? recipient.id : currentUser.id,
      createdById: currentUser.id,
      lastMessageAt: now,
      participants: { create: [{ userId: currentUser.id, lastReadAt: now }, { userId: recipient.id }] },
    },
  });
  return conversation.id;
}

export async function createChatMessage({
  conversationId,
  senderId,
  body,
  attachments,
  replyToId,
}: {
  conversationId: string;
  senderId: string;
  body?: string | null;
  attachments?: { url: string; fileName: string; contentType: string; size: number }[];
  replyToId?: string | null;
}) {
  const participant = await prisma.chatParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId: senderId } } });
  if (!participant) throw new Error("You do not have access to this conversation.");
  const cleanBody = body?.trim() || null;
  const cleanAttachments = attachments?.filter((item) => item.url && item.fileName && item.contentType) ?? [];
  if (!cleanBody && cleanAttachments.length === 0) throw new Error("Enter a message or upload an attachment.");
  if (replyToId) {
    const replyTarget = await prisma.chatMessage.findFirst({ where: { id: replyToId, conversationId } });
    if (!replyTarget) throw new Error("Reply target was not found.");
  }
  const now = new Date();
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.chatMessage.create({
      data: {
        conversationId,
        senderId,
        body: cleanBody,
        replyToId: replyToId || null,
        attachmentUrl: cleanAttachments[0]?.url ?? null,
        attachmentName: cleanAttachments[0]?.fileName ?? null,
        attachmentContentType: cleanAttachments[0]?.contentType ?? null,
        attachments: { create: cleanAttachments },
      },
      include: { sender: { select: chatUserSelect }, attachments: true, replyTo: { include: { sender: { select: chatUserSelect } } } },
    });
    await tx.chatConversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } });
    await tx.chatParticipant.update({ where: { conversationId_userId: { conversationId, userId: senderId } }, data: { lastReadAt: now, deletedAt: null } });
    return created;
  });
  return message;
}

type ConversationWithInclude = Prisma.ChatConversationGetPayload<{ include: typeof conversationInclude }>;
type MessageWithInclude = Prisma.ChatMessageGetPayload<{
  include: {
    sender: { select: typeof chatUserSelect };
    attachments: true;
    replyTo: { include: { sender: { select: typeof chatUserSelect } } };
  };
}>;
type UserWithSelect = Prisma.UserGetPayload<{ select: typeof chatUserSelect }>;

const chatUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  presence: true,
  homeownerProfile: { select: { address: true, block: true, lot: true } },
  employeeProfile: { select: { employeeNumber: true, position: true } },
} satisfies Prisma.UserSelect;

const conversationInclude = {
  participants: {
    include: { user: { select: chatUserSelect } },
    orderBy: { createdAt: "asc" as const },
  },
  messages: {
    include: { sender: { select: chatUserSelect }, attachments: true, replyTo: { include: { sender: { select: chatUserSelect } } } },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
} satisfies Prisma.ChatConversationInclude;

function serializeConversation(conversation: ConversationWithInclude, currentUserId: string, full = false, exactUnreadCount?: number) {
  const me = conversation.participants.find((item) => item.userId === currentUserId);
  const messages = full ? [...conversation.messages].reverse() : conversation.messages;
  return {
    id: conversation.id,
    subject: conversation.subject,
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    createdAt: conversation.createdAt.toISOString(),
    pinned: Boolean(me?.pinnedAt),
    participants: conversation.participants.map((item) => ({ userId: item.userId, lastReadAt: item.lastReadAt?.toISOString() ?? null, deletedAt: item.deletedAt?.toISOString() ?? null, pinnedAt: item.pinnedAt?.toISOString() ?? null, user: serializeUser(item.user) })),
    messages: messages.map((message) => serializeMessage(message)),
    unreadCount: exactUnreadCount ?? unreadCount(conversation.messages, me?.lastReadAt, currentUserId),
  };
}

function serializeMessage(message: MessageWithInclude) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    body: message.body,
    attachmentUrl: message.attachmentUrl,
    attachmentName: message.attachmentName,
    attachmentContentType: message.attachmentContentType,
    deletedForEveryoneAt: message.deletedForEveryoneAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
    sender: serializeUser(message.sender),
    attachments: message.attachments.map((item) => ({ id: item.id, url: item.url, fileName: item.fileName, contentType: item.contentType, size: item.size })),
    replyTo: message.replyTo ? { id: message.replyTo.id, body: message.replyTo.body, senderName: message.replyTo.sender.name } : null,
  };
}

function serializeUser(user: UserWithSelect) {
  const lastSeenAt = user.presence?.lastSeenAt ?? null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    initials: user.name.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "U",
    presence: lastSeenAt ? { lastSeenAt: lastSeenAt.toISOString(), context: user.presence?.context ?? null, online: Date.now() - lastSeenAt.valueOf() < onlineWindowMs } : null,
    homeownerProfile: user.homeownerProfile,
    employeeProfile: user.employeeProfile,
    searchText: [user.name, user.email, user.role, user.homeownerProfile?.address, user.homeownerProfile?.block, user.homeownerProfile?.lot, user.employeeProfile?.employeeNumber, user.employeeProfile?.position].filter(Boolean).join(" ").toLowerCase(),
  };
}

function unreadCount(messages: ConversationWithInclude["messages"], lastReadAt: Date | null | undefined, currentUserId: string) {
  const lastRead = lastReadAt?.valueOf() ?? 0;
  return messages.filter((message) => message.senderId !== currentUserId && !message.deletedForEveryoneAt && message.createdAt.valueOf() > lastRead).length;
}

function countUnreadMessages(conversationId: string, userId: string, lastReadAt: Date | null | undefined) {
  return prisma.chatMessage.count({
    where: {
      conversationId,
      senderId: { not: userId },
      deletedForEveryoneAt: null,
      createdAt: { gt: lastReadAt ?? new Date(0) },
    },
  });
}
