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
  PROTECTED_QUEUE_NOTIFICATION_TYPES,
} from "@/lib/email-delivery-management";

const RETRYABLE_EMAIL_TYPES = [...PROTECTED_QUEUE_NOTIFICATION_TYPES];

function metadataObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, Prisma.JsonValue>;
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
  if (bulkAction !== "requeue" && bulkAction !== "remove") {
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

  try {
    if (bulkAction === "remove") {
      const result = await prisma.$transaction(async (tx) => {
        const update = await tx.notificationLog.updateMany({
          where: {
            AND: [
              selectionWhere,
              { type: { in: RETRYABLE_EMAIL_TYPES } },
              { status: NotificationStatus.QUEUED },
            ],
          },
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
              queueTypes: RETRYABLE_EMAIL_TYPES,
              hardDeleted: false,
              resultingStatus: NotificationStatus.SKIPPED,
              administratorVisibleDisposition: "REMOVED_FROM_QUEUE",
            },
          },
        });
        return update;
      });
      affectedCount = result.count;
    } else {
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
    }
  } catch (error) {
    redirect(managementUrl(
      "error",
      error instanceof Error ? error.message : "The bulk email action could not be completed.",
      navigation,
    ));
  }

  revalidatePath("/admin/settings/email-delivery");

  if (bulkAction === "remove") {
    redirect(managementUrl(
      "success",
      affectedCount
        ? `${affectedCount} queued billing/reminder email${affectedCount === 1 ? " was" : "s were"} REMOVED from active delivery and will not be sent. The record remains visible as REMOVED audit history.`
        : "No eligible QUEUED billing/reminder emails in the selection were available for removal. History-only records were left unchanged.",
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
