import "server-only";

import type { DocumentDefinition } from "@prisma/client";

export type DocumentCapabilities = {
  supportsHomeownerRequest: boolean;
  supportsWalkInRequest: boolean;
  requiresPayment: boolean;
  requiresApproval: boolean;
  supportsAIReview: false;
  supportsQRVerification: boolean;
  supportsAutoNumbering: boolean;
  supportsReissue: boolean;
  supportsRevocation: true;
  supportsPrinting: true;
  supportsDownload: boolean;
  supportsAttachments: false;
  tenantCustomizable: true;
};

export function resolveDocumentCapabilities(definition: Pick<DocumentDefinition, "active" | "archivedAt" | "homeownerDownloadEnabled" | "walkInEnabled" | "paymentRequired" | "approvalRequired" | "requiresAdminReview" | "qrEnabled" | "numberingFormat" | "allowRegeneration">): DocumentCapabilities {
  const active = definition.active && !definition.archivedAt;
  return {
    supportsHomeownerRequest: active && definition.homeownerDownloadEnabled,
    supportsWalkInRequest: active && definition.walkInEnabled,
    requiresPayment: definition.paymentRequired,
    requiresApproval: definition.approvalRequired || definition.requiresAdminReview,
    supportsAIReview: false,
    supportsQRVerification: definition.qrEnabled,
    supportsAutoNumbering: /\{SEQUENCE:(4|6)\}/.test(definition.numberingFormat || ""),
    supportsReissue: definition.allowRegeneration,
    supportsRevocation: true,
    supportsPrinting: true,
    supportsDownload: active && definition.homeownerDownloadEnabled,
    supportsAttachments: false,
    tenantCustomizable: true,
  };
}
