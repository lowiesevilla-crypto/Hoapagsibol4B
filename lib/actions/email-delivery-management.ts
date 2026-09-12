"use server";

import { NotificationChannel, NotificationStatus, NotificationType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";

const RETRYABLE_EMAIL_TYPES = [
  NotificationType.BILLING_NOTIFICATION,
  NotificationType.BILL_REMINDER,
] as const;

function metadataObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, Prisma.JsonValue>;
}

function managementUrl(kind: "success" | "error", message: string) {
  return `/admin/settings/email-delivery?${kind}=${encodeURIComponent(message)}`;
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
    redirect(managementUrl("success", "This email is already queued for protected delivery."));
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

  await prisma.$transaction(async (tx) => {
    const update = await tx.notificationLog.updateMany({
      where: {
        id: notification.id,
        tenantId: admin.tenantId,
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.FAILED,
        type: { in: [...RETRYABLE_EMAIL_TYPES] },
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
  }).catch((error) => {
    redirect(managementUrl("error", error instanceof Error ? error.message : "Email retry could not be queued."));
  });

  revalidatePath("/admin/settings/email-delivery");
  redirect(managementUrl("success", "Failed email was placed back into the protected delivery queue."));
}
