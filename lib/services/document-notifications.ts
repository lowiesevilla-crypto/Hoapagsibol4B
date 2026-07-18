import "server-only";

import { NotificationChannel, NotificationType, Prisma, Role } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { requireDocumentPermission, type DocumentExecutionContext } from "@/lib/services/document-runtime-context";

export type DocumentNotificationEvent = "REQUEST_SUBMITTED" | "APPROVAL_REQUIRED" | "APPROVED" | "REJECTED" | "RETURNED" | "READY_FOR_DOWNLOAD" | "RELEASED" | "REVOKED";

const eventType: Record<DocumentNotificationEvent, NotificationType> = {
  REQUEST_SUBMITTED: NotificationType.DOCUMENT_REQUEST_SUBMITTED,
  APPROVAL_REQUIRED: NotificationType.DOCUMENT_APPROVAL_REQUIRED,
  APPROVED: NotificationType.DOCUMENT_APPROVED,
  REJECTED: NotificationType.DOCUMENT_REJECTED,
  RETURNED: NotificationType.DOCUMENT_RETURNED,
  READY_FOR_DOWNLOAD: NotificationType.DOCUMENT_READY_FOR_DOWNLOAD,
  RELEASED: NotificationType.DOCUMENT_RELEASED,
  REVOKED: NotificationType.DOCUMENT_REVOKED,
};

export async function recordDocumentNotification(input: { context: DocumentExecutionContext; recipientId: string; event: DocumentNotificationEvent; subject: string; message: string; entityType?: string; entityId?: string; eventKey?: string; metadata?: unknown }) {
  try {
    const recipient = await platformPrisma.user.findFirst({ where: { id: input.recipientId, tenantId: input.context.tenantId, active: true }, select: { id: true } });
    if (!recipient) throw new Error("Notification recipient does not belong to the authenticated tenant.");
    const eventKey = input.eventKey ?? `${input.event}:${input.entityType ?? "document"}:${input.entityId ?? input.recipientId}`;
    const existing = await platformPrisma.notificationLog.findFirst({ where: { tenantId: input.context.tenantId, recipientId: recipient.id, eventKey }, select: { id: true } });
    if (existing) return existing;
    return await platformPrisma.notificationLog.create({ data: { tenantId: input.context.tenantId, recipientId: recipient.id, type: eventType[input.event], channel: NotificationChannel.MESSENGER, subject: input.subject, message: input.message, entityType: input.entityType, entityId: input.entityId, eventKey, metadata: input.metadata === undefined ? undefined : toJson(input.metadata) } });
  } catch (error) {
    console.error("[documents] Notification event could not be recorded.", { event: input.event, tenantId: input.context.tenantId, error });
    return null;
  }
}

export async function notifyDocumentRoles(input: { context: DocumentExecutionContext; roles: Role[]; event: DocumentNotificationEvent; subject: string; message: string; entityType?: string; entityId?: string; metadata?: unknown }) {
  requireDocumentPermission(input.context, "APPROVE_REQUESTS");
  const recipients = await platformPrisma.user.findMany({ where: { tenantId: input.context.tenantId, role: { in: input.roles }, active: true }, select: { id: true } });
  const results = await Promise.all(recipients.map((recipient) => recordDocumentNotification({ ...input, recipientId: recipient.id })));
  return { attempted: recipients.length, recorded: results.filter(Boolean).length };
}

export async function notifyDocumentOwner(context: DocumentExecutionContext, recipientId: string, event: DocumentNotificationEvent, subject: string, message: string, entityId: string, metadata?: unknown) {
  return recordDocumentNotification({ context, recipientId, event, subject, message, entityType: "DocumentRequest", entityId, metadata });
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
