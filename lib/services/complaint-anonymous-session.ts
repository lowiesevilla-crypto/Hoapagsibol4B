import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { compare } from "bcryptjs";
import { ComplaintPrivacyMode, ComplaintStatus } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { rateLimitAvailable, recordRateLimitFailure } from "@/lib/rate-limit";

export const ANONYMOUS_COMPLAINT_COOKIE = "hoa_complaint_anon";
export const ANONYMOUS_MESSAGE_MAX_LENGTH = 2000;
const DEFAULT_SESSION_MINUTES = 30;
const MIN_SESSION_MINUTES = 5;
const MAX_SESSION_MINUTES = 120;
const INITIAL_MESSAGE_LIMIT = 50;
const INCREMENTAL_MESSAGE_LIMIT = 50;

export type AnonymousConversationMessage = {
  id: string;
  body: string;
  createdAt: string;
  sender: "ANONYMOUS_COMPLAINANT" | "HOA_STAFF" | "SYSTEM";
  authorDisplayName: string;
};

export type AnonymousConversation = {
  publicReference: string;
  title: string;
  requestedAction: string | null;
  status: ComplaintStatus;
  submittedAt: string;
  updatedAt: string;
  messages: AnonymousConversationMessage[];
  nextCursor: string | null;
  previousCursor: string | null;
  hasMoreBefore: boolean;
};

type SettingRow = {
  foundationEnabled: number | boolean;
  anonymousMessagingEnabled: number | boolean;
  anonymousSessionMinutes: number;
};

type SessionRow = {
  id: string;
  tenantId: string;
  complaintId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  publicReference: string;
  title: string;
  requestedAction: string | null;
  status: ComplaintStatus;
  submittedAt: Date;
  updatedAt: Date;
};

type MessageRow = {
  id: string;
  body: string;
  createdAt: Date;
  senderType: "COMPLAINANT" | "STAFF" | "SYSTEM";
  authorId: string | null;
};

type ExistingMessageRow = MessageRow & { clientMessageId: string | null };
type CursorRow = { createdAt: Date };

function normalizeTrackingCode(value: string) {
  return value.trim().toUpperCase();
}

function sessionTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

function normalizePlainText(value: unknown) {
  return String(value ?? "").replace(/\u0000/g, "").trim();
}

function safeClientMessageId(value: unknown) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(id)) throw new Error("Message request identifier is invalid.");
  return id;
}

async function getSettings(tenantId: string) {
  const rows = await platformPrisma.$queryRaw<SettingRow[]>`
    SELECT foundationEnabled, anonymousMessagingEnabled, anonymousSessionMinutes
    FROM GrievanceSetting
    WHERE tenantId = ${tenantId}
    LIMIT 1
  `;
  const row = rows[0];
  const minutes = Math.max(MIN_SESSION_MINUTES, Math.min(MAX_SESSION_MINUTES, Number(row?.anonymousSessionMinutes || DEFAULT_SESSION_MINUTES)));
  return {
    foundationEnabled: row ? Boolean(row.foundationEnabled) : true,
    anonymousMessagingEnabled: row ? Boolean(row.anonymousMessagingEnabled) : true,
    sessionMinutes: minutes,
  };
}

async function requireAnonymousMessagingEnabled(tenantId: string) {
  const settings = await getSettings(tenantId);
  if (!settings.foundationEnabled || !settings.anonymousMessagingEnabled) {
    throw new Error("Anonymous complaint conversation is currently unavailable.");
  }
  return settings;
}

async function lookupSession(rawToken: string): Promise<SessionRow> {
  if (!rawToken || rawToken.length < 32 || rawToken.length > 160) throw new Error("Anonymous complaint session is invalid or expired.");
  const tokenHash = sessionTokenHash(rawToken);
  const rows = await platformPrisma.$queryRaw<SessionRow[]>`
    SELECT
      s.id,
      s.tenantId,
      s.complaintId,
      s.expiresAt,
      s.revokedAt,
      c.publicReference,
      c.title,
      c.requestedAction,
      c.status,
      c.submittedAt,
      c.updatedAt
    FROM ComplaintAnonymousSession s
    INNER JOIN Complaint c
      ON c.tenantId = s.tenantId AND c.id = s.complaintId
    WHERE s.tokenHash = ${tokenHash}
      AND s.revokedAt IS NULL
      AND s.expiresAt > NOW(3)
      AND c.privacyMode = 'ANONYMOUS'
    LIMIT 1
  `;
  const session = rows[0];
  if (!session) throw new Error("Anonymous complaint session is invalid or expired.");
  await requireAnonymousMessagingEnabled(session.tenantId);
  return session;
}

