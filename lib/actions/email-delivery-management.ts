"use server";

import { NotificationChannel, NotificationStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import {
  emailDeliveryWhere,
  parseEmailDeliveryFilters,
  parseEmailDeliveryPageSize,
  parseNotificationStatus,
  parseNotificationType,
  PROTECTED_QUEUE_NOTIFICATION_TYPES,
} from "@/lib/email-delivery-management";

const RETRYABLE_EMAIL_TYPES = [...PROTECTED_QUEUE_NOTIFICATION_TYPES];
const TERMINAL_EMAIL_STATUSES = [NotificationStatus.SENT, NotificationStatus.SKIPPED] as const;
const EMAIL_ARCHIVE_ACTION = "ARCHIVE_EMAIL_HISTORY";
const EMAIL_ARCHIVE_ENTITY = "NotificationLogArchive";
const HISTORY_ARCHIVE_MAX_PER_ACTION = 5000;

function metadataObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, Prisma.JsonValue>;
}

function maskedEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "Invalid email";
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(2, Math.min(8, local.length - visible.length)))}@${domain}`;
}

function positivePage(value: FormDataEntryValue | null) {
  const parsed = Number(String(value || "1"));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function managementUrl(
  kind: "success" | "error",
  message: string,
  navigation?: { q: string; status: string; type: string; page: number; pageSize: number },
) {
  const params = new URLSearchParams({ [kind]: message });
  if (navigation?.q) params.set("q", navigation.q);
  if (navigation?.status) params.set("status", navigation.status);
  if (navigation?.type) params.set("type", navigation.type);
  if (navigation && navigation.page > 1) params.set("page", String(navigation.page));
  if (navigation && navigation.pageSize !== 25) params.set("pageSize", String(navigation.pageSize));
  return `/admin/settings/email-delivery?${params.toString()}`;
}

function archiveUrl(
  kind: "success" | "error",
  message: string,
  navigation?: { q: string; status: string; type: string; page: number; pageSize: number },
) {
  const params = new URLSearchParams({ [kind]: message });
  if (navigation?.q) params.set("q", navigation.q);
  if (navigation?.status) params.set("status", navigation.status);
  if (navigation?.type) params.set("type", navigation.type);
  if (navigation && navigation.page > 1) params.set("page", String(navigation.page));
  if (navigation && navigation.pageSize !== 25) params.set("pageSize", String(navigation.pageSize));
  return `/admin/settings/email-delivery/archive?${params.toString()}`;
}

export async function retryEmailDeliveryAction(formData: FormData) {
  const admin = await requirePermission(Permission.SETTINGS_MANAGE);
  const notificationId = String(formData.get("notificationId") || "").trim();
  if (!notificationId) redirect(managementUrl("error", "Select an email delivery record to retry."));

  const notification = await prisma.notificationLog.findFirst({
    where: {
      id: notificationId,
      tenantId: admin.tenantId,
      channel: NotificationChannel.EMAIL,
    },
    select: {
      id: true,
      status: true,
      type: true,
      metadata: true,
      recipientId: true,
      subject: true,
    },
  });

  if (!notification) redirect(managementUrl("error", "Email delivery record was not found for this tenant."));
  if (!RETRYABLE_EMAIL_TYPES.includes(notification.type as (typeof RETRYABLE_EMAIL_TYPES)[number])) {
    redirect(managementUrl("error", "Only queued billing and bill-reminder email records can be retried from this page."));
  }
  if (notification.status === NotificationStatus.QUEUED) {
    redirect(managementUrl("success", "This email is already QUEUED and waiting for the protected delivery worker. QUEUED does not mean SENT yet."));
  }
  if (notification.status !== NotificationStatus.FAILED) {
    redirect(managementUrl("error", "Only failed email deliveries can be placed back into the protected queue."));
  }

  const currentMetadata = metadataObject(notification.metadata);
  const {
    nextAttemptAt: _nextAttemptAt,
    retryExhausted: _retryExhausted,
    lastFailureKind: _lastFailureKind,
    ...preservedMetadata
  } = currentMetadata;
  const requestedAt = new Date().toISOString();

  try {
    await prisma.$transaction(async (tx) => {
      const update = await tx.notificationLog.updateMany({
        where: {
          id: notification.id,
          tenantId: admin.tenantId,
          channel: NotificationChannel.EMAIL,
          status: NotificationStatus.FAILED,
          type: { in: RETRYABLE_EMAIL_TYPES },
        },
        data: {
          status: NotificationStatus.QUEUED,
          errorMessage: null,
          sentAt: null,
          providerMessageId: null,
          metadata: {
            ...preservedMetadata,
            retryAttempts: 0,
            adminRetryRequestedAt: requestedAt,
            adminRetryRequestedBy: admin.id,
          } as Prisma.InputJsonValue,
        },
      });

      if (update.count !== 1) throw new Error("The email delivery status changed before the retry could be queued. Refresh and try again.");

      await tx.auditLog.create({
        data: {
          tenantId: admin.tenantId,
          actorId: admin.id,
          module: "EMAIL",
          action: "REQUEUE_FAILED_EMAIL",
          entityType: "NotificationLog",
          entityId: notification.id,
          metadata: {
            notificationType: notification.type,
            recipientId: notification.recipientId,
            subject: notification.subject,
            requestedAt,
            previousStatus: NotificationStatus.FAILED,
            newStatus: NotificationStatus.QUEUED,
            directSmtpSend: false,
          },
        },
      });
    });
  } catch (error) {
    redirect(managementUrl("error", error instanceof Error ? error.message : "Email retry could not be queued."));
  }

  revalidatePath("/admin/settings/email-delivery");
  redirect(managementUrl("success", "Email retry was accepted and is now QUEUED. It is not yet SENT; the page will show SENT, FAILED, or SKIPPED after the protected worker processes it."));
}

export async function bulkEmailDeliveryAction(formData: FormData) {
  const admin = await requirePermission(Permission.SETTINGS_MANAGE);
  const bulkAction = String(formData.get("bulkAction") || "");
  if (!["requeue", "remove", "archive", "purge"].includes(bulkAction)) {
    redirect(managementUrl("error", "Choose a valid bulk email action."));
  }

  const filters = parseEmailDeliveryFilters({
    q: String(formData.get("q") || ""),
    status: String(formData.get("status") || ""),
    type: String(formData.get("type") || ""),
  });
  const navigation = {
    q: filters.q,
    status: filters.status || "",
    type: filters.type || "",
    page: positivePage(formData.get("page")),
    pageSize: parseEmailDeliveryPageSize(String(formData.get("pageSize") || "")),
  };
  const selectAllFiltered = String(formData.get("selectAllFiltered") || "") === "true";
  const notificationIds = [...new Set(formData.getAll("notificationIds").map((value) => String(value).trim()).filter(Boolean))].slice(0, 100);

  if (!selectAllFiltered && notificationIds.length === 0) {
    redirect(managementUrl("error", "Select at least one actionable email record, or choose Apply to all filtered eligible records.", navigation));
  }

  const filteredWhere = emailDeliveryWhere(admin.tenantId, filters);
  const selectionWhere: Prisma.NotificationLogWhereInput = selectAllFiltered
    ? filteredWhere
    : { AND: [filteredWhere, { id: { in: notificationIds } }] };
  const requestedAt = new Date().toISOString();
  let affectedCount = 0;
  let cappedArchive = false;

  try {
    if (bulkAction === "remove") {
      const result = await prisma.$transaction(async (tx) => {
        const update = await tx.notificationLog.updateMany({
          where: { AND: [selectionWhere, { status: NotificationStatus.QUEUED }] },
          data: {
            status: NotificationStatus.SKIPPED,
            errorMessage: `Removed from active email queue by System Administrator on ${requestedAt}.`,
            sentAt: null,
            providerMessageId: null,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: admin.tenantId,
            actorId: admin.id,
            module: "EMAIL",
            action: "BULK_REMOVE_QUEUED_EMAILS",
            entityType: "NotificationLog",
            entityId: selectAllFiltered ? "FILTERED_SELECTION" : "PAGE_SELECTION",
            metadata: {
              requestedAt,
              affectedCount: update.count,
              selectionMode: selectAllFiltered ? "FILTERED" : "IDS",
              selectedIdCount: selectAllFiltered ? null : notificationIds.length,
              filters: { q: filters.q || null, status: filters.status, type: filters.type },
              removalScope: "ANY_QUEUED_EMAIL",
              hardDeleted: false,
              resultingStatus: NotificationStatus.SKIPPED,
              administratorVisibleDisposition: "REMOVED_FROM_QUEUE",
            },
          },
        });
        return update;
      });
      affectedCount = result.count;
    } else if (bulkAction === "requeue") {
      const result = await prisma.$transaction(async (tx) => {
        const update = await tx.notificationLog.updateMany({
          where: {
            AND: [
              selectionWhere,
              { type: { in: RETRYABLE_EMAIL_TYPES } },
              { status: { in: [NotificationStatus.QUEUED, NotificationStatus.FAILED] } },
            ],
          },
          data: {
            status: NotificationStatus.QUEUED,
            errorMessage: null,
            sentAt: null,
            providerMessageId: null,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: admin.tenantId,
            actorId: admin.id,
            module: "EMAIL",
            action: "BULK_REQUEUE_EMAILS",
            entityType: "NotificationLog",
            entityId: selectAllFiltered ? "FILTERED_SELECTION" : "PAGE_SELECTION",
            metadata: {
              requestedAt,
              affectedCount: update.count,
              selectionMode: selectAllFiltered ? "FILTERED" : "IDS",
              selectedIdCount: selectAllFiltered ? null : notificationIds.length,
              filters: { q: filters.q || null, status: filters.status, type: filters.type },
              queueTypes: RETRYABLE_EMAIL_TYPES,
              directSmtpSend: false,
            },
          },
        });
        return update;
      });
      affectedCount = result.count;
    } else if (bulkAction === "archive") {
      const archived = await prisma.$transaction(async (tx) => {
        const rows = await tx.notificationLog.findMany({
          where: { AND: [selectionWhere, { status: { in: [...TERMINAL_EMAIL_STATUSES] } }] },
          select: {
            id: true,
            recipientId: true,
            recipient: { select: { name: true, email: true } },
            type: true,
            channel: true,
            subject: true,
            status: true,
            sentAt: true,
            providerMessageId: true,
            errorMessage: true,
            entityType: true,
            entityId: true,
            eventKey: true,
            metadata: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: HISTORY_ARCHIVE_MAX_PER_ACTION,
        });
        if (rows.length === 0) return 0;
        await tx.auditLog.createMany({
          data: rows.map((row) => ({
            tenantId: admin.tenantId,
            actorId: admin.id,
            module: "EMAIL",
            action: EMAIL_ARCHIVE_ACTION,
            entityType: EMAIL_ARCHIVE_ENTITY,
            entityId: row.id,
            reason: `${row.status} | ${row.type} | ${row.recipient.name || "Unnamed recipient"} | ${maskedEmail(row.recipient.email)} | ${row.subject}`,
            metadata: {
              originalNotificationId: row.id,
              recipientId: row.recipientId,
              recipientName: row.recipient.name || null,
              maskedEmail: maskedEmail(row.recipient.email),
              notificationType: row.type,
              channel: row.channel,
              subject: row.subject,
              originalStatus: row.status,
              sentAt: row.sentAt?.toISOString() || null,
              providerMessageId: row.providerMessageId,
              errorMessage: row.errorMessage,
              sourceEntityType: row.entityType,
              sourceEntityId: row.entityId,
              eventKey: row.eventKey,
              originalMetadata: row.metadata || undefined,
              originalCreatedAt: row.createdAt.toISOString(),
              archivedAt: requestedAt,
              archivedBy: admin.id,
            } as Prisma.InputJsonValue,
          })),
        });
        const deleted = await tx.notificationLog.deleteMany({
          where: {
            id: { in: rows.map((row) => row.id) },
            tenantId: admin.tenantId,
            channel: NotificationChannel.EMAIL,
            status: { in: [...TERMINAL_EMAIL_STATUSES] },
          },
        });
        if (deleted.count !== rows.length) throw new Error("Email history changed while archiving. No partial archive was committed.");
        return deleted.count;
      });
      affectedCount = archived;
      cappedArchive = selectAllFiltered && archived === HISTORY_ARCHIVE_MAX_PER_ACTION;
    } else {
      const deleted = await prisma.$transaction(async (tx) => {
        const result = await tx.notificationLog.deleteMany({
          where: { AND: [selectionWhere, { status: { in: [...TERMINAL_EMAIL_STATUSES] } }] },
        });
        await tx.auditLog.create({
          data: {
            tenantId: admin.tenantId,
            actorId: admin.id,
            module: "EMAIL",
            action: "PERMANENT_DELETE_EMAIL_HISTORY",
            entityType: "NotificationLogDeletion",
            entityId: selectAllFiltered ? "FILTERED_SELECTION" : "PAGE_SELECTION",
            reason: "System Administrator permanently deleted terminal email delivery history.",
            metadata: {
              requestedAt,
              deletedCount: result.count,
              selectionMode: selectAllFiltered ? "FILTERED" : "IDS",
              selectedIdCount: selectAllFiltered ? null : notificationIds.length,
              filters: { q: filters.q || null, status: filters.status, type: filters.type },
              eligibleStatuses: TERMINAL_EMAIL_STATUSES,
              detailedEmailHistoryRetained: false,
            },
          },
        });
        return result.count;
      });
      affectedCount = deleted;
    }
  } catch (error) {
    redirect(managementUrl(
      "error",
      error instanceof Error ? error.message : "The bulk email action could not be completed.",
      navigation,
    ));
  }

  revalidatePath("/admin/settings/email-delivery");
  revalidatePath("/admin/settings/email-delivery/archive");

  if (bulkAction === "remove") {
    redirect(managementUrl(
      "success",
      affectedCount
        ? `${affectedCount} queued email record${affectedCount === 1 ? " was" : "s were"} REMOVED from active delivery and will not be sent. The record remains visible as REMOVED audit history.`
        : "No eligible QUEUED email records in the selection were available for removal. SENT, FAILED, SKIPPED, and REMOVED history were left unchanged.",
      navigation,
    ));
  }
  if (bulkAction === "archive") {
    redirect(managementUrl(
      "success",
      affectedCount
        ? `${affectedCount} SENT/SKIPPED email histor${affectedCount === 1 ? "y was" : "ies were"} archived out of the live delivery table.${cappedArchive ? ` The safety batch limit is ${HISTORY_ARCHIVE_MAX_PER_ACTION}; repeat the same filtered archive action if more records remain.` : ""}`
        : "No SENT or SKIPPED email history in the selection was eligible for archive.",
      navigation,
    ));
  }
  if (bulkAction === "purge") {
    redirect(managementUrl(
      "success",
      affectedCount
        ? `${affectedCount} SENT/SKIPPED email history record${affectedCount === 1 ? " was" : "s were"} permanently deleted. Only a non-content administrative deletion audit remains.`
        : "No SENT or SKIPPED email history in the selection was eligible for permanent deletion.",
      navigation,
    ));
  }

  redirect(managementUrl(
    "success",
    affectedCount
      ? `${affectedCount} eligible email${affectedCount === 1 ? " is" : "s are"} now QUEUED for protected resend/retry. This confirms queueing only, not delivery; final status will become SENT, FAILED, or SKIPPED after worker processing.`
      : "No QUEUED or FAILED billing/reminder emails in the selection were eligible for resend/retry. History-only records were left unchanged.",
    navigation,
  ));
}

export async function purgeArchivedEmailHistoryAction(formData: FormData) {
  const admin = await requirePermission(Permission.SETTINGS_MANAGE);
  if (String(formData.get("bulkAction") || "") !== "purgeArchived") {
    redirect(archiveUrl("error", "Choose a valid archived-history action."));
  }

  const q = String(formData.get("q") || "").trim().slice(0, 120);
  const status = parseNotificationStatus(String(formData.get("status") || ""));
  const type = parseNotificationType(String(formData.get("type") || ""));
  const page = positivePage(formData.get("page"));
  const pageSize = parseEmailDeliveryPageSize(String(formData.get("pageSize") || ""));
  const navigation = { q, status: status || "", type: type || "", page, pageSize };
  const selectAllFiltered = String(formData.get("selectAllFiltered") || "") === "true";
  const archiveIds = [...new Set(formData.getAll("archiveIds").map((value) => String(value).trim()).filter(Boolean))].slice(0, 100);
  if (!selectAllFiltered && archiveIds.length === 0) {
    redirect(archiveUrl("error", "Select at least one archived email record, or choose Apply to all filtered archived records.", navigation));
  }

  const reasonFilters: Prisma.AuditLogWhereInput[] = [];
  if (q) reasonFilters.push({ reason: { contains: q } });
  if (status) reasonFilters.push({ reason: { startsWith: `${status} |` } });
  if (type) reasonFilters.push({ reason: { contains: `| ${type} |` } });
  const filteredWhere: Prisma.AuditLogWhereInput = {
    tenantId: admin.tenantId,
    module: "EMAIL",
    action: EMAIL_ARCHIVE_ACTION,
    entityType: EMAIL_ARCHIVE_ENTITY,
    ...(reasonFilters.length ? { AND: reasonFilters } : {}),
  };
  const selectionWhere: Prisma.AuditLogWhereInput = selectAllFiltered
    ? filteredWhere
    : { AND: [filteredWhere, { id: { in: archiveIds } }] };
  const requestedAt = new Date().toISOString();
  let deletedCount = 0;

  try {
    deletedCount = await prisma.$transaction(async (tx) => {
      const deleted = await tx.auditLog.deleteMany({ where: selectionWhere });
      await tx.auditLog.create({
        data: {
          tenantId: admin.tenantId,
          actorId: admin.id,
          module: "EMAIL",
          action: "PERMANENT_DELETE_ARCHIVED_EMAIL_HISTORY",
          entityType: "NotificationLogArchiveDeletion",
          entityId: selectAllFiltered ? "FILTERED_SELECTION" : "PAGE_SELECTION",
          reason: "System Administrator permanently deleted archived email delivery history.",
          metadata: {
            requestedAt,
            deletedCount: deleted.count,
            selectionMode: selectAllFiltered ? "FILTERED" : "IDS",
            selectedIdCount: selectAllFiltered ? null : archiveIds.length,
            filters: { q: q || null, status, type },
            detailedArchiveRetained: false,
          },
        },
      });
      return deleted.count;
    });
  } catch (error) {
    redirect(archiveUrl("error", error instanceof Error ? error.message : "Archived email history could not be permanently deleted.", navigation));
  }

  revalidatePath("/admin/settings/email-delivery/archive");
  redirect(archiveUrl(
    "success",
    deletedCount
      ? `${deletedCount} archived email history record${deletedCount === 1 ? " was" : "s were"} permanently deleted. A non-content administrative deletion audit remains.`
      : "No archived email history matched the selected records or filters.",
    navigation,
  ));
}
