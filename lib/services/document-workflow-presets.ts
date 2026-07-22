import { DocumentDeliveryMode } from "@prisma/client";

export const documentWorkflowPresetValues = ["FREE_INSTANT", "FREE_APPROVAL", "PAID_INSTANT", "PAID_APPROVAL", "REQUEST_ONLY", "CUSTOM"] as const;

export type DocumentWorkflowPreset = (typeof documentWorkflowPresetValues)[number];

export type DocumentWorkflowFields = {
  deliveryMode: DocumentDeliveryMode;
  paymentRequired: boolean;
  approvalRequired: boolean;
  paymentBeforeApproval: boolean;
  allowImmediateDownload: boolean;
  requiresAdminReview: boolean;
};

export function isDocumentWorkflowPreset(value: string): value is DocumentWorkflowPreset {
  return (documentWorkflowPresetValues as readonly string[]).includes(value);
}

export function workflowFieldsForPreset(preset: string): DocumentWorkflowFields | null {
  switch (preset) {
    case "FREE_INSTANT":
      return { deliveryMode: DocumentDeliveryMode.INSTANT_DOWNLOAD, paymentRequired: false, approvalRequired: false, paymentBeforeApproval: false, allowImmediateDownload: true, requiresAdminReview: false };
    case "FREE_APPROVAL":
      return { deliveryMode: DocumentDeliveryMode.APPROVAL_REQUIRED, paymentRequired: false, approvalRequired: true, paymentBeforeApproval: false, allowImmediateDownload: false, requiresAdminReview: true };
    case "PAID_INSTANT":
      return { deliveryMode: DocumentDeliveryMode.PAYMENT_REQUIRED, paymentRequired: true, approvalRequired: false, paymentBeforeApproval: true, allowImmediateDownload: false, requiresAdminReview: false };
    case "PAID_APPROVAL":
      return { deliveryMode: DocumentDeliveryMode.PAYMENT_AND_APPROVAL_REQUIRED, paymentRequired: true, approvalRequired: true, paymentBeforeApproval: true, allowImmediateDownload: false, requiresAdminReview: true };
    case "REQUEST_ONLY":
      return { deliveryMode: DocumentDeliveryMode.REQUEST_ONLY, paymentRequired: false, approvalRequired: true, paymentBeforeApproval: false, allowImmediateDownload: false, requiresAdminReview: true };
    default:
      return null;
  }
}

export function workflowPresetForDeliveryMode(mode: DocumentDeliveryMode): Exclude<DocumentWorkflowPreset, "CUSTOM"> {
  switch (mode) {
    case DocumentDeliveryMode.INSTANT_DOWNLOAD:
      return "FREE_INSTANT";
    case DocumentDeliveryMode.APPROVAL_REQUIRED:
      return "FREE_APPROVAL";
    case DocumentDeliveryMode.PAYMENT_REQUIRED:
      return "PAID_INSTANT";
    case DocumentDeliveryMode.PAYMENT_AND_APPROVAL_REQUIRED:
      return "PAID_APPROVAL";
    case DocumentDeliveryMode.REQUEST_ONLY:
      return "REQUEST_ONLY";
  }
}

export function workflowPresetForDefinitionFields(definition: DocumentWorkflowFields): DocumentWorkflowPreset {
  for (const preset of documentWorkflowPresetValues) {
    if (preset === "CUSTOM") continue;
    const fields = workflowFieldsForPreset(preset);
    if (
      fields &&
      fields.deliveryMode === definition.deliveryMode &&
      fields.paymentRequired === definition.paymentRequired &&
      fields.approvalRequired === definition.approvalRequired &&
      fields.paymentBeforeApproval === definition.paymentBeforeApproval &&
      fields.allowImmediateDownload === definition.allowImmediateDownload &&
      fields.requiresAdminReview === definition.requiresAdminReview
    ) return preset;
  }
  return "CUSTOM";
}
