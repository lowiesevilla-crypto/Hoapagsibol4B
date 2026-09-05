import { NotificationChannel, NotificationStatus, NotificationType, Prisma, SystemSettingCategory } from "@prisma/client";
import nodemailer from "nodemailer";
import { getAppUrl } from "@/lib/app-url";
import { platformPrisma, prisma } from "@/lib/db";
import {
  classifyMailFailure,
  maskEmailAddress,
  validateEmailRecipient,
  type MailFailureKind,
} from "@/lib/services/email-delivery-safety";
import { decryptSettingSecret, isMaskedSecret } from "@/lib/setting-secrets";
import { BOOTSTRAP_TENANT_ID, getAssociationSettings, getSystemSettingMap } from "@/lib/system-settings";

type EmailInput = {
  tenantId: string;
  recipientId: string;
  email: string;
  subject: string;
  message: string;
  type: NotificationType;
  heading?: string;
  actionLabel?: string;
  actionUrl?: string;
  logMessage?: string;
  html?: string;
};

export type ProtectedRawEmailResult = {
  status: "SENT" | "SKIPPED" | "FAILED";
  providerMessageId?: string;
  message?: string;
  failureKind?: MailFailureKind;
  maskedRecipient: string;
};

export type EmailQueueResult = {
  enabled: boolean;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  requeued: number;
  remaining: number;
  circuitOpen: boolean;
};

export type MailConfiguration = {
  provider: string;
  host: string;
  port: number;
  encryption: "tls" | "ssl" | "none";
  username: string;
  password: string;
  fromName: string;
  fromAddress: string;
  configuredFromAddress: string;
  senderAddressAdjusted: boolean;
  replyTo: string;
  appUrl: string;
  configured: boolean;
  credentialSource: "environment" | "database" | "none";
};

const QUEUED_NOTIFICATION_TYPES = new Set<NotificationType>([
  NotificationType.BILLING_NOTIFICATION,
  NotificationType.BILL_REMINDER,
]);
const EMAIL_RECIPIENT_ENTITY = "EmailRecipient";
const EMAIL_PROVIDER_CIRCUIT_ENTITY = "EmailProviderCircuit";
const EMAIL_RECIPIENT_SUPPRESSED = "EMAIL_RECIPIENT_SUPPRESSED";
const EMAIL_RECIPIENT_RESTORED = "EMAIL_RECIPIENT_RESTORED";
const EMAIL_PROVIDER_CIRCUIT_OPENED = "EMAIL_PROVIDER_CIRCUIT_OPENED";
const EMAIL_PROVIDER_CIRCUIT_CLOSED = "EMAIL_PROVIDER_CIRCUIT_CLOSED";
const MAX_BULK_RETRY_ATTEMPTS = 3;
let smtpSendTail: Promise<void> = Promise.resolve();

