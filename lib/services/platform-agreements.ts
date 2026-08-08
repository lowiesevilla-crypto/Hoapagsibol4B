import "server-only";

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import {
  AgreementAuditEventType,
  AgreementTemplateVersionStatus,
  BillingFrequency,
  Role,
  TenantAgreementStatus,
  TenantSubscriptionStatus,
} from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";
import { platformPrisma as prisma } from "@/lib/db";
import {
  HOA_HUB_AGREEMENT_BODY,
  HOA_HUB_AGREEMENT_TEMPLATE_CODE,
  HOA_HUB_AGREEMENT_TITLE,
  HOA_HUB_AGREEMENT_VERSION,
  HOA_HUB_AGREEMENT_VERSION_LABEL,
} from "@/lib/legal/platform-subscription-agreement-v1";
import { platformBillingIssuer } from "@/lib/services/platform-invoice-document";
import { getMailConfiguration, safeMailError, smtpTransportOptions } from "@/lib/services/notifications";
import { BOOTSTRAP_TENANT_ID } from "@/lib/system-settings";

const OTP_TTL_MINUTES = 10;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function authSecret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (process.env.NODE_ENV === "production" && (!value || value.length < 32)) {
    throw new Error("AUTH_SECRET must contain at least 32 characters in production.");
  }
  return value || "development-only-secret-change-me-now";
}

function otpHash(agreementId: string, userId: string, code: string) {
  return createHmac("sha256", authSecret()).update(`agreement-otp-v1:${agreementId}:${userId}:${code}`).digest("hex");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function clean(value: string | null | undefined) {
  return String(value || "").trim();
}

function initialTermMonths() {
  const parsed = Number(process.env.PLATFORM_AGREEMENT_INITIAL_TERM_MONTHS);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 60 ? parsed : 12;
}

function addMonths(value: Date, months: number) {
  const result = new Date(value);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function dateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "Not specified";
  return value.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "2-digit", timeZone: "UTC" });
}

