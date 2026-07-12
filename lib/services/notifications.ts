import { NotificationChannel, NotificationStatus, NotificationType, SystemSettingCategory } from "@prisma/client";
import nodemailer from "nodemailer";
import { getAppUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
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
    username: config.username,
    senderEmail: config.fromAddress,
    configuredSenderEmail: config.configuredFromAddress,
    senderAddressAdjusted: config.senderAddressAdjusted,
    credentialSource: config.credentialSource,
    passwordPresent: Boolean(config.password),
    passwordLength: config.password.length,
  });
}

export async function sendEmailNotification(input: EmailInput) {
  const association = await getAssociationSettings(input.tenantId);
  const config = await getMailConfiguration(input.tenantId);
  const brandedMessage = `${input.message}\n\n--\n${association.name}${association.address ? `\n${association.address}` : ""}${association.contactNumber ? `\nContact: ${association.contactNumber}` : ""}${association.email ? `\nSupport: ${association.email}` : ""}`;
  let status: NotificationStatus = NotificationStatus.QUEUED;
  let sentAt: Date | undefined;
  let providerMessageId: string | undefined;
  let errorMessage: string | undefined;

  if (!config.configured) {
    errorMessage = "Email delivery is not configured. Add a valid SMTP username, password, and sender address.";
  } else {
    try {
      debugMailConfiguration("send", config);
      const transporter = nodemailer.createTransport(smtpTransportOptions(config));
      const result = await transporter.sendMail({
        from: { name: config.fromName, address: config.fromAddress },
        replyTo: config.replyTo,
        to: input.email,
        subject: input.subject.replace(/[\r\n]+/g, " ").slice(0, 200),
        text: brandedMessage,
        html: emailHtml(input, association, config.appUrl),
      });
      status = NotificationStatus.SENT;
      sentAt = new Date();
      providerMessageId = result.messageId;
    } catch (error) {
      status = NotificationStatus.FAILED;
      errorMessage = safeMailError(error);
    }
  }

  return prisma.notificationLog.create({
    data: {
      recipientId: input.recipientId,
      type: input.type,
      channel: NotificationChannel.EMAIL,
      subject: input.subject,
      message: brandedMessage,
      status,
      sentAt,
      providerMessageId,
      errorMessage,
    },
  });
}

export async function verifyMailConnection(tenantId: string) {
  const config = await getMailConfiguration(tenantId);
  if (!config.configured) throw new Error("SMTP is not fully configured. Check the mailbox username, password, and sender settings.");
  debugMailConfiguration("verify", config);
  const transporter = nodemailer.createTransport(smtpTransportOptions(config));
  try {
    await transporter.verify();
  } catch (error) {
    throw new Error(safeMailError(error));
  }
  return config;
}

export async function queueMessengerPlaceholder(input: Omit<EmailInput, "email">) {
  return prisma.notificationLog.create({
    data: {
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

function absoluteUrl(value: string, appUrl: string) {
  if (!value) return "";
  try { return new URL(value, `${appUrl}/`).toString(); } catch { return ""; }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}

function escapeAttribute(value: string) { return escapeHtml(value).replace(/`/g, "&#96;"); }
export function safeMailError(error: unknown) {
  const details = error as { code?: string; responseCode?: number; message?: string };
  const message = error instanceof Error ? error.message : details?.message || "Email delivery failed.";
  if (details?.code === "EAUTH" || details?.responseCode === 535 || /(?:535|invalid login|authentication failed)/i.test(message)) {
    return "SMTP authentication failed. Confirm the full mailbox username and password, then save Mail Settings and try again.";
  }
  if (details?.responseCode === 553 || /sender address rejected|not owned by user/i.test(message)) {
    return "SMTP sender address was rejected. Hostinger requires the sender email to match the authenticated mailbox unless the address is an authorized alias.";
  }
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}
