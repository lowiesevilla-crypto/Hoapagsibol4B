import "server-only";

import { createHash } from "node:crypto";
import { AgreementTemplateVersionStatus } from "@prisma/client";
import { platformPrisma as prisma } from "@/lib/db";
import {
  HOA_HUB_AGREEMENT_BODY,
  HOA_HUB_AGREEMENT_TEMPLATE_CODE,
  HOA_HUB_AGREEMENT_TITLE,
  HOA_HUB_AGREEMENT_VERSION,
  HOA_HUB_AGREEMENT_VERSION_LABEL,
} from "@/lib/legal/platform-subscription-agreement-v2";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function ensureAgreementTemplateV11(actorId?: string | null) {
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
    where: {
      templateId_versionNumber: {
        templateId: template.id,
        versionNumber: HOA_HUB_AGREEMENT_VERSION,
      },
    },
  });
  if (existing) return existing;

  return prisma.platformAgreementTemplateVersion.create({
    data: {
      templateId: template.id,
      versionNumber: HOA_HUB_AGREEMENT_VERSION,
      versionLabel: HOA_HUB_AGREEMENT_VERSION_LABEL,
      status: AgreementTemplateVersionStatus.PENDING_LEGAL_APPROVAL,
      title: HOA_HUB_AGREEMENT_TITLE,
      body: HOA_HUB_AGREEMENT_BODY,
      contentHash: sha256(HOA_HUB_AGREEMENT_BODY),
      createdById: actorId || null,
      legalReviewNotes: "HOAHub legal draft v1.1 adds explicit agreement Start Date, End Date, Free Trial Days, Subscription Plan one-time setup fee, and the standard PHP 2.00 per-transaction HOAHub convenience fee with mutually agreed HOA-specific rate support. Electronic signing remains disabled for this version until legal review is recorded and this exact version is activated.",
    },
  });
}