function money(value: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function agreementNumber(now = new Date()) {
  return `AGR-${now.getUTCFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function activeSubscriptionStatuses() {
  return [
    TenantSubscriptionStatus.TRIAL,
    TenantSubscriptionStatus.ACTIVE,
    TenantSubscriptionStatus.PAST_DUE,
    TenantSubscriptionStatus.GRACE,
    TenantSubscriptionStatus.RESTRICTED,
  ];
}

function replaceTokens(body: string, values: Record<string, string>) {
  return body.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key: string) => values[key] ?? "Not specified");
}

function billingCyclePrice(subscription: {
  agreedPrice: unknown;
  billingFrequency: BillingFrequency;
  plan: { monthlyPrice: unknown; annualPrice: unknown };
}) {
  if (subscription.agreedPrice != null) return Number(subscription.agreedPrice);
  if (subscription.billingFrequency === BillingFrequency.ANNUAL) return Number(subscription.plan.annualPrice || 0);
  return Number(subscription.plan.monthlyPrice || 0);
}

export type AgreementRequestMetadata = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function ensureDefaultAgreementTemplate(actorId?: string | null) {
  const template = await prisma.platformAgreementTemplate.upsert({
    where: { code: HOA_HUB_AGREEMENT_TEMPLATE_CODE },
    update: {
      name: HOA_HUB_AGREEMENT_TITLE,
      description: "Master Philippine HOAHub software subscription agreement. A version must be legally approved and activated before electronic execution.",
      active: true,
    },
    create: {
      code: HOA_HUB_AGREEMENT_TEMPLATE_CODE,
      name: HOA_HUB_AGREEMENT_TITLE,
      description: "Master Philippine HOAHub software subscription agreement. A version must be legally approved and activated before electronic execution.",
      active: true,
    },
  });

  const existing = await prisma.platformAgreementTemplateVersion.findUnique({
    where: { templateId_versionNumber: { templateId: template.id, versionNumber: HOA_HUB_AGREEMENT_VERSION } },
  });
  if (existing) return { template, version: existing };

  const version = await prisma.platformAgreementTemplateVersion.create({
    data: {
      templateId: template.id,
      versionNumber: HOA_HUB_AGREEMENT_VERSION,
      versionLabel: HOA_HUB_AGREEMENT_VERSION_LABEL,
      status: AgreementTemplateVersionStatus.PENDING_LEGAL_APPROVAL,
      title: HOA_HUB_AGREEMENT_TITLE,
      body: HOA_HUB_AGREEMENT_BODY,
      contentHash: sha256(HOA_HUB_AGREEMENT_BODY),
      createdById: actorId || null,
      legalReviewNotes: "Initial HOAHub legal draft. Electronic signing is disabled until a Platform Administrator records legal review and activates this exact template version.",
    },
  });
  return { template, version };
}

export async function listPlatformAgreementDashboard() {
  await ensureDefaultAgreementTemplate();
  const [templates, agreements, subscriptionRows] = await Promise.all([
    prisma.platformAgreementTemplate.findMany({
      where: { active: true },
      include: { versions: { orderBy: { versionNumber: "desc" } } },
      orderBy: { name: "asc" },
    }),
    prisma.tenantSubscriptionAgreement.findMany({
      include: { templateVersion: true },
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
    prisma.tenantSubscription.findMany({
      where: { status: { in: activeSubscriptionStatuses() } },
      include: { tenant: { include: { billingProfile: true } }, plan: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
  ]);
  const seen = new Set<string>();
  const subscriptions = subscriptionRows.filter((subscription) => {
    if (seen.has(subscription.tenantId)) return false;
    seen.add(subscription.tenantId);
    return true;
  });
  return { templates, agreements, subscriptions };
}

export async function activateAgreementTemplateVersion(input: {
  versionId: string;
  reviewerName: string;
  reviewNotes?: string;
  actorId: string;
  actorTenantId: string;
}) {
  const reviewerName = clean(input.reviewerName);
  if (reviewerName.length < 3) throw new Error("Enter the legal reviewer or approving authority name.");
  const version = await prisma.platformAgreementTemplateVersion.findUnique({ where: { id: input.versionId } });
  if (!version) throw new Error("Agreement template version not found.");
  if (![AgreementTemplateVersionStatus.PENDING_LEGAL_APPROVAL, AgreementTemplateVersionStatus.APPROVED].includes(version.status)) {
    throw new Error("Only a pending or approved template version can be activated.");
  }
  if (sha256(version.body) !== version.contentHash) throw new Error("Template integrity check failed. Create a new version instead of activating altered content.");

  const drafts = await prisma.tenantSubscriptionAgreement.findMany({
    where: { templateVersionId: version.id, status: TenantAgreementStatus.DRAFT },
    select: { id: true, tenantId: true },
  });
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.platformAgreementTemplateVersion.updateMany({
      where: { templateId: version.templateId, status: AgreementTemplateVersionStatus.ACTIVE, id: { not: version.id } },
      data: { status: AgreementTemplateVersionStatus.RETIRED },
    });
    await tx.platformAgreementTemplateVersion.update({
      where: { id: version.id },
      data: {
        status: AgreementTemplateVersionStatus.ACTIVE,
        legalReviewerName: reviewerName,
        legalReviewNotes: clean(input.reviewNotes) || version.legalReviewNotes,
        approvedById: input.actorId,
        approvedAt: now,
        effectiveAt: now,
      },
    });
    if (drafts.length) {
      await tx.tenantSubscriptionAgreement.updateMany({
        where: { templateVersionId: version.id, status: TenantAgreementStatus.DRAFT },
        data: { status: TenantAgreementStatus.READY_FOR_SIGNATURE },
      });
      await tx.agreementAuditEvent.createMany({
        data: drafts.map((draft) => ({
          agreementId: draft.id,
          tenantId: draft.tenantId,
          eventType: AgreementAuditEventType.READY_FOR_SIGNATURE,
          actorUserId: input.actorId,
          metadata: { reason: "Template version activated after legal review." },
        })),
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId: input.actorTenantId,
        actorId: input.actorId,
        module: "PLATFORM_AGREEMENTS",
        action: "AGREEMENT_TEMPLATE_ACTIVATED",
        entityType: "PlatformAgreementTemplateVersion",
        entityId: version.id,
        metadata: { versionLabel: version.versionLabel, reviewerName, contentHash: version.contentHash },
      },
    });
  });
}

export async function createTenantAgreementDraft(input: { tenantId: string; actorId?: string | null }) {
  const { version } = await ensureDefaultAgreementTemplate(input.actorId);
  const preferredVersion = await prisma.platformAgreementTemplateVersion.findFirst({
    where: { templateId: version.templateId, status: AgreementTemplateVersionStatus.ACTIVE },
    orderBy: { versionNumber: "desc" },
  }) || version;

  const subscription = await prisma.tenantSubscription.findFirst({
    where: { tenantId: input.tenantId, status: { in: activeSubscriptionStatuses() } },
    include: {
      tenant: { include: { billingProfile: true } },
      plan: { include: { modules: { where: { enabled: true }, orderBy: { module: "asc" } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!subscription) throw new Error("Assign an active tenant subscription before generating an agreement.");

  const existing = await prisma.tenantSubscriptionAgreement.findFirst({
    where: {
      tenantId: input.tenantId,
      subscriptionId: subscription.id,
      status: { notIn: [TenantAgreementStatus.TERMINATED, TenantAgreementStatus.SUPERSEDED, TenantAgreementStatus.EXPIRED] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const issuer = platformBillingIssuer();
  const billingProfile = subscription.tenant.billingProfile;
  const termMonths = initialTermMonths();
  const effectiveDate = dateOnly(subscription.startedAt);
  const termEnd = addDays(addMonths(effectiveDate, termMonths), -1);
  const price = billingCyclePrice(subscription);
  const discount = Math.max(0, Number(subscription.discount || 0));
  const netFee = Math.max(0, price - discount);
  const paymentTermsDays = Math.max(0, Math.min(billingProfile?.paymentTermsDays ?? 15, 365));
  const number = agreementNumber();
  const modules = subscription.plan.modules.map((entry) => entry.module.replaceAll("_", " "));
  const tenantSnapshot = {
    tenantId: subscription.tenant.id,
    tenantSlug: subscription.tenant.slug,
    name: subscription.tenant.name,
    legalBusinessName: billingProfile?.legalBusinessName || subscription.tenant.name,
    address: billingProfile?.billingAddress || subscription.tenant.address || "",
    email: billingProfile?.billingEmail || subscription.tenant.email || "",
    secondaryBillingEmail: billingProfile?.secondaryBillingEmail || "",
    contactPerson: billingProfile?.contactPerson || "",
    contactNumber: billingProfile?.contactNumber || subscription.tenant.contactNumber || "",
    tinNumber: billingProfile?.tinNumber || subscription.tenant.tinNumber || "",
    secRegistrationNumber: subscription.tenant.secRegistrationNumber || "",
  };
  const issuerSnapshot = {
    legalName: issuer.name,
    address: issuer.address,
    email: issuer.email,
    contactNumber: issuer.contactNumber,
    tinNumber: issuer.tinNumber,
    website: issuer.website,
  };
  const termsSnapshot = {
    subscriptionId: subscription.id,
    planId: subscription.plan.id,
    planCode: subscription.plan.code,
    planName: subscription.plan.name,
    billingFrequency: subscription.billingFrequency,
    cyclePrice: price,
    discount,
    netSubscriptionFee: netFee,
    currency: subscription.currency,
    subscriptionStart: effectiveDate.toISOString(),
    initialTermMonths: termMonths,
    termEnd: termEnd.toISOString(),
    autoRenew: subscription.autoRenew,
    paymentTermsDays,
    modules,
  };
  const renderedContent = replaceTokens(preferredVersion.body, {
    AGREEMENT_VERSION: preferredVersion.versionLabel,
    AGREEMENT_NUMBER: number,
    EFFECTIVE_DATE: formatDate(effectiveDate),
    PROVIDER_NAME: issuerSnapshot.legalName || "HOAHub",
    PROVIDER_ADDRESS: issuerSnapshot.address || "Not specified",
    PROVIDER_EMAIL: issuerSnapshot.email || "support@hoahub.tech",
    PROVIDER_TIN: issuerSnapshot.tinNumber || "Not specified",
    CUSTOMER_LEGAL_NAME: tenantSnapshot.legalBusinessName,
    CUSTOMER_ADDRESS: tenantSnapshot.address || "Not specified",
    CUSTOMER_EMAIL: tenantSnapshot.email || "Not specified",
    CUSTOMER_TIN: tenantSnapshot.tinNumber || "Not specified",
    CUSTOMER_SEC: tenantSnapshot.secRegistrationNumber || "Not specified",
    PLAN_NAME: subscription.plan.name,
    PLAN_CODE: subscription.plan.code,
    BILLING_FREQUENCY: subscription.billingFrequency,
    SUBSCRIPTION_FEE: `${money(netFee, subscription.currency)} per ${subscription.billingFrequency.toLowerCase()} billing cycle`,
    DISCOUNT: money(discount, subscription.currency),
    CURRENCY: subscription.currency,
    SUBSCRIPTION_START: formatDate(effectiveDate),
    INITIAL_TERM_MONTHS: String(termMonths),
    TERM_END_DATE: formatDate(termEnd),
    AUTO_RENEWAL: subscription.autoRenew ? "Enabled, subject to Section 4" : "Disabled",
    PAYMENT_TERMS_DAYS: String(paymentTermsDays),
    ENABLED_MODULES: modules.length ? modules.join(", ") : "No optional modules recorded",
    SIGNER_NAME_PLACEHOLDER: "To be completed through HOAHub electronic signing",
    SIGNER_TITLE_PLACEHOLDER: "To be completed through HOAHub electronic signing",
    SIGNER_EMAIL_PLACEHOLDER: "Authenticated tenant administrator",
  });
  const status = preferredVersion.status === AgreementTemplateVersionStatus.ACTIVE
    ? TenantAgreementStatus.READY_FOR_SIGNATURE
    : TenantAgreementStatus.DRAFT;

  return prisma.$transaction(async (tx) => {
    const agreement = await tx.tenantSubscriptionAgreement.create({
      data: {
        tenantId: input.tenantId,
        subscriptionId: subscription.id,
        templateVersionId: preferredVersion.id,
        agreementNumber: number,
        title: preferredVersion.title,
        status,
        renderedContent,
        termsSnapshot,
        issuerSnapshot,
        tenantSnapshot,
        contentHash: sha256(renderedContent),
        effectiveDate,
        termEndsAt: termEnd,
        autoRenew: subscription.autoRenew,
        createdById: input.actorId || null,
      },
    });
    await tx.agreementAuditEvent.create({
      data: {
        agreementId: agreement.id,
        tenantId: agreement.tenantId,
        eventType: AgreementAuditEventType.CREATED,
        actorUserId: input.actorId || null,
        metadata: {
          templateVersion: preferredVersion.versionLabel,
          templateStatus: preferredVersion.status,
          contentHash: agreement.contentHash,
        },
      },
    });
    if (status === TenantAgreementStatus.READY_FOR_SIGNATURE) {
      await tx.agreementAuditEvent.create({
        data: {
          agreementId: agreement.id,
          tenantId: agreement.tenantId,
          eventType: AgreementAuditEventType.READY_FOR_SIGNATURE,
          actorUserId: input.actorId || null,
        },
      });
    }
    return agreement;
  });
}

export async function getPlatformAgreement(agreementId: string) {
  return prisma.tenantSubscriptionAgreement.findUnique({
    where: { id: agreementId },
    include: { templateVersion: { include: { template: true } }, auditEvents: { orderBy: { createdAt: "asc" } } },
  });
}

export async function getTenantAgreement(tenantId: string, agreementId: string) {
  return prisma.tenantSubscriptionAgreement.findFirst({
    where: { id: agreementId, tenantId },
    include: { templateVersion: { include: { template: true } }, auditEvents: { orderBy: { createdAt: "asc" } } },
  });
}

export async function listTenantAgreements(tenantId: string) {
  return prisma.tenantSubscriptionAgreement.findMany({
    where: { tenantId },
    include: { templateVersion: true },
    orderBy: { createdAt: "desc" },
    take: 36,
  });
}

export async function recordAgreementViewed(input: {
  agreementId: string;
  tenantId: string;
  actorUserId: string;
  actorEmail: string;
  metadata?: AgreementRequestMetadata;
}) {
  const agreement = await prisma.tenantSubscriptionAgreement.findFirst({ where: { id: input.agreementId, tenantId: input.tenantId } });
  if (!agreement) return null;
  if (agreement.viewedAt) return agreement;
  const nextStatus = agreement.status === TenantAgreementStatus.SENT
    ? TenantAgreementStatus.VIEWED
    : agreement.status;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.tenantSubscriptionAgreement.update({
      where: { id: agreement.id },
      data: { viewedAt: new Date(), status: nextStatus },
    });
    await tx.agreementAuditEvent.create({
      data: {
        agreementId: agreement.id,
        tenantId: agreement.tenantId,
        eventType: AgreementAuditEventType.VIEWED,
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        ipAddress: input.metadata?.ipAddress || null,
        userAgent: input.metadata?.userAgent || null,
      },
    });
    return updated;
  });
}

function agreementAdminUrl(agreementId: string) {
  return new URL(`/admin/agreement/${encodeURIComponent(agreementId)}`, getAppUrl()).toString();
}

function uniqueEmails(values: Array<string | null | undefined>) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const email = clean(value).toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    result.push(email);
  }
  return result;
}

export async function sendAgreementInvitation(input: { agreementId: string; actorId: string }) {
  const agreement = await prisma.tenantSubscriptionAgreement.findUnique({
    where: { id: input.agreementId },
    include: { templateVersion: true },
  });
  if (!agreement) throw new Error("Agreement not found.");
  if (agreement.templateVersion.status !== AgreementTemplateVersionStatus.ACTIVE) {
    throw new Error("The legal template must be approved and active before an agreement can be sent for signature.");
  }
  if (![TenantAgreementStatus.READY_FOR_SIGNATURE, TenantAgreementStatus.SENT, TenantAgreementStatus.VIEWED].includes(agreement.status)) {
    throw new Error("This agreement is not available for signature delivery.");
  }
  const tenantSnapshot = agreement.tenantSnapshot as Record<string, unknown>;
  const recipients = uniqueEmails([
    typeof tenantSnapshot.email === "string" ? tenantSnapshot.email : null,
    typeof tenantSnapshot.secondaryBillingEmail === "string" ? tenantSnapshot.secondaryBillingEmail : null,
  ]);
  if (!recipients.length) throw new Error("Configure a tenant billing email before sending the agreement.");
  const config = await getMailConfiguration(BOOTSTRAP_TENANT_ID);
  if (!config.configured) throw new Error("HOAHub platform SMTP is not configured.");
  const url = agreementAdminUrl(agreement.id);
  const customer = typeof tenantSnapshot.legalBusinessName === "string" ? tenantSnapshot.legalBusinessName : "Tenant";
  const subject = `HOAHub subscription agreement ${agreement.agreementNumber} ready for review`;
  const text = [
    `Hello ${customer},`,
    "",
    `Your HOAHub Software Subscription and Services Agreement ${agreement.agreementNumber} is ready for review and electronic acceptance.`,
    "",
    "An authorized tenant administrator must sign in to HOAHub, review the complete agreement, request an email verification code, confirm authority to bind the Association, and electronically sign the agreement.",
    "",
    url,
    "",
    "Do not forward administrator credentials or verification codes.",
    "",
    "HOAHub Agreements",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#eef8fc;font-family:Arial,sans-serif;color:#10354c"><div style="padding:24px 12px"><div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #d7eaf2;border-radius:18px;overflow:hidden"><div style="background:#0a3b57;color:#fff;padding:24px"><p style="margin:0 0 7px;color:#dff8d2;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">HOAHub Agreements</p><h1 style="margin:0;font-size:24px">Subscription agreement ready</h1><p style="margin:8px 0 0;color:#d9f1ff">${agreement.agreementNumber}</p></div><div style="padding:26px 24px"><p style="line-height:1.6">Hello <strong>${customer}</strong>, your HOAHub Software Subscription and Services Agreement is ready for review and electronic acceptance.</p><p style="line-height:1.6">An authorized tenant administrator must sign in, review the complete agreement, request an email verification code, confirm authority to bind the Association, and electronically sign.</p><p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#078bc9;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">Review agreement</a></p><p style="color:#60747e;font-size:12px;line-height:1.6">Do not forward administrator credentials or verification codes. HOAHub preserves the issued document and electronic execution audit trail.</p></div></div></div></body></html>`;
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
    await prisma.$transaction([
      prisma.tenantSubscriptionAgreement.update({
        where: { id: agreement.id },
        data: { status: agreement.status === TenantAgreementStatus.READY_FOR_SIGNATURE ? TenantAgreementStatus.SENT : agreement.status, sentAt: new Date() },
      }),
      prisma.agreementAuditEvent.create({
        data: {
          agreementId: agreement.id,
          tenantId: agreement.tenantId,
          eventType: AgreementAuditEventType.SENT,
          actorUserId: input.actorId,
          metadata: { recipients, providerMessageId: sent.messageId },
        },
      }),
    ]);
    return { recipients, providerMessageId: sent.messageId };
  } catch (error) {
    throw new Error(`Agreement email delivery failed: ${safeMailError(error)}`);
  }
}

