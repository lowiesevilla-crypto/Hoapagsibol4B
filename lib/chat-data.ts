import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

const chatUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  presence: true,
  homeownerProfile: { select: { address: true, block: true, lot: true } },
  employeeProfile: { select: { position: true } },
};

const conversationInclude = {
  participants: {
    include: {
      user: { select: chatUserSelect },
    },
    orderBy: { createdAt: "asc" as const },
  },
  messages: {
    include: {
      sender: { select: chatUserSelect },
    },
    orderBy: { createdAt: "desc" as const },
    take: 40,
  },
};

export async function getChatPageData(userId: string, selectedConversationId?: string) {
  const conversations = await prisma.chatConversation.findMany({
    where: { participants: { some: { userId, deletedAt: null } } },
    include: conversationInclude,
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  const candidateId = selectedConversationId || conversations[0]?.id;
  const selectedConversation = candidateId
    ? await prisma.chatConversation.findFirst({
        where: { id: candidateId, participants: { some: { userId, deletedAt: null } } },
        include: {
          participants: conversationInclude.participants,
          messages: {
            include: { sender: { select: chatUserSelect } },
            orderBy: { createdAt: "desc" },
            take: 120,
          },
        },
      })
    : null;

  return { conversations, selectedConversation };
}

export async function getChatRecipients(scope: "admin" | "portal" | "employee", currentUserId: string) {
  const roleFilter =
    scope === "portal"
      ? [Role.ADMIN, Role.SYSTEM_ADMIN, Role.EMPLOYEE]
      : scope === "employee"
        ? [Role.ADMIN, Role.SYSTEM_ADMIN, Role.HOMEOWNER]
        : [Role.ADMIN, Role.SYSTEM_ADMIN, Role.HOMEOWNER, Role.EMPLOYEE];

  return prisma.user.findMany({
    where: { id: { not: currentUserId }, role: { in: roleFilter } },
    select: chatUserSelect,
    orderBy: [{ role: "asc" }, { name: "asc" }],
    take: 150,
  });
}