export async function getMailConfiguration(tenantId: string): Promise<MailConfiguration> {
  const settings = await getSystemSettingMap(tenantId);
  const savedRaw = (key: string) => settings.get(`${SystemSettingCategory.EMAIL}.${key}`)?.value || "";
  const saved = (key: string) => savedRaw(key).trim();
  const environment = (...keys: string[]) => tenantId === BOOTSTRAP_TENANT_ID ? keys.map((key) => process.env[key]?.trim()).find(Boolean) || "" : "";
  const value = (key: string, fallback = "", ...aliases: string[]) => environment(...aliases, key) || saved(key) || fallback;
  const rawProvider = value("MAIL_PROVIDER", "smtp").toLowerCase();
  const provider = rawProvider === "gmail" ? "gmail" : "smtp";
  const host = value("MAIL_HOST", "smtp.hostinger.com", "SMTP_HOST");
  const port = Number(value("MAIL_PORT", "465", "SMTP_PORT")) || 465;
  const rawEncryption = value("MAIL_ENCRYPTION", "ssl", "SMTP_ENCRYPTION").toLowerCase();
  const encryption = port === 465 ? "ssl" : port === 587 ? "tls" : rawEncryption === "ssl" || rawEncryption === "none" ? rawEncryption : "tls";
  const environmentUsername = environment("SMTP_USERNAME", "MAIL_USERNAME");
  const environmentPassword = ["SMTP_PASSWORD", "MAIL_PASSWORD"].map((key) => process.env[key]).find((entry) => entry !== undefined && entry !== "") || "";
  const databasePassword = savedRaw("MAIL_PASSWORD");
  const username = environmentUsername || saved("MAIL_USERNAME");
  const password = environmentPassword || (!databasePassword || isMaskedSecret(databasePassword) ? "" : decryptSettingSecret(databasePassword));
  const credentialSource = environmentPassword ? "environment" : password ? "database" : "none";
  const fromName = value("MAIL_FROM_NAME", "HOAHUB");
  const configuredFromAddress = value("MAIL_FROM_ADDRESS", username || "support@hoahub.tech");
  const fromAddress = resolveSenderAddress(host, username, configuredFromAddress);
  const senderAddressAdjusted = fromAddress.toLowerCase() !== configuredFromAddress.toLowerCase();
  const replyTo = environment("MAIL_REPLY_TO") || fromAddress;
  const appUrl = getAppUrl();
  const requiresAuthentication = process.env.SMTP_ALLOW_UNAUTHENTICATED !== "true";
  return {
    provider, host, port, encryption, username, password, fromName, fromAddress, configuredFromAddress, senderAddressAdjusted, replyTo, appUrl,
    configured: Boolean(provider === "smtp" && host && fromAddress && (!requiresAuthentication || (username && password))),
    credentialSource,
  };
}

export function resolveSenderAddress(host: string, username: string, configuredFromAddress: string) {
  const isHostinger = host.trim().toLowerCase() === "smtp.hostinger.com";
  const allowDifferentSender = process.env.SMTP_ALLOW_DIFFERENT_FROM_ADDRESS === "true";
  if (isHostinger && username && !allowDifferentSender && username.toLowerCase() !== configuredFromAddress.toLowerCase()) return username;
  return configuredFromAddress;
}

export function smtpTransportOptions(config: Pick<MailConfiguration, "host" | "port" | "encryption" | "username" | "password">) {
  const secure = config.port === 465 || (config.port !== 587 && config.encryption === "ssl");
  return {
    host: config.host,
    port: config.port,
    secure,
    requireTLS: !secure && (config.port === 587 || config.encryption === "tls"),
    auth: config.username && config.password ? { user: config.username, pass: config.password } : undefined,
    tls: { minVersion: "TLSv1.2" as const },
  };
}

function debugMailConfiguration(operation: "send" | "verify", config: MailConfiguration) {
  console.info("[smtp] configuration", {
    operation,
    provider: config.provider,
    host: config.host,
    port: config.port,
    encryption: config.encryption,
    secure: smtpTransportOptions(config).secure,
    username: maskEmailAddress(config.username),
    senderEmail: maskEmailAddress(config.fromAddress),
    configuredSenderEmail: maskEmailAddress(config.configuredFromAddress),
    senderAddressAdjusted: config.senderAddressAdjusted,
    credentialSource: config.credentialSource,
    passwordPresent: Boolean(config.password),
  });
}