export async function issueAgreementOtp(input: {
  agreementId: string;
  tenantId: string;
  userId: string;
  userName: string;
  email: string;
  metadata?: AgreementRequestMetadata;
}) {
  const agreement = await prisma.tenantSubscriptionAgreement.findFirst({
    where: { id: input.agreementId, tenantId: input.tenantId },
    include: { templateVersion: true },
  });
  if (!agreement) throw new Error("Agreement not found.");
  if (agreement.status === TenantAgreementStatus.SIGNED) throw new Error("This agreement is already signed.");
  if (![TenantAgreementStatus.READY_FOR_SIGNATURE, TenantAgreementStatus.SENT, TenantAgreementStatus.VIEWED].includes(agreement.status)) {
    throw new Error("This agreement is not ready for electronic signature.");
  }
  if (![AgreementTemplateVersionStatus.ACTIVE, AgreementTemplateVersionStatus.RETIRED].includes(agreement.templateVersion.status)) {
    throw new Error("The agreement template is not approved for execution.");
  }
  const recent = await prisma.agreementSignatureChallenge.findFirst({
    where: { agreementId: agreement.id, tenantId: input.tenantId, userId: input.userId },
    orderBy: { createdAt: "desc" },
  });
  if (recent && recent.createdAt.getTime() > Date.now() - OTP_RESEND_SECONDS * 1000) {
    throw new Error(`Wait ${OTP_RESEND_SECONDS} seconds before requesting another verification code.`);
  }
  const code = String(randomInt(100000, 1000000));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);
  await prisma.agreementSignatureChallenge.updateMany({
    where: { agreementId: agreement.id, tenantId: input.tenantId, userId: input.userId, usedAt: null },
    data: { usedAt: now },
  });
  const challenge = await prisma.agreementSignatureChallenge.create({
    data: {
      agreementId: agreement.id,
      tenantId: input.tenantId,
      userId: input.userId,
      email: input.email.toLowerCase(),
      codeHash: otpHash(agreement.id, input.userId, code),
      expiresAt,
    },
  });
  const config = await getMailConfiguration(BOOTSTRAP_TENANT_ID);
  if (!config.configured) {
    await prisma.agreementSignatureChallenge.update({ where: { id: challenge.id }, data: { usedAt: new Date() } });
    throw new Error("HOAHub platform SMTP is not configured.");
  }
  try {
    const transporter = nodemailer.createTransport(smtpTransportOptions(config));
    await transporter.sendMail({
      from: { name: config.fromName || "HOAHub", address: config.fromAddress },
      replyTo: config.replyTo,
      to: input.email,
      subject: `HOAHub agreement verification code · ${agreement.agreementNumber}`,
      text: [
        `Hello ${input.userName},`,
        "",
        `Your HOAHub agreement verification code is: ${code}`,
        "",
        `It expires in ${OTP_TTL_MINUTES} minutes and may be used only to sign agreement ${agreement.agreementNumber}.`,
        "If you did not request this code, do not share it and contact HOAHub support.",
        "",
        "HOAHub Agreements",
      ].join("\n"),
      html: `<div style="font-family:Arial,sans-serif;color:#10354c;max-width:620px;margin:auto"><h2>HOAHub agreement verification</h2><p>Hello <strong>${input.userName}</strong>,</p><p>Use this one-time code to continue signing agreement <strong>${agreement.agreementNumber}</strong>:</p><p style="font-size:32px;letter-spacing:.18em;font-weight:800;background:#eef8fc;padding:16px;border-radius:10px;text-align:center">${code}</p><p>This code expires in ${OTP_TTL_MINUTES} minutes. Do not share it.</p></div>`,
    });
  } catch (error) {
    await prisma.agreementSignatureChallenge.update({ where: { id: challenge.id }, data: { usedAt: new Date() } });
    throw new Error(`Verification email failed: ${safeMailError(error)}`);
  }
  await prisma.agreementAuditEvent.create({
    data: {
      agreementId: agreement.id,
      tenantId: agreement.tenantId,
      eventType: AgreementAuditEventType.OTP_SENT,
      actorUserId: input.userId,
      actorEmail: input.email,
      ipAddress: input.metadata?.ipAddress || null,
      userAgent: input.metadata?.userAgent || null,
      metadata: { expiresAt: expiresAt.toISOString() },
    },
  });
  return { expiresAt };
}

