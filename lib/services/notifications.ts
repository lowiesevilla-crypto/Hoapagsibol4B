import { NotificationChannel, NotificationStatus, NotificationType, SystemSettingCategory } from "@prisma/client";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { getAssociationSettings, getSystemSettingMap } from "@/lib/system-settings";

type EmailInput = {
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
  appUrl: string;
  configured: boolean;
};

export async function getMailConfiguration(): Promise<MailConfiguration> {
  const settings = await getSystemSettingMap();
  const saved = (key: string) => settings.get(`${SystemSettingCategory.EMAIL}.${key}`)?.value?.trim() || "";
  const value = (key: string, fallback = "") => saved(key) || process.env[key]?.trim() || fallback;
  const provider = value("MAIL_PROVIDER", "gmail").toLowerCase();
  const host = value("MAIL_HOST", provider === "gmail" ? "smtp.gmail.com" : "");
  const port = Number(value("MAIL_PORT", "587")) || 587;
  const rawEncryption = value("MAIL_ENCRYPTION", "tls").toLowerCase();
  const encryption = rawEncryption === "ssl" || rawEncryption === "none" ? rawEncryption : "tls";
  const username = process.env.MAIL_USERNAME?.trim() || "";
  const password = process.env.MAIL_PASSWORD?.trim() || "";
  const fromName = value("MAIL_FROM_NAME", "HOA Digital Hub");
  const fromAddress = value("MAIL_FROM_ADDRESS", username);
  const appUrl = (process.env.APP_URL?.trim() || process.env.PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
  const requiresAuthentication = provider === "gmail";
  return {
    provider, host, port, encryption, username, password, fromName, fromAddress, appUrl,
    configured: Boolean(host && fromAddress && (!requiresAuthentication || (username && password))),
  };
}

export async function sendEmailNotification(input: EmailInput) {
  const association = await getAssociationSettings();
  const config = await getMailConfiguration();
  const brandedMessage = `${input.message}\n\n--\n${association.name}${association.address ? `\n${association.address}` : ""}${association.contactNumber ? `\nContact: ${association.contactNumber}` : ""}${association.email ? `\nSupport: ${association.email}` : ""}`;
  let status: NotificationStatus = NotificationStatus.QUEUED;
  let sentAt: Date | undefined;
  let providerMessageId: string | undefined;
  let errorMessage: string | undefined;

  if (!config.configured) {
    errorMessage = "Email delivery is not configured. Add SMTP settings and environment-only credentials.";
  } else {
    try {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.encryption === "ssl" || config.port === 465,
        requireTLS: config.encryption === "tls",
        auth: config.username && config.password ? { user: config.username, pass: config.password } : undefined,
        tls: { minVersion: "TLSv1.2" },
      });
      const result = await transporter.sendMail({
        from: { name: config.fromName, address: config.fromAddress },
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
      errorMessage = safeError(error);
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

export async function verifyMailConnection() {
  const config = await getMailConfiguration();
  if (!config.configured) throw new Error("SMTP is not fully configured. Check the sender settings and environment-only credentials.");
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.encryption === "ssl" || config.port === 465,
    requireTLS: config.encryption === "tls",
    auth: config.username && config.password ? { user: config.username, pass: config.password } : undefined,
    tls: { minVersion: "TLSv1.2" },
  });
  await transporter.verify();
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
function safeError(error: unknown) { return (error instanceof Error ? error.message : "Email delivery failed.").replace(/[\r\n]+/g, " ").slice(0, 500); }