export async function sendEmailNotification(input: EmailInput) {
  const validation = validateEmailRecipient(input.email);
  const baseMetadata: Record<string, unknown> = {
    deliverySafetyVersion: 1,
    emailFingerprint: validation.fingerprint,
    maskedEmail: validation.maskedEmail,
    validationCode: validation.code,
    heading: input.heading || null,
    actionLabel: input.actionLabel || null,
    actionUrl: input.actionUrl || null,
    retryAttempts: 0,
  };

  if (!validation.valid) {
    return prisma.notificationLog.create({
      data: {
        tenantId: input.tenantId,
        recipientId: input.recipientId,
        type: input.type,
        channel: NotificationChannel.EMAIL,
        subject: sanitizeSubject(input.subject),
        message: input.logMessage || input.message,
        status: NotificationStatus.SKIPPED,
        errorMessage: validation.reason || "Recipient email failed the delivery safety check.",
        metadata: { ...baseMetadata, suppressed: true } as Prisma.InputJsonValue,
      },
    });
  }

  if (await isRecipientSuppressed(input.tenantId, validation.fingerprint)) {
    return prisma.notificationLog.create({
      data: {
        tenantId: input.tenantId,
        recipientId: input.recipientId,
        type: input.type,
        channel: NotificationChannel.EMAIL,
        subject: sanitizeSubject(input.subject),
        message: input.logMessage || input.message,
        status: NotificationStatus.SKIPPED,
        errorMessage: "Recipient is suppressed because a previous delivery was permanently rejected.",
        metadata: { ...baseMetadata, suppressed: true, validationCode: "SUPPRESSED" } as Prisma.InputJsonValue,
      },
    });
  }

  const queued = await prisma.notificationLog.create({
    data: {
      tenantId: input.tenantId,
      recipientId: input.recipientId,
      type: input.type,
      channel: NotificationChannel.EMAIL,
      subject: sanitizeSubject(input.subject),
      message: input.logMessage || input.message,
      status: NotificationStatus.QUEUED,
      metadata: baseMetadata as Prisma.InputJsonValue,
    },
  });

  // High-volume billing/reminder mail never calls SMTP in the transaction that
  // persists the financial event. A separate, serialized worker drains it.
  if (QUEUED_NOTIFICATION_TYPES.has(input.type)) return queued;

  const association = await getAssociationSettings(input.tenantId);
  const brandedMessage = brandedEmailMessage(input.message, association);
  const delivery = await sendProtectedRawEmail({
    tenantId: input.tenantId,
    email: validation.normalizedEmail,
    subject: input.subject,
    text: brandedMessage,
    html: input.html ?? emailHtml(input, association, (await getMailConfiguration(input.tenantId)).appUrl),
  });
  return updateNotificationDelivery(input.tenantId, queued.id, delivery, baseMetadata);
}

export async function sendProtectedRawEmail(input: {
  tenantId: string;
  email: string;
  subject: string;
  text: string;
  html: string;
}): Promise<ProtectedRawEmailResult> {
  const validation = validateEmailRecipient(input.email);
  if (!validation.valid) {
    return { status: "SKIPPED", maskedRecipient: validation.maskedEmail, message: validation.reason || "Recipient email failed validation." };
  }
  if (await isRecipientSuppressed(input.tenantId, validation.fingerprint)) {
    return { status: "SKIPPED", maskedRecipient: validation.maskedEmail, message: "Recipient is suppressed because a previous delivery was permanently rejected." };
  }
  if (await isProviderCircuitOpen(input.tenantId)) {
    return { status: "SKIPPED", maskedRecipient: validation.maskedEmail, failureKind: "PROVIDER_CIRCUIT", message: "Email provider circuit is temporarily open; SMTP was not contacted." };
  }

  const config = await getMailConfiguration(input.tenantId);
  if (!config.configured) {
    const message = "Email delivery is not configured. Add a valid SMTP username, password, and sender address.";
    await openProviderCircuit(input.tenantId, { kind: "PROVIDER_CIRCUIT", code: "SMTP_NOT_CONFIGURED", message, retryAfterMs: 6 * 60 * 60 * 1000 });
    return { status: "FAILED", maskedRecipient: validation.maskedEmail, failureKind: "PROVIDER_CIRCUIT", message };
  }

  return runSerializedSmtp(async () => {
    // Recheck the persistent circuit after waiting for another local send.
    if (await isProviderCircuitOpen(input.tenantId)) {
      return { status: "SKIPPED", maskedRecipient: validation.maskedEmail, failureKind: "PROVIDER_CIRCUIT", message: "Email provider circuit is temporarily open; SMTP was not contacted." };
    }
    try {
      debugMailConfiguration("send", config);
      const transporter = nodemailer.createTransport(smtpTransportOptions(config));
      const result = await transporter.sendMail({
        from: { name: config.fromName, address: config.fromAddress },
        replyTo: config.replyTo,
        to: validation.normalizedEmail,
        subject: sanitizeSubject(input.subject),
        text: input.text,
        html: input.html,
      });
      return { status: "SENT", maskedRecipient: validation.maskedEmail, providerMessageId: result.messageId };
    } catch (error) {
      const failure = classifyMailFailure(error);
      if (failure.kind === "PERMANENT_RECIPIENT") await suppressRecipient(input.tenantId, validation, failure);
      if (failure.kind === "PROVIDER_CIRCUIT") await openProviderCircuit(input.tenantId, failure);
      return { status: "FAILED", maskedRecipient: validation.maskedEmail, failureKind: failure.kind, message: safeMailError(error) };
    }
  });
}

