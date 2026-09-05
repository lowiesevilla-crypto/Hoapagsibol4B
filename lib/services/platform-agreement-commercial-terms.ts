import "server-only";

import { createHash } from "node:crypto";
import { TenantAgreementStatus } from "@prisma/client";
import { platformPrisma as prisma } from "@/lib/db";

const ONE_TIME_FEE_MARKER = "COMMERCIAL ORDER — ONE-TIME FEE";
const ISSUE_TERMS_MARKER = "HOAHUB AGREEMENT-SPECIFIC COMMERCIAL TERMS";
const STANDARD_CONVENIENCE_FEE = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function parseDateOnly(value: string, label: string) {
  const normalized = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`${label} must be a valid date.`);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`${label} must be a valid date.`);
  }
  return parsed;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "2-digit", timeZone: "UTC" });
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + (days * DAY_MS));
}

function sameMoney(left: number, right: number) {
  return Math.round(left * 100) === Math.round(right * 100);
}

function stripLegacyOneTimeFeeBlock(content: string) {
  return content.replace(
    /\n*COMMERCIAL ORDER — ONE-TIME FEE\nOne-Time Setup Fee:[^\n]*\nBilling Treatment:[^\n]*\nThis one-time fee[^\n]*\n?/g,
    "\n",
  );
}

function replaceCommercialOrder(input: {
  content: string;
  startDate: Date;
  endDate: Date;
  freeTrialDays: number;
  freeTrialEnd: Date | null;
  setupFee: number;
  convenienceFee: number;
  currency: string;
  convenienceFeeSource: "HOAHUB_STANDARD_RATE" | "MUTUAL_WRITTEN_AGREEMENT";
}) {
  const content = stripLegacyOneTimeFeeBlock(input.content);
  const orderMarker = "COMMERCIAL ORDER\n";
  const orderStart = content.indexOf(orderMarker);
  const orderEndMarker = "\n\nThe Commercial Order above forms";
  const orderEnd = orderStart >= 0 ? content.indexOf(orderEndMarker, orderStart) : -1;
  if (orderStart < 0 || orderEnd < 0) throw new Error("The agreement Commercial Order could not be located.");

  const before = content.slice(0, orderStart + orderMarker.length);
  const after = content.slice(orderEnd);
  const lines = content.slice(orderStart + orderMarker.length, orderEnd).split("\n");
  const removePrefixes = [
    "Free Trial Days:",
    "Free Trial Through:",
    ONE_TIME_FEE_MARKER,
    "One-Time Setup Fee:",
    "One-Time Setup Fee Billing:",
    "HOAHub Convenience Fee:",
  ];
  const cleaned = lines.filter((line) => !removePrefixes.some((prefix) => line.startsWith(prefix)));

  const setLine = (prefix: string, value: string) => {
    const index = cleaned.findIndex((line) => line.startsWith(prefix));
    const next = `${prefix} ${value}`;
    if (index >= 0) cleaned[index] = next;
    else cleaned.push(next);
  };

  setLine("Subscription Start:", formatDate(input.startDate));
  setLine("Initial Term:", `${formatDate(input.startDate)} through ${formatDate(input.endDate)} (inclusive)`);
  setLine("Initial Term End:", formatDate(input.endDate));

  const insertionPoint = Math.max(0, cleaned.findIndex((line) => line.startsWith("Initial Term End:")) + 1);
  const setupFeeText = input.setupFee > 0 ? money(input.setupFee, input.currency) : `${money(0, input.currency)} (none / waived)`;
  const convenienceRateLabel = input.convenienceFeeSource === "HOAHUB_STANDARD_RATE"
    ? "standard HOAHub rate"
    : "mutually agreed HOA-specific rate";
  cleaned.splice(
    insertionPoint,
    0,
    `Free Trial Days: ${input.freeTrialDays} calendar day(s)`,
    `Free Trial Through: ${input.freeTrialEnd ? formatDate(input.freeTrialEnd) : "Not applicable"}`,
    ONE_TIME_FEE_MARKER,
    `One-Time Setup Fee: ${setupFeeText}`,
    "One-Time Setup Fee Billing: Charged once for the initial subscription unless expressly waived or replaced by a mutually agreed written/electronically executed commercial term.",
    `HOAHub Convenience Fee: ${money(input.convenienceFee, input.currency)} per successfully processed transaction (${convenienceRateLabel})`,
  );

  return `${before}${cleaned.join("\n")}${after}`;
}

