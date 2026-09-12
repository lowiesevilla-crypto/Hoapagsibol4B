import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma,
} from "@prisma/client";

export const EMAIL_DELIVERY_PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_EMAIL_DELIVERY_PAGE_SIZE = 25;

export const PROTECTED_QUEUE_NOTIFICATION_TYPES = [
  NotificationType.BILLING_NOTIFICATION,
  NotificationType.BILL_REMINDER,
] as const;

export type EmailDeliveryFilters = {
  q: string;
  status: NotificationStatus | null;
  type: NotificationType | null;
};

export function parseNotificationStatus(value?: string | null) {
  return Object.values(NotificationStatus).includes(value as NotificationStatus)
    ? value as NotificationStatus
    : null;
}

export function parseNotificationType(value?: string | null) {
  return Object.values(NotificationType).includes(value as NotificationType)
    ? value as NotificationType
    : null;
}

export function parseEmailDeliveryPageSize(value?: string | null) {
  const parsed = Number(value || DEFAULT_EMAIL_DELIVERY_PAGE_SIZE);
  return EMAIL_DELIVERY_PAGE_SIZES.includes(parsed as (typeof EMAIL_DELIVERY_PAGE_SIZES)[number])
    ? parsed
    : DEFAULT_EMAIL_DELIVERY_PAGE_SIZE;
}

export function parseEmailDeliveryFilters(input: { q?: string | null; status?: string | null; type?: string | null }): EmailDeliveryFilters {
  return {
    q: String(input.q || "").trim().slice(0, 120),
    status: parseNotificationStatus(input.status),
    type: parseNotificationType(input.type),
  };
}

export function emailDeliveryWhere(tenantId: string, filters: EmailDeliveryFilters): Prisma.NotificationLogWhereInput {
  const searchFilter: Prisma.NotificationLogWhereInput = filters.q
    ? {
        OR: [
          { subject: { contains: filters.q } },
          { recipient: { is: { name: { contains: filters.q } } } },
          { recipient: { is: { email: { contains: filters.q } } } },
        ],
      }
    : {};

  return {
    tenantId,
    channel: NotificationChannel.EMAIL,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...searchFilter,
  };
}

export function isProtectedQueueType(type: NotificationType) {
  return PROTECTED_QUEUE_NOTIFICATION_TYPES.includes(type as (typeof PROTECTED_QUEUE_NOTIFICATION_TYPES)[number]);
}
