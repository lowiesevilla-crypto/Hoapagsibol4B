import "server-only";

import { randomUUID } from "node:crypto";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

export type ResidentMessagingMode = "INBOX" | "REQUESTS" | "NONE";
export type MessageRequestStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export type ChatPrivacySnapshot = {
  residentMessagingMode: ResidentMessagingMode;
  incomingRequests: Array<{
    id: string;
    conversationId: string;
    requesterUserId: string;
    requesterName: string;
    createdAt: string;
  }>;
  blockedUsers: Array<{ userId: string; name: string }>;
  residents: Array<{ userId: string; name: string; blocked: boolean }>;
};

type PrivacyRow = { residentMessagingMode: string };
type RequestRow = {
  id: string;
  conversationId: string;
  requesterUserId: string;
  requesterName: string;
  createdAt: Date;
};
type BlockRow = { userId: string; name: string };
type RequestStateRow = {
  id: string;
  requesterUserId: string;
  recipientUserId: string;
  status: string;
};

export function isHoaOfficialRole(role: Role | string) {
  return role === Role.ADMIN || role === Role.SYSTEM_ADMIN || role === Role.EMPLOYEE;
}

export function isResidentRole(role: Role | string) {
  return role === Role.HOMEOWNER;
}

export async function getResidentMessagingMode(tenantId: string, userId: string): Promise<ResidentMessagingMode> {
  const rows = await prisma.$queryRaw<PrivacyRow[]>`
    SELECT residentMessagingMode
    FROM ChatPrivacyPreference
    WHERE tenantId = ${tenantId} AND userId = ${userId}
    LIMIT 1
  `;
  return normalizeMode(rows[0]?.residentMessagingMode);
}

export async function setResidentMessagingMode(tenantId: string, userId: string, mode: ResidentMessagingMode) {
  const normalized = normalizeMode(mode);
  await prisma.$executeRaw`
    INSERT INTO ChatPrivacyPreference (id, tenantId, userId, residentMessagingMode, createdAt, updatedAt)
    VALUES (${randomUUID()}, ${tenantId}, ${userId}, ${normalized}, NOW(3), NOW(3))
    ON DUPLICATE KEY UPDATE residentMessagingMode = VALUES(residentMessagingMode), updatedAt = NOW(3)
  `;
  return normalized;
}

export async function areResidentsBlocked(tenantId: string, firstUserId: string, secondUserId: string) {
  const rows = await prisma.$queryRaw<Array<{ total: bigint | number }>>`
    SELECT COUNT(*) AS total
    FROM ChatUserBlock
    WHERE tenantId = ${tenantId}
      AND ((blockerUserId = ${firstUserId} AND blockedUserId = ${secondUserId})
        OR (blockerUserId = ${secondUserId} AND blockedUserId = ${firstUserId}))
  `;
  return Number(rows[0]?.total ?? 0) > 0;
}

export async function setResidentBlock(tenantId: string, blockerUserId: string, blockedUserId: string, blocked: boolean) {
  if (!blockedUserId || blockerUserId === blockedUserId) throw new Error("Choose another resident.");
  if (blocked) {
    await prisma.$executeRaw`
      INSERT INTO ChatUserBlock (id, tenantId, blockerUserId, blockedUserId, createdAt)
      VALUES (${randomUUID()}, ${tenantId}, ${blockerUserId}, ${blockedUserId}, NOW(3))
      ON DUPLICATE KEY UPDATE createdAt = createdAt
    `;
  } else {
    await prisma.$executeRaw`
      DELETE FROM ChatUserBlock
      WHERE tenantId = ${tenantId} AND blockerUserId = ${blockerUserId} AND blockedUserId = ${blockedUserId}
    `;
  }
}

