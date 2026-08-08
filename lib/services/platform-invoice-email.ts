import "server-only";

import nodemailer from "nodemailer";
import { platformPrisma as prisma } from "@/lib/db";
import { getMailConfiguration, safeMailError, smtpTransportOptions } from "@/lib/services/notifications";
import { platformInvoicePaymentUrl } from "@/lib/services/platform-paymongo";
import { BOOTSTRAP_TENANT_ID } from "@/lib/system-settings";

export type PlatformInvoiceEmailResult = {
  status: "SENT" | "SKIPPED" | "FAILED";
  recipients: string[];
  message?: string;
  providerMessageId?: string;
};

function money(value: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function uniqueEmails(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const email = value?.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    result.push(email);
  }
  return result;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] || char);
}

async function auditDelivery(input: {
  tenantId: string;
  actorId?: string;
  invoiceId: string;
  invoiceNumber: string;
  status: PlatformInvoiceEmailResult["status"];
  recipients: string[];
  message?: string;
  providerMessageId?: string;
}) {
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorId || null,
      module: "PLATFORM_BILLING",
      action: `PLATFORM_INVOICE_EMAIL_${input.status}`,
      entityType: "PlatformInvoice",
      entityId: input.invoiceId,
      metadata: {
        invoiceNumber: input.invoiceNumber,
        recipients: input.recipients,
        providerMessageId: input.providerMessageId || null,
        message: input.message || null,
      },
    },
  });
}

export async function sendPlatformInvoiceEmail(input: { invoiceId: string; actorId?: string }): Promise<PlatformInvoiceEmailResult> {
  const invoice = await prisma.platformInvoice.findUnique({
    where: { id: input.invoiceId },
    include: {
      tenant: { include: { billingProfile: true } },
      subscription: { include: { plan: true } },
    },
  });
  if (!invoice) throw new Error("Platform invoice not found.");

  const recipients = uniqueEmails([
    invoice.tenant.billingProfile?.billingEmail,
    invoice.tenant.billingProfile?.secondaryBillingEmail,
    invoice.tenant.email,
  ]);
  if (!recipients.length) {
    const result: PlatformInvoiceEmailResult = {
      status: "SKIPPED",
      recipients,
      message: "No tenant billing email is configured.",
    };
    await auditDelivery({
      tenantId: invoice.tenantId,
      actorId: input.actorId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      ...result,
    });
    return result;
  }

  const config = await getMailConfiguration(BOOTSTRAP_TENANT_ID);
  if (!config.configured) {
    const result: PlatformInvoiceEmailResult = {
      status: "FAILED",
      recipients,
      message: "HOAHub platform SMTP is not configured.",
    };
    await auditDelivery({
      tenantId: invoice.tenantId,
      actorId: input.actorId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      ...result,
    });
    return result;
  }

  const payUrl = platformInvoicePaymentUrl(invoice.id);
  const businessName = invoice.tenant.billingProfile?.legalBusinessName || invoice.tenant.name;
  const total = money(Number(invoice.total), invoice.currency);
  const outstanding = money(Number(invoice.outstandingBalance), invoice.currency);
  const issueDate = invoice.issueDate.toLocaleDateString("en-PH");
  const dueDate = invoice.dueDate.toLocaleDateString("en-PH");
  const coverage = `${invoice.billingPeriodStart.toLocaleDateString("en-PH")} – ${invoice.billingPeriodEnd.toLocaleDateString("en-PH")}`;
  const subject = `HOAHub subscription invoice ${invoice.invoiceNumber} · ${outstanding} due`;
  const text = [
    `Hello ${businessName},`,
    "",
    `Your HOAHub subscription invoice ${invoice.invoiceNumber} is ready.`,
    `Plan: ${invoice.subscription.plan.name}`,
    `Billing period: ${coverage}`,
    `Invoice date: ${issueDate}`,
    `Due date: ${dueDate}`,
    `Invoice total: ${total}`,
    `Outstanding balance: ${outstanding}`,
    "",
    "View and pay your invoice securely:",
    payUrl,
    "",
    "HOAHub marks online payments paid only after a verified payment-provider confirmation.",
    "",
    "HOAHub Billing",
  ].join("\n");
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#eef8fc;font-family:Arial,sans-serif;color:#10354c"><div style="padding:24px 12px"><div style="max-width:680px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #d7eaf2"><div style="background:#0a3b57;color:#fff;padding:24px"><p style="margin:0 0 7px;color:#dff8d2;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">HOAHub secure billing</p><h1 style="margin:0;font-size:24px">Subscription invoice</h1><p style="margin:8px 0 0;color:#d9f1ff">${escapeHtml(invoice.invoiceNumber)}</p></div><div style="padding:26px 24px"><p style="margin:0 0 18px;line-height:1.6">Hello <strong>${escapeHtml(businessName)}</strong>, your HOAHub subscription invoice is ready.</p><table role="presentation" style="width:100%;border-collapse:collapse;background:#f5fafc;border-radius:12px"><tr><td style="padding:12px 14px;color:#60747e">Plan</td><td style="padding:12px 14px;text-align:right;font-weight:700">${escapeHtml(invoice.subscription.plan.name)}</td></tr><tr><td style="padding:12px 14px;color:#60747e">Billing period</td><td style="padding:12px 14px;text-align:right;font-weight:700">${escapeHtml(coverage)}</td></tr><tr><td style="padding:12px 14px;color:#60747e">Invoice date</td><td style="padding:12px 14px;text-align:right;font-weight:700">${escapeHtml(issueDate)}</td></tr><tr><td style="padding:12px 14px;color:#60747e">Due date</td><td style="padding:12px 14px;text-align:right;font-weight:700">${escapeHtml(dueDate)}</td></tr><tr><td style="padding:12px 14px;color:#60747e">Invoice total</td><td style="padding:12px 14px;text-align:right;font-weight:700">${escapeHtml(total)}</td></tr><tr><td style="padding:12px 14px;color:#60747e">Outstanding</td><td style="padding:12px 14px;text-align:right;font-size:18px;font-weight:800;color:#0a3b57">${escapeHtml(outstanding)}</td></tr></table><p style="margin:24px 0"><a href="${escapeHtml(payUrl)}" style="display:inline-block;background:#078bc9;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">View &amp; Pay Invoice</a></p><p style="margin:0;color:#60747e;font-size:12px;line-height:1.6">This secure link is specific to this HOAHub platform invoice. HOAHub records online payment only after verified payment-provider confirmation. Do not forward the link unless the recipient is authorized to pay this tenant subscription.</p></div><div style="padding:16px 24px;background:#f5fafc;color:#60747e;font-size:12px">HOAHub Billing · support@hoahub.tech</div></div></div></body></html>`;

  try {
    const transporter = nodemailer.createTransport(smtpTransportOptions(config));
    const sent = await transporter.sendMail({
      from: { name: config.fromName || "HOAHub", address: config.fromAddress },
      replyTo: config.replyTo,
      to: recipients.join(", "),
      subject,
      text,
      html,
    });
    const result: PlatformInvoiceEmailResult = {
      status: "SENT",
      recipients,
      providerMessageId: sent.messageId,
    };
    await auditDelivery({
      tenantId: invoice.tenantId,
      actorId: input.actorId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      ...result,
    });
    return result;
  } catch (error) {
    const result: PlatformInvoiceEmailResult = {
      status: "FAILED",
      recipients,
      message: safeMailError(error),
    };
    await auditDelivery({
      tenantId: invoice.tenantId,
      actorId: input.actorId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      ...result,
    });
    return result;
  }
}