async function touchSession(session: SessionRow) {
  await platformPrisma.$executeRaw`
    UPDATE ComplaintAnonymousSession
    SET lastSeenAt = NOW(3), updatedAt = NOW(3)
    WHERE id = ${session.id}
      AND tenantId = ${session.tenantId}
      AND complaintId = ${session.complaintId}
      AND revokedAt IS NULL
      AND expiresAt > NOW(3)
  `;
}

function mapMessage(row: MessageRow): AnonymousConversationMessage {
  if (row.senderType === "SYSTEM") {
    return { id: row.id, body: row.body, createdAt: row.createdAt.toISOString(), sender: "SYSTEM", authorDisplayName: "HOAHub" };
  }
  if (row.senderType === "COMPLAINANT") {
    return { id: row.id, body: row.body, createdAt: row.createdAt.toISOString(), sender: "ANONYMOUS_COMPLAINANT", authorDisplayName: "Anonymous complainant" };
  }
  return { id: row.id, body: row.body, createdAt: row.createdAt.toISOString(), sender: "HOA_STAFF", authorDisplayName: "HOA Staff" };
}

async function cursorCreatedAt(session: SessionRow, cursor: string) {
  const rows = await platformPrisma.$queryRaw<CursorRow[]>`
    SELECT createdAt
    FROM ComplaintMessage
    WHERE tenantId = ${session.tenantId}
      AND complaintId = ${session.complaintId}
      AND id = ${cursor}
      AND visibility = 'PUBLIC'
    LIMIT 1
  `;
  const createdAt = rows[0]?.createdAt;
  if (!createdAt) throw new Error("Message cursor is invalid.");
  return createdAt;
}