export async function ensureMessageRequest(input: {
  tenantId: string;
  conversationId: string;
  requesterUserId: string;
  recipientUserId: string;
  status?: MessageRequestStatus;
}) {
  const status = input.status ?? "PENDING";
  await prisma.$executeRaw`
    INSERT INTO ChatMessageRequest (id, tenantId, conversationId, requesterUserId, recipientUserId, status, createdAt, updatedAt)
    VALUES (${randomUUID()}, ${input.tenantId}, ${input.conversationId}, ${input.requesterUserId}, ${input.recipientUserId}, ${status}, NOW(3), NOW(3))
    ON DUPLICATE KEY UPDATE
      requesterUserId = VALUES(requesterUserId),
      recipientUserId = VALUES(recipientUserId),
      status = IF(status = 'DECLINED', status, VALUES(status)),
      updatedAt = NOW(3)
  `;
}

export async function getConversationRequestState(tenantId: string, conversationId: string) {
  const rows = await prisma.$queryRaw<RequestStateRow[]>`
    SELECT id, requesterUserId, recipientUserId, status
    FROM ChatMessageRequest
    WHERE tenantId = ${tenantId} AND conversationId = ${conversationId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    status: normalizeRequestStatus(row.status),
  };
}

export async function respondToMessageRequest(input: {
  tenantId: string;
  userId: string;
  requestId: string;
  action: "ACCEPT" | "DECLINE";
}) {
  const status: MessageRequestStatus = input.action === "ACCEPT" ? "ACCEPTED" : "DECLINED";
  const changed = await prisma.$executeRaw`
    UPDATE ChatMessageRequest
    SET status = ${status}, respondedAt = NOW(3), updatedAt = NOW(3)
    WHERE id = ${input.requestId}
      AND tenantId = ${input.tenantId}
      AND recipientUserId = ${input.userId}
      AND status = 'PENDING'
  `;
  if (Number(changed) !== 1) throw new Error("This message request is no longer available.");
}

export async function getHiddenIncomingConversationIds(tenantId: string, userId: string) {
  const rows = await prisma.$queryRaw<Array<{ conversationId: string }>>`
    SELECT conversationId
    FROM ChatMessageRequest
    WHERE tenantId = ${tenantId}
      AND recipientUserId = ${userId}
      AND status IN ('PENDING', 'DECLINED')
  `;
  return new Set(rows.map((row) => row.conversationId));
}

export async function getChatPrivacySnapshot(tenantId: string, userId: string): Promise<ChatPrivacySnapshot> {
  const [residentMessagingMode, incomingRequests, blockedUsers, residents] = await Promise.all([
    getResidentMessagingMode(tenantId, userId),
    prisma.$queryRaw<RequestRow[]>`
      SELECT r.id, r.conversationId, r.requesterUserId, u.name AS requesterName, r.createdAt
      FROM ChatMessageRequest r
      INNER JOIN User u ON u.id = r.requesterUserId AND u.tenantId = r.tenantId
      WHERE r.tenantId = ${tenantId} AND r.recipientUserId = ${userId} AND r.status = 'PENDING'
      ORDER BY r.createdAt DESC
      LIMIT 50
    `,
    prisma.$queryRaw<BlockRow[]>`
      SELECT b.blockedUserId AS userId, u.name
      FROM ChatUserBlock b
      INNER JOIN User u ON u.id = b.blockedUserId AND u.tenantId = b.tenantId
      WHERE b.tenantId = ${tenantId} AND b.blockerUserId = ${userId}
      ORDER BY u.name ASC
      LIMIT 100
    `,
    prisma.user.findMany({
      where: { tenantId, role: Role.HOMEOWNER, active: true, id: { not: userId } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 150,
    }),
  ]);
  const blockedSet = new Set(blockedUsers.map((row) => row.userId));
  return {
    residentMessagingMode,
    incomingRequests: incomingRequests.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      requesterUserId: row.requesterUserId,
      requesterName: row.requesterName,
      createdAt: row.createdAt.toISOString(),
    })),
    blockedUsers,
    residents: residents.map((resident) => ({ userId: resident.id, name: resident.name, blocked: blockedSet.has(resident.id) })),
  };
}

function normalizeMode(value: string | null | undefined): ResidentMessagingMode {
  if (value === "INBOX" || value === "NONE") return value;
  return "REQUESTS";
}

function normalizeRequestStatus(value: string): MessageRequestStatus {
  if (value === "ACCEPTED" || value === "DECLINED") return value;
  return "PENDING";
}