export async function signTenantAgreement(input: {
  agreementId: string;
  tenantId: string;
  userId: string;
  userName: string;
  email: string;
  signerName: string;
  signerTitle: string;
  otp: string;
  acceptedTerms: boolean;
  confirmedAuthority: boolean;
  metadata?: AgreementRequestMetadata;
}) {
  const signerName = clean(input.signerName);
  const signerTitle = clean(input.signerTitle);
  const otp = clean(input.otp);
  if (!input.acceptedTerms || !input.confirmedAuthority) throw new Error("Both agreement and authority confirmations are required.");
  if (signerName.length < 3) throw new Error("Enter the signer’s full legal name.");
  if (signerTitle.length < 2) throw new Error("Enter the signer’s title or authority capacity.");
  if (!/^\d{6}$/.test(otp)) throw new Error("Enter the six-digit verification code.");

  const agreement = await prisma.tenantSubscriptionAgreement.findFirst({
    where: { id: input.agreementId, tenantId: input.tenantId },
    include: { templateVersion: true },
  });
  if (!agreement) throw new Error("Agreement not found.");
  if (agreement.status === TenantAgreementStatus.SIGNED) return agreement;
  if (![TenantAgreementStatus.READY_FOR_SIGNATURE, TenantAgreementStatus.SENT, TenantAgreementStatus.VIEWED].includes(agreement.status)) {
    throw new Error("This agreement is not ready for signature.");
  }
  if (![AgreementTemplateVersionStatus.ACTIVE, AgreementTemplateVersionStatus.RETIRED].includes(agreement.templateVersion.status)) {
    throw new Error("This agreement was not issued from an approved legal template.");
  }
  if (sha256(agreement.renderedContent) !== agreement.contentHash) throw new Error("Agreement integrity verification failed.");

  const challenge = await prisma.agreementSignatureChallenge.findFirst({
    where: { agreementId: agreement.id, tenantId: input.tenantId, userId: input.userId, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge || challenge.expiresAt <= new Date()) throw new Error("The verification code has expired. Request a new code.");
  if (challenge.attemptCount >= OTP_MAX_ATTEMPTS) throw new Error("Too many verification attempts. Request a new code.");

  const valid = safeEqual(challenge.codeHash, otpHash(agreement.id, input.userId, otp));
  if (!valid) {
    await prisma.$transaction([
      prisma.agreementSignatureChallenge.update({ where: { id: challenge.id }, data: { attemptCount: { increment: 1 } } }),
      prisma.agreementAuditEvent.create({
        data: {
          agreementId: agreement.id,
          tenantId: agreement.tenantId,
          eventType: AgreementAuditEventType.OTP_FAILED,
          actorUserId: input.userId,
          actorEmail: input.email,
          ipAddress: input.metadata?.ipAddress || null,
          userAgent: input.metadata?.userAgent || null,
        },
      }),
    ]);
    throw new Error("The verification code is incorrect.");
  }

  const signedAt = new Date();
  const authorityDeclaration = `I, ${signerName}, acting as ${signerTitle}, represent that I am authorized to bind the Customer identified in this Agreement.`;
  const acceptanceText = "I have reviewed the complete HOAHub Software Subscription and Services Agreement, agree to be bound by its terms on behalf of the Customer, and intend my typed name and verified electronic acceptance to serve as my electronic signature.";
  const signatureRecord = JSON.stringify({
    agreementId: agreement.id,
    agreementNumber: agreement.agreementNumber,
    contentHash: agreement.contentHash,
    signerUserId: input.userId,
    signerName,
    signerTitle,
    signerEmail: input.email.toLowerCase(),
    signedAt: signedAt.toISOString(),
    authorityDeclaration,
    acceptanceText,
  });
  const signedContentHash = sha256(`${agreement.renderedContent}\n---HOAHUB-SIGNATURE-RECORD---\n${signatureRecord}`);

  return prisma.$transaction(async (tx) => {
    await tx.agreementSignatureChallenge.update({ where: { id: challenge.id }, data: { usedAt: signedAt, attemptCount: { increment: 1 } } });
    await tx.agreementAuditEvent.create({
      data: {
        agreementId: agreement.id,
        tenantId: agreement.tenantId,
        eventType: AgreementAuditEventType.OTP_VERIFIED,
        actorUserId: input.userId,
        actorEmail: input.email,
        ipAddress: input.metadata?.ipAddress || null,
        userAgent: input.metadata?.userAgent || null,
      },
    });
    const signed = await tx.tenantSubscriptionAgreement.update({
      where: { id: agreement.id },
      data: {
        status: TenantAgreementStatus.SIGNED,
        signerUserId: input.userId,
        signerName,
        signerTitle,
        signerEmail: input.email.toLowerCase(),
        authorityDeclaration,
        acceptanceText,
        signatureText: signerName,
        signedAt,
        signerIpAddress: input.metadata?.ipAddress || null,
        signerUserAgent: input.metadata?.userAgent || null,
        signedContentHash,
      },
    });
    await tx.agreementAuditEvent.create({
      data: {
        agreementId: agreement.id,
        tenantId: agreement.tenantId,
        eventType: AgreementAuditEventType.SIGNED,
        actorUserId: input.userId,
        actorEmail: input.email,
        ipAddress: input.metadata?.ipAddress || null,
        userAgent: input.metadata?.userAgent || null,
        metadata: { contentHash: agreement.contentHash, signedContentHash, signerTitle },
      },
    });
    return signed;
  });
}

export async function declineTenantAgreement(input: {
  agreementId: string;
  tenantId: string;
  userId: string;
  email: string;
  reason: string;
  metadata?: AgreementRequestMetadata;
}) {
  const reason = clean(input.reason);
  if (reason.length < 5) throw new Error("Provide a reason for declining the agreement.");
  const agreement = await prisma.tenantSubscriptionAgreement.findFirst({ where: { id: input.agreementId, tenantId: input.tenantId } });
  if (!agreement) throw new Error("Agreement not found.");
  if (agreement.status === TenantAgreementStatus.SIGNED) throw new Error("A signed agreement cannot be declined.");
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const declined = await tx.tenantSubscriptionAgreement.update({ where: { id: agreement.id }, data: { status: TenantAgreementStatus.DECLINED, declinedAt: now } });
    await tx.agreementAuditEvent.create({
      data: {
        agreementId: agreement.id,
        tenantId: agreement.tenantId,
        eventType: AgreementAuditEventType.DECLINED,
        actorUserId: input.userId,
        actorEmail: input.email,
        ipAddress: input.metadata?.ipAddress || null,
        userAgent: input.metadata?.userAgent || null,
        metadata: { reason },
      },
    });
    return declined;
  });
}

export function tenantAgreementSigningAllowed(status: TenantAgreementStatus) {
  return [TenantAgreementStatus.READY_FOR_SIGNATURE, TenantAgreementStatus.SENT, TenantAgreementStatus.VIEWED].includes(status);
}

export function tenantAgreementAdminRoleAllowed(roles: Role[]) {
  return roles.some((role) => [Role.ADMIN, Role.HOA_ADMIN, Role.SYSTEM_ADMIN].includes(role));
}