function ensureIssueLegalClauses(content: string) {
  if (content.includes(ISSUE_TERMS_MARKER)) return content;
  const sectionFour = "\n\n4. TERM, RENEWAL, AND PLAN CHANGES";
  if (!content.includes(sectionFour)) throw new Error("The agreement fee section could not be located.");
  const clauses = [
    ISSUE_TERMS_MARKER,
    "3.5 HOAHub Convenience Fee. Unless the Commercial Order or a separate mutually accepted written/electronic commercial agreement states a different rate, the standard HOAHub convenience fee is PHP 2.00 (₱2.00) per successfully processed transaction. A tenant-specific rate may be increased, reduced, waived, or otherwise changed only by mutual written or electronically executed agreement between HOAHub and Customer. The rate stated in the issued Commercial Order controls for this Agreement. Third-party payment-processor charges, bank charges, and applicable taxes remain separate unless expressly stated as included.",
    "",
    "3.6 Free Trial. If the Commercial Order states Free Trial Days greater than zero, recurring Subscription Fees are waived for that stated trial period beginning on the Subscription Start date and ending on the Free Trial Through date. A free trial does not by itself waive a one-time setup fee, HOAHub convenience fee, third-party processor charge, bank charge, or tax unless the Parties expressly agree otherwise in writing or through an electronically executed commercial term.",
    "",
    "3.7 One-Time Setup Fee. If a One-Time Setup Fee is stated in the Commercial Order, Customer shall pay that non-recurring onboarding/activation fee once in accordance with the applicable invoice or agreed billing treatment. The fee is taken from the Subscription Plan at agreement issue and may be waived or changed only through an authorized mutually agreed commercial term.",
  ].join("\n");
  return content.replace(sectionFour, `\n\n${clauses}${sectionFour}`);
}

export async function ensureAgreementOneTimeFeeSnapshot(input: { agreementId: string; actorId?: string | null }) {
  const agreement = await prisma.tenantSubscriptionAgreement.findUnique({
    where: { id: input.agreementId },
  });
  if (!agreement) throw new Error("Agreement not found.");

  const subscription = await prisma.tenantSubscription.findFirst({
    where: { id: agreement.subscriptionId, tenantId: agreement.tenantId },
    include: { plan: true },
  });
  if (!subscription) throw new Error("The agreement subscription could not be resolved.");

  const existingTerms = (agreement.termsSnapshot && typeof agreement.termsSnapshot === "object" && !Array.isArray(agreement.termsSnapshot))
    ? agreement.termsSnapshot as Record<string, unknown>
    : {};
  const alreadySnapshotted = typeof existingTerms.oneTimeSetupFee === "number" || typeof existingTerms.oneTimeSetupFee === "string";
  const alreadyRendered = agreement.renderedContent.includes(ONE_TIME_FEE_MARKER);
  if (alreadySnapshotted && alreadyRendered) return agreement;

  if (![TenantAgreementStatus.DRAFT, TenantAgreementStatus.READY_FOR_SIGNATURE].includes(agreement.status)) {
    throw new Error("This agreement was already delivered or executed and its commercial terms are immutable. Cancel/terminate it and issue a new agreement to change the one-time fee.");
  }

  const setupFee = Math.max(0, Number(subscription.plan.setupFee || 0));
  const currency = subscription.currency || subscription.plan.currency || "PHP";
  const feeText = setupFee > 0 ? money(setupFee, currency) : `${money(0, currency)} (none / waived)`;
  const commercialFeeBlock = [
    ONE_TIME_FEE_MARKER,
    `One-Time Setup Fee: ${feeText}`,
    "Billing Treatment: Charged once for the initial subscription unless expressly waived or replaced by a written/electronically executed commercial term.",
    "This one-time fee is separate from the recurring subscription fee and forms part of the Commercial Order.",
    "",
  ].join("\n");
  const marker = "ELECTRONIC ACCEPTANCE";
  const renderedContent = alreadyRendered
    ? agreement.renderedContent
    : agreement.renderedContent.includes(marker)
      ? agreement.renderedContent.replace(marker, `${commercialFeeBlock}${marker}`)
      : `${agreement.renderedContent.trim()}\n\n${commercialFeeBlock}`;
  const termsSnapshot = {
    ...existingTerms,
    oneTimeSetupFee: setupFee,
    oneTimeSetupFeeCurrency: currency,
    oneTimeSetupFeeSource: "SUBSCRIPTION_PLAN_SETUP_FEE",
    oneTimeSetupFeeSnapshottedAt: new Date().toISOString(),
  };
  const contentHash = sha256(renderedContent);

  const updated = await prisma.tenantSubscriptionAgreement.update({
    where: { id: agreement.id },
    data: { renderedContent, termsSnapshot, contentHash },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: agreement.tenantId,
      actorId: input.actorId || null,
      module: "PLATFORM_AGREEMENTS",
      action: "AGREEMENT_ONE_TIME_FEE_SNAPSHOTTED",
      entityType: "TenantSubscriptionAgreement",
      entityId: agreement.id,
      metadata: {
        agreementNumber: agreement.agreementNumber,
        planId: subscription.planId,
        setupFee,
        currency,
        contentHash,
        historicalExecutedAgreementsUnaffected: true,
      },
    },
  });
  return updated;
}

export async function applyAgreementIssueCommercialTerms(input: {
  agreementId: string;
  actorId?: string | null;
  startDate: string;
  endDate: string;
  freeTrialDays?: number | null;
  convenienceFeePerTransaction?: number | null;
  mutualFeeAgreementConfirmed?: boolean;
}) {
  const agreement = await prisma.tenantSubscriptionAgreement.findUnique({
    where: { id: input.agreementId },
  });
  if (!agreement) throw new Error("Agreement not found.");
  if (![TenantAgreementStatus.DRAFT, TenantAgreementStatus.READY_FOR_SIGNATURE].includes(agreement.status)) {
    throw new Error("This agreement was already delivered or executed and its commercial terms are immutable. Issue a new or superseding agreement to change dates, trial days, or fees.");
  }

  const subscription = await prisma.tenantSubscription.findFirst({
    where: { id: agreement.subscriptionId, tenantId: agreement.tenantId },
    include: { plan: true },
  });
  if (!subscription) throw new Error("The agreement subscription could not be resolved.");

  const startDate = parseDateOnly(input.startDate, "Start Date");
  const endDate = parseDateOnly(input.endDate, "End Date");
  if (endDate.getTime() < startDate.getTime()) throw new Error("End Date must be on or after Start Date.");
  const termDays = Math.floor((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1;

  const defaultTrialDays = Math.max(0, Number(subscription.plan.trialDays || 0));
  const freeTrialDays = input.freeTrialDays == null ? defaultTrialDays : Number(input.freeTrialDays);
  if (!Number.isInteger(freeTrialDays) || freeTrialDays < 0 || freeTrialDays > 3650) {
    throw new Error("Free Trial Days must be a whole number between 0 and 3650.");
  }
  if (freeTrialDays > termDays) throw new Error("Free Trial Days cannot exceed the agreement date range.");

  const convenienceFee = input.convenienceFeePerTransaction == null
    ? STANDARD_CONVENIENCE_FEE
    : Number(input.convenienceFeePerTransaction);
  if (!Number.isFinite(convenienceFee) || convenienceFee < 0 || convenienceFee > 1000000) {
    throw new Error("HOAHub Convenience Fee must be a valid non-negative amount.");
  }
  const alternateConvenienceRate = !sameMoney(convenienceFee, STANDARD_CONVENIENCE_FEE);
  if (alternateConvenienceRate && !input.mutualFeeAgreementConfirmed) {
    throw new Error("A convenience fee different from the standard ₱2.00 rate requires confirmation of a mutual written/electronic agreement with the HOA.");
  }

  const setupFee = Math.max(0, Number(subscription.plan.setupFee || 0));
  const currency = subscription.currency || subscription.plan.currency || "PHP";
  const freeTrialEnd = freeTrialDays > 0 ? addDays(startDate, freeTrialDays - 1) : null;
  const convenienceFeeSource = alternateConvenienceRate ? "MUTUAL_WRITTEN_AGREEMENT" as const : "HOAHUB_STANDARD_RATE" as const;
  const existingTerms = (agreement.termsSnapshot && typeof agreement.termsSnapshot === "object" && !Array.isArray(agreement.termsSnapshot))
    ? agreement.termsSnapshot as Record<string, unknown>
    : {};
  const renderedContent = ensureIssueLegalClauses(replaceCommercialOrder({
    content: agreement.renderedContent,
    startDate,
    endDate,
    freeTrialDays,
    freeTrialEnd,
    setupFee,
    convenienceFee,
    currency,
    convenienceFeeSource,
  }));
  const now = new Date();
  const termsSnapshot = {
    ...existingTerms,
    subscriptionStart: startDate.toISOString(),
    termEnd: endDate.toISOString(),
    explicitAgreementDateRange: true,
    freeTrialDays,
    freeTrialStart: freeTrialDays > 0 ? startDate.toISOString() : null,
    freeTrialEnd: freeTrialEnd?.toISOString() || null,
    freeTrialDaysSource: input.freeTrialDays == null ? "SUBSCRIPTION_PLAN_TRIAL_DAYS" : "AGREEMENT_ISSUE_INPUT",
    oneTimeSetupFee: setupFee,
    oneTimeSetupFeeCurrency: currency,
    oneTimeSetupFeeSource: "SUBSCRIPTION_PLAN_SETUP_FEE",
    oneTimeSetupFeeSnapshottedAt: now.toISOString(),
    convenienceFeePerTransaction: Math.round(convenienceFee * 100) / 100,
    convenienceFeeCurrency: currency,
    convenienceFeeRateSource: convenienceFeeSource,
    convenienceFeeMutualAgreementConfirmed: alternateConvenienceRate ? true : Boolean(input.mutualFeeAgreementConfirmed),
    commercialTermsSnapshottedAt: now.toISOString(),
  };
  const contentHash = sha256(renderedContent);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.tenantSubscriptionAgreement.update({
      where: { id: agreement.id },
      data: {
        effectiveDate: startDate,
        termEndsAt: endDate,
        renderedContent,
        termsSnapshot,
        contentHash,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: agreement.tenantId,
        actorId: input.actorId || null,
        module: "PLATFORM_AGREEMENTS",
        action: "AGREEMENT_ISSUE_COMMERCIAL_TERMS_SET",
        entityType: "TenantSubscriptionAgreement",
        entityId: agreement.id,
        metadata: {
          agreementNumber: agreement.agreementNumber,
          subscriptionId: agreement.subscriptionId,
          planId: subscription.planId,
          startDate: input.startDate,
          endDate: input.endDate,
          freeTrialDays,
          freeTrialEnd: freeTrialEnd?.toISOString().slice(0, 10) || null,
          setupFee,
          convenienceFeePerTransaction: Math.round(convenienceFee * 100) / 100,
          convenienceFeeRateSource: convenienceFeeSource,
          currency,
          contentHash,
        },
      },
    });
    return updated;
  });
}
