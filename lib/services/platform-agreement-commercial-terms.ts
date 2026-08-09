import "server-only";

import { createHash } from "node:crypto";
import { TenantAgreementStatus } from "@prisma/client";
import { platformPrisma as prisma } from "@/lib/db";

const ONE_TIME_FEE_MARKER = "COMMERCIAL ORDER — ONE-TIME FEE";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
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