export async function processQueuedEmailNotifications(tenantId: string, options?: { limit?: number }): Promise<EmailQueueResult> {
  const enabled = process.env.EMAIL_BULK_DELIVERY_ENABLED === "true";
  if (!enabled) {
    const remaining = await prisma.notificationLog.count({ where: { tenantId, channel: NotificationChannel.EMAIL, status: NotificationStatus.QUEUED, type: { in: [...QUEUED_NOTIFICATION_TYPES] } } });
    return { enabled: false, processed: 0, sent: 0, failed: 0, skipped: 0, requeued: 0, remaining, circuitOpen: await isProviderCircuitOpen(tenantId) };
  }

  const requested = options?.limit ?? Number(process.env.EMAIL_DELIVERY_BATCH_SIZE || 25);
  const limit = Math.min(100, Math.max(1, Number.isFinite(requested) ? Math.trunc(requested) : 25));
  const pacingMs = boundedInteger(process.env.EMAIL_DELIVERY_MIN_INTERVAL_MS, 500, 0, 5000);
  const logs = await prisma.notificationLog.findMany({
    where: { tenantId, channel: NotificationChannel.EMAIL, status: NotificationStatus.QUEUED, type: { in: [...QUEUED_NOTIFICATION_TYPES] } },
    include: { recipient: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let requeued = 0;
  let circuitOpen = await isProviderCircuitOpen(tenantId);
  if (!circuitOpen) {
    for (const log of logs) {
      const metadata = metadataRecord(log.metadata);
      const retryAt = typeof metadata.nextAttemptAt === "string" ? new Date(metadata.nextAttemptAt) : null;
      if (retryAt && Number.isFinite(retryAt.getTime()) && retryAt > new Date()) continue;
      if (!log.recipient.active || log.recipient.tenantId !== tenantId) {
        await updateLogStatus(tenantId, log.id, NotificationStatus.SKIPPED, "Recipient account is inactive or outside the tenant delivery scope.", metadata);
        processed++; skipped++;
        continue;
      }

      const validation = validateEmailRecipient(log.recipient.email);
      if (!validation.valid || await isRecipientSuppressed(tenantId, validation.fingerprint)) {
        await updateLogStatus(tenantId, log.id, NotificationStatus.SKIPPED, validation.reason || "Recipient is suppressed.", {
          ...metadata,
          maskedEmail: validation.maskedEmail,
          emailFingerprint: validation.fingerprint,
          validationCode: validation.valid ? "SUPPRESSED" : validation.code,
          suppressed: true,
        });
        processed++; skipped++;
        continue;
      }

      const association = await getAssociationSettings(tenantId);
      const config = await getMailConfiguration(tenantId);
      const message = log.message;
      const delivery = await sendProtectedRawEmail({
        tenantId,
        email: validation.normalizedEmail,
        subject: log.subject,
        text: brandedEmailMessage(message, association),
        html: emailHtml({
          subject: log.subject,
          message,
          heading: stringMetadata(metadata, "heading"),
          actionLabel: stringMetadata(metadata, "actionLabel"),
          actionUrl: stringMetadata(metadata, "actionUrl"),
        }, association, config.appUrl),
      });
      processed++;

      if (delivery.status === "SENT") {
        await updateNotificationDelivery(tenantId, log.id, delivery, metadata);
        sent++;
      } else if (delivery.status === "SKIPPED") {
        if (delivery.failureKind === "PROVIDER_CIRCUIT") {
          circuitOpen = true;
          processed--;
          break;
        }
        await updateNotificationDelivery(tenantId, log.id, delivery, metadata);
        skipped++;
      } else if (delivery.failureKind === "TEMPORARY") {
        const attempts = Number(metadata.retryAttempts || 0) + 1;
        if (attempts < MAX_BULK_RETRY_ATTEMPTS) {
          const nextAttemptAt = new Date(Date.now() + retryDelayMs(attempts));
          await prisma.notificationLog.updateMany({
            where: { tenantId, id: log.id, status: NotificationStatus.QUEUED },
            data: {
              errorMessage: delivery.message?.slice(0, 500),
              metadata: { ...metadata, retryAttempts: attempts, nextAttemptAt: nextAttemptAt.toISOString(), lastFailureKind: delivery.failureKind } as Prisma.InputJsonValue,
            },
          });
          requeued++;
        } else {
          await updateNotificationDelivery(tenantId, log.id, delivery, { ...metadata, retryAttempts: attempts, retryExhausted: true });
          failed++;
        }
      } else {
        await updateNotificationDelivery(tenantId, log.id, delivery, metadata);
        failed++;
        if (delivery.failureKind === "PROVIDER_CIRCUIT") {
          circuitOpen = true;
          break;
        }
      }
      if (pacingMs > 0) await delay(pacingMs);
    }
  }

  const remaining = await prisma.notificationLog.count({ where: { tenantId, channel: NotificationChannel.EMAIL, status: NotificationStatus.QUEUED, type: { in: [...QUEUED_NOTIFICATION_TYPES] } } });
  return { enabled: true, processed, sent, failed, skipped, requeued, remaining, circuitOpen: circuitOpen || await isProviderCircuitOpen(tenantId) };
}

export async function verifyMailConnection(tenantId: string) {
  const config = await getMailConfiguration(tenantId);
  if (!config.configured) throw new Error("SMTP is not fully configured. Check the mailbox username, password, and sender settings.");
  debugMailConfiguration("verify", config);
  const transporter = nodemailer.createTransport(smtpTransportOptions(config));
  try {
    await transporter.verify();
    await closeProviderCircuit(tenantId, "SMTP connection verified successfully.");
  } catch (error) {
    const failure = classifyMailFailure(error);
    if (failure.kind === "PROVIDER_CIRCUIT") await openProviderCircuit(tenantId, failure);
    throw new Error(safeMailError(error));
  }
  return config;
}

export async function queueMessengerPlaceholder(input: Omit<EmailInput, "email">) {
  return prisma.notificationLog.create({
    data: {
      tenantId: input.tenantId,
      recipientId: input.recipientId,
      type: input.type,
      channel: NotificationChannel.MESSENGER,
      subject: input.subject,
      message: input.message,
      status: NotificationStatus.SKIPPED,
    },
  });
}

export function emailHtml(input: Pick<EmailInput, "subject" | "message" | "heading" | "actionLabel" | "actionUrl">, association: Awaited<ReturnType<typeof getAssociationSettings>>, appUrl: string) {
  const paragraphs = input.message.split("\n").filter(Boolean).map((line) => `<p style="margin:0 0 14px;line-height:1.65">${escapeHtml(line)}</p>`).join("");
  const detail = [association.address, association.contactNumber ? `Contact: ${association.contactNumber}` : "", association.email ? `Support: ${association.email}` : ""].filter(Boolean).join(" | ");
  const logoUrl = absoluteUrl(association.logoUrl, appUrl);
  const action = input.actionUrl && input.actionLabel ? `<p style="margin:24px 0"><a href="${escapeAttribute(input.actionUrl)}" style="display:inline-block;background:#078bc9;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px">${escapeHtml(input.actionLabel)}</a></p>` : "";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#eef8fc;font-family:Arial,sans-serif;color:#10354c"><div style="padding:24px 12px"><div style="max-width:680px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #d7eaf2"><div style="background:#0a3b57;color:#fff;padding:22px 24px"><table role="presentation" style="border-collapse:collapse"><tr>${logoUrl ? `<td style="padding-right:14px"><img src="${escapeAttribute(logoUrl)}" width="58" height="58" alt="" style="display:block;border-radius:50%;background:#fff;object-fit:contain"></td>` : ""}<td><h1 style="margin:0;font-size:20px">${escapeHtml(association.name)}</h1><p style="margin:6px 0 0;color:#dff8d2;font-weight:bold">HOA Digital Hub</p></td></tr></table></div><div style="padding:26px 24px"><p style="margin:0 0 8px;color:#078bc9;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em">${escapeHtml(input.heading || "HOA notification")}</p><h2 style="margin:0 0 18px;font-size:22px">${escapeHtml(input.subject)}</h2>${paragraphs}${action}<p style="margin:24px 0 0;color:#60747e;font-size:12px;line-height:1.5">If you did not expect this message, contact the HOA office. Do not share secure links or verification codes.</p></div><div style="padding:16px 24px;background:#f5fafc;color:#60747e;font-size:12px;line-height:1.5">${escapeHtml(detail || association.name)}</div></div></div></body></html>`;
}

function brandedEmailMessage(message: string, association: Awaited<ReturnType<typeof getAssociationSettings>>) {
  return `${message}\n\n--\n${association.name}${association.address ? `\n${association.address}` : ""}${association.contactNumber ? `\nContact: ${association.contactNumber}` : ""}${association.email ? `\nSupport: ${association.email}` : ""}`;
}

async function updateNotificationDelivery(tenantId: string, id: string, delivery: ProtectedRawEmailResult, metadata: Record<string, unknown>) {
  const status = delivery.status === "SENT" ? NotificationStatus.SENT : delivery.status === "SKIPPED" ? NotificationStatus.SKIPPED : NotificationStatus.FAILED;
  await prisma.notificationLog.updateMany({
    where: { tenantId, id },
    data: {
      status,
      sentAt: delivery.status === "SENT" ? new Date() : null,
      providerMessageId: delivery.providerMessageId || null,
      errorMessage: delivery.message?.slice(0, 500) || null,
      metadata: { ...metadata, lastFailureKind: delivery.failureKind || null, deliveredAt: delivery.status === "SENT" ? new Date().toISOString() : null } as Prisma.InputJsonValue,
    },
  });
  const updated = await prisma.notificationLog.findFirst({ where: { tenantId, id } });
  if (!updated) throw new Error("Notification log is outside the active tenant scope.");
  return updated;
}

async function updateLogStatus(tenantId: string, id: string, status: NotificationStatus, errorMessage: string, metadata: Record<string, unknown>) {
  await prisma.notificationLog.updateMany({
    where: { tenantId, id },
    data: { status, errorMessage: errorMessage.slice(0, 500), metadata: metadata as Prisma.InputJsonValue },
  });
}

async function isRecipientSuppressed(tenantId: string, fingerprint: string) {
  if (!fingerprint) return true;
  const latest = await platformPrisma.auditLog.findFirst({
    where: {
      tenantId,
      module: "EMAIL",
      entityType: EMAIL_RECIPIENT_ENTITY,
      entityId: fingerprint,
      action: { in: [EMAIL_RECIPIENT_SUPPRESSED, EMAIL_RECIPIENT_RESTORED] },
    },
    select: { action: true },
    orderBy: { createdAt: "desc" },
  });
  return latest?.action === EMAIL_RECIPIENT_SUPPRESSED;
}

async function suppressRecipient(tenantId: string, validation: ReturnType<typeof validateEmailRecipient>, failure: ReturnType<typeof classifyMailFailure>) {
  if (await isRecipientSuppressed(tenantId, validation.fingerprint)) return;
  await platformPrisma.auditLog.create({
    data: {
      tenantId,
      module: "EMAIL",
      action: EMAIL_RECIPIENT_SUPPRESSED,
      entityType: EMAIL_RECIPIENT_ENTITY,
      entityId: validation.fingerprint,
      metadata: {
        maskedEmail: validation.maskedEmail,
        failureKind: failure.kind,
        failureCode: failure.code,
        responseCode: failure.responseCode || null,
        reason: failure.message.slice(0, 300),
      },
    },
  });
}

async function isProviderCircuitOpen(tenantId: string) {
  const latest = await platformPrisma.auditLog.findFirst({
    where: {
      tenantId,
      module: "EMAIL",
      entityType: EMAIL_PROVIDER_CIRCUIT_ENTITY,
      entityId: tenantId,
      action: { in: [EMAIL_PROVIDER_CIRCUIT_OPENED, EMAIL_PROVIDER_CIRCUIT_CLOSED] },
    },
    select: { action: true, metadata: true },
    orderBy: { createdAt: "desc" },
  });
  if (!latest || latest.action === EMAIL_PROVIDER_CIRCUIT_CLOSED) return false;
  const metadata = metadataRecord(latest.metadata);
  const retryAfter = typeof metadata.retryAfter === "string" ? new Date(metadata.retryAfter) : null;
  return !retryAfter || !Number.isFinite(retryAfter.getTime()) || retryAfter > new Date();
}

async function openProviderCircuit(tenantId: string, failure: Pick<ReturnType<typeof classifyMailFailure>, "code" | "message" | "responseCode" | "retryAfterMs"> & { kind: string }) {
  const retryAfterMs = Math.min(24 * 60 * 60 * 1000, Math.max(15 * 60 * 1000, failure.retryAfterMs || 60 * 60 * 1000));
  await platformPrisma.auditLog.create({
    data: {
      tenantId,
      module: "EMAIL",
      action: EMAIL_PROVIDER_CIRCUIT_OPENED,
      entityType: EMAIL_PROVIDER_CIRCUIT_ENTITY,
      entityId: tenantId,
      metadata: {
        failureKind: failure.kind,
        failureCode: failure.code,
        responseCode: failure.responseCode || null,
        reason: failure.message.slice(0, 300),
        retryAfter: new Date(Date.now() + retryAfterMs).toISOString(),
      },
    },
  });
}

async function closeProviderCircuit(tenantId: string, reason: string) {
  const latest = await platformPrisma.auditLog.findFirst({
    where: { tenantId, module: "EMAIL", entityType: EMAIL_PROVIDER_CIRCUIT_ENTITY, entityId: tenantId, action: EMAIL_PROVIDER_CIRCUIT_OPENED },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return;
  await platformPrisma.auditLog.create({
    data: {
      tenantId,
      module: "EMAIL",
      action: EMAIL_PROVIDER_CIRCUIT_CLOSED,
      entityType: EMAIL_PROVIDER_CIRCUIT_ENTITY,
      entityId: tenantId,
      metadata: { reason: reason.slice(0, 300) },
    },
  });
}

async function runSerializedSmtp<T>(operation: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const currentTurn = new Promise<void>((resolve) => { release = resolve; });
  const previous = smtpSendTail;
  smtpSendTail = previous.then(() => currentTurn, () => currentTurn);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
}

function metadataRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringMetadata(metadata: Record<string, unknown>, key: string) {
  return typeof metadata[key] === "string" && metadata[key] ? String(metadata[key]) : undefined;
}

function retryDelayMs(attempts: number) {
  return Math.min(60 * 60 * 1000, 5 * 60 * 1000 * 2 ** Math.max(0, attempts - 1));
}

function boundedInteger(raw: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

function delay(ms: number) { return new Promise<void>((resolve) => setTimeout(resolve, ms)); }
function sanitizeSubject(value: string) { return value.replace(/[\r\n]+/g, " ").slice(0, 200); }
function absoluteUrl(value: string, appUrl: string) {
  if (!value) return "";
  try { return new URL(value, `${appUrl}/`).toString(); } catch { return ""; }
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}
function escapeAttribute(value: string) { return escapeHtml(value).replace(/`/g, "&#96;"); }

export function safeMailError(error: unknown) {
  const failure = classifyMailFailure(error);
  if (failure.kind === "PROVIDER_CIRCUIT") {
    if (failure.code === "EAUTH" || failure.responseCode === 535 || failure.responseCode === 530) {
      return "SMTP authentication failed. Confirm the full mailbox username and password, then save Mail Settings and verify the connection.";
    }
    if (/sender address rejected|not owned by user/i.test(failure.message)) {
      return "SMTP sender address was rejected. The authenticated mailbox must be allowed to use the configured sender address.";
    }
    return "SMTP provider temporarily blocked outbound delivery. HOAHub opened the email safety circuit and stopped additional SMTP attempts.";
  }
  if (failure.kind === "PERMANENT_RECIPIENT") return "Recipient mailbox was permanently rejected. HOAHub suppressed this address from future automatic delivery until the address is corrected.";
  if (failure.kind === "TEMPORARY") return "Email delivery was temporarily unavailable. Bulk delivery will retry with bounded backoff; security-sensitive messages are not retried automatically.";
  return failure.message.replace(/[\r\n]+/g, " ").slice(0, 500);
}