export async function createAnonymousComplaintSession(trackingCode: string, pin: string) {
  const normalizedCode = normalizeTrackingCode(trackingCode);
  const normalizedPin = pin.trim();
  if (!/^[A-Z0-9-]{8,40}$/.test(normalizedCode) || !/^\d{6}$/.test(normalizedPin)) throw new Error("Tracking code or PIN was not found.");

  const rateKey = `anonymous-session:${normalizedCode}`;
  if (!await rateLimitAvailable("complaint-anonymous-session-auth", rateKey, 8, 15 * 60 * 1000)) throw new Error("Too many attempts. Please try again later.");

  const credential = await platformPrisma.complaintTrackingCredential.findUnique({
    where: { trackingCode: normalizedCode },
    include: { complaint: { select: { id: true, tenantId: true, privacyMode: true } } },
  });
  if (!credential || credential.disabledAt || credential.complaint.privacyMode !== ComplaintPrivacyMode.ANONYMOUS || !await compare(normalizedPin, credential.pinHash)) {
    await recordRateLimitFailure("complaint-anonymous-session-auth", rateKey);
    throw new Error("Tracking code or PIN was not found.");
  }

  const settings = await requireAnonymousMessagingEnabled(credential.tenantId);
  const rawToken = newSessionToken();
  const tokenHash = sessionTokenHash(rawToken);
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + settings.sessionMinutes * 60 * 1000);

  await platformPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO ComplaintAnonymousSession
        (id, tenantId, complaintId, tokenHash, expiresAt, lastSeenAt, createdAt, updatedAt)
      VALUES
        (${id}, ${credential.tenantId}, ${credential.complaintId}, ${tokenHash}, ${expiresAt}, NOW(3), NOW(3), NOW(3))
    `;
    await tx.complaintTrackingCredential.update({ where: { id: credential.id }, data: { lastAccessAt: new Date() } });
    await tx.auditLog.create({
      data: {
        tenantId: credential.tenantId,
        actorId: null,
        module: "COMPLAINTS",
        action: "CREATE_ANONYMOUS_COMPLAINT_SESSION",
        entityType: "Complaint",
        entityId: credential.complaintId,
        metadata: { sessionId: id, expiresAt: expiresAt.toISOString() },
      },
    });
  });

  const conversation = await getAnonymousComplaintConversation(rawToken);
  return { token: rawToken, expiresAt, conversation };
}

export async function getAnonymousComplaintConversation(rawToken: string, afterId?: string | null, beforeId?: string | null): Promise<AnonymousConversation> {
  const session = await lookupSession(rawToken);
  const after = String(afterId || "").trim();
  const before = String(beforeId || "").trim();
  if (after && before) throw new Error("Choose only one message cursor direction.");

  let messages: MessageRow[] = [];
  let nextCursor: string | null = null;
  let previousCursor: string | null = null;
  let hasMoreBefore = false;

  if (after) {
    const createdAt = await cursorCreatedAt(session, after);
    messages = await platformPrisma.$queryRaw<MessageRow[]>`
      SELECT id, body, createdAt, senderType, authorId
      FROM ComplaintMessage
      WHERE tenantId = ${session.tenantId}
        AND complaintId = ${session.complaintId}
        AND visibility = 'PUBLIC'
        AND (createdAt > ${createdAt} OR (createdAt = ${createdAt} AND id > ${after}))
      ORDER BY createdAt ASC, id ASC
      LIMIT ${INCREMENTAL_MESSAGE_LIMIT}
    `;
    nextCursor = messages.at(-1)?.id ?? after;
  } else if (before) {
    const createdAt = await cursorCreatedAt(session, before);
    const older = await platformPrisma.$queryRaw<MessageRow[]>`
      SELECT id, body, createdAt, senderType, authorId
      FROM ComplaintMessage
      WHERE tenantId = ${session.tenantId}
        AND complaintId = ${session.complaintId}
        AND visibility = 'PUBLIC'
        AND (createdAt < ${createdAt} OR (createdAt = ${createdAt} AND id < ${before}))
      ORDER BY createdAt DESC, id DESC
      LIMIT ${INITIAL_MESSAGE_LIMIT + 1}
    `;
    hasMoreBefore = older.length > INITIAL_MESSAGE_LIMIT;
    messages = older.slice(0, INITIAL_MESSAGE_LIMIT).reverse();
    previousCursor = hasMoreBefore ? messages.at(0)?.id ?? null : null;
  } else {
    const recent = await platformPrisma.$queryRaw<MessageRow[]>`
      SELECT id, body, createdAt, senderType, authorId
      FROM ComplaintMessage
      WHERE tenantId = ${session.tenantId}
        AND complaintId = ${session.complaintId}
        AND visibility = 'PUBLIC'
      ORDER BY createdAt DESC, id DESC
      LIMIT ${INITIAL_MESSAGE_LIMIT + 1}
    `;
    hasMoreBefore = recent.length > INITIAL_MESSAGE_LIMIT;
    messages = recent.slice(0, INITIAL_MESSAGE_LIMIT).reverse();
    nextCursor = messages.at(-1)?.id ?? null;
    previousCursor = hasMoreBefore ? messages.at(0)?.id ?? null : null;
  }

  await touchSession(session);
  const mapped = messages.map(mapMessage);
  return {
    publicReference: session.publicReference,
    title: session.title,
    requestedAction: session.requestedAction,
    status: session.status,
    submittedAt: session.submittedAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    messages: mapped,
    nextCursor,
    previousCursor,
    hasMoreBefore,
  };
}

export async function postAnonymousComplaintMessage(rawToken: string, input: { body: unknown; clientMessageId: unknown }) {
  const session = await lookupSession(rawToken);
  const body = normalizePlainText(input.body);
  const clientMessageId = safeClientMessageId(input.clientMessageId);
  if (body.length < 2) throw new Error("Enter a message.");
  if (body.length > ANONYMOUS_MESSAGE_MAX_LENGTH) throw new Error(`Message must be ${ANONYMOUS_MESSAGE_MAX_LENGTH} characters or fewer.`);

  const rateKey = `${session.tenantId}:${session.complaintId}:${session.id}`;
  if (!await rateLimitAvailable("complaint-anonymous-message", rateKey, 20, 5 * 60 * 1000)) throw new Error("Too many messages. Please wait before sending another message.");
  await recordRateLimitFailure("complaint-anonymous-message", rateKey);

  const existing = await platformPrisma.$queryRaw<ExistingMessageRow[]>`
    SELECT id, body, createdAt, senderType, authorId, clientMessageId
    FROM ComplaintMessage
    WHERE tenantId = ${session.tenantId}
      AND complaintId = ${session.complaintId}
      AND anonymousSessionId = ${session.id}
      AND clientMessageId = ${clientMessageId}
    LIMIT 1
  `;
  if (existing[0]) {
    if (existing[0].body !== body) throw new Error("This message request identifier was already used for different content.");
    return mapMessage(existing[0]);
  }

  const messageId = randomUUID();
  const saved = await platformPrisma.$transaction(async (tx) => {
    const affected = await tx.$executeRaw`
      INSERT IGNORE INTO ComplaintMessage
        (id, tenantId, complaintId, authorId, authorDisplayName, visibility, body, senderType, channel, clientMessageId, anonymousSessionId, createdAt)
      VALUES
        (${messageId}, ${session.tenantId}, ${session.complaintId}, NULL, 'Anonymous complainant', 'PUBLIC', ${body}, 'COMPLAINANT', 'ANONYMOUS_TRACKER', ${clientMessageId}, ${session.id}, NOW(3))
    `;
    if (Number(affected) !== 1) {
      const raced = await tx.$queryRaw<ExistingMessageRow[]>`
        SELECT id, body, createdAt, senderType, authorId, clientMessageId
        FROM ComplaintMessage
        WHERE tenantId = ${session.tenantId}
          AND complaintId = ${session.complaintId}
          AND anonymousSessionId = ${session.id}
          AND clientMessageId = ${clientMessageId}
        LIMIT 1
      `;
      if (!raced[0] || raced[0].body !== body) throw new Error("Message could not be saved safely. Please retry.");
      return raced[0];
    }

    await tx.$executeRaw`
      INSERT INTO ComplaintGrievanceActivity
        (id, tenantId, complaintId, grievanceCaseId, actorId, eventType, message, metadata, createdAt)
      VALUES
        (${randomUUID()}, ${session.tenantId}, ${session.complaintId}, NULL, NULL, 'ANONYMOUS_MESSAGE_ADDED', 'Anonymous complainant added a public message.', ${JSON.stringify({ messageId })}, NOW(3))
    `;
    await tx.complaintTimelineEvent.create({
      data: {
        tenantId: session.tenantId,
        complaintId: session.complaintId,
        actorId: null,
        eventType: "COMMENTED",
        message: "Anonymous complainant added a public message.",
        metadata: { source: "ANONYMOUS_TRACKER" },
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: session.tenantId,
        actorId: null,
        module: "COMPLAINTS",
        action: "ADD_ANONYMOUS_COMPLAINT_MESSAGE",
        entityType: "Complaint",
        entityId: session.complaintId,
        metadata: { messageId, source: "ANONYMOUS_TRACKER" },
      },
    });
    const inserted = await tx.$queryRaw<MessageRow[]>`
      SELECT id, body, createdAt, senderType, authorId
      FROM ComplaintMessage
      WHERE tenantId = ${session.tenantId}
        AND complaintId = ${session.complaintId}
        AND id = ${messageId}
        AND visibility = 'PUBLIC'
      LIMIT 1
    `;
    if (!inserted[0]) throw new Error("Message could not be loaded after saving.");
    return inserted[0];
  });

  await touchSession(session);
  return mapMessage(saved);
}

export async function revokeAnonymousComplaintSession(rawToken: string) {
  if (!rawToken) return;
  const tokenHash = sessionTokenHash(rawToken);
  const sessions = await platformPrisma.$queryRaw<Array<{ id: string; tenantId: string; complaintId: string }>>`
    SELECT id, tenantId, complaintId
    FROM ComplaintAnonymousSession
    WHERE tokenHash = ${tokenHash}
      AND revokedAt IS NULL
    LIMIT 1
  `;
  const session = sessions[0];
  if (!session) return;
  await platformPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE ComplaintAnonymousSession
      SET revokedAt = NOW(3), updatedAt = NOW(3)
      WHERE id = ${session.id} AND tenantId = ${session.tenantId}
    `;
    await tx.auditLog.create({
      data: {
        tenantId: session.tenantId,
        actorId: null,
        module: "COMPLAINTS",
        action: "REVOKE_ANONYMOUS_COMPLAINT_SESSION",
        entityType: "Complaint",
        entityId: session.complaintId,
        metadata: { sessionId: session.id },
      },
    });
  });
}