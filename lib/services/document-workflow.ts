import "server-only";

import {
  DocumentDeliveryMode,
  DocumentFieldType,
  DocumentRequestStatus,
  DocumentSubjectType,
  type DocumentFieldConfiguration,
  type DocumentTypeConfiguration,
  type HomeownerProfile,
  type HouseholdMember,
  type User,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { asJson } from "@/lib/organization";
import { documentTypeLabel } from "@/lib/services/documents";
import { money } from "@/lib/utils";

export type DocumentConfigurationWithFields = DocumentTypeConfiguration & {
  fields: DocumentFieldConfiguration[];
  template: { id: string; title: string; version: number; active: boolean } | null;
};

export type RequestSubjectSnapshot = {
  type: DocumentSubjectType;
  fullName: string;
  relationship: string;
  birthDate: string | null;
  civilStatus: string | null;
  nationality: string | null;
  address: string;
  homeownerName: string;
  propertyAddress: string;
  block: string;
  lot: string;
  accountLabel: string;
};

const deliveryDescriptions: Record<DocumentDeliveryMode, string> = {
  INSTANT_DOWNLOAD: "Available for immediate download when requirements are satisfied",
  APPROVAL_REQUIRED: "Requires HOA approval",
  PAYMENT_REQUIRED: "Download available after payment confirmation",
  PAYMENT_AND_APPROVAL_REQUIRED: "Requires payment confirmation and HOA approval",
  REQUEST_ONLY: "Recorded for offline or manual processing",
};

export async function getTenantDocumentConfigurations(tenantId: string, activeOnly = false) {
  return prisma.documentTypeConfiguration.findMany({
    where: { tenantId, ...(activeOnly ? { active: true } : {}) },
    include: { fields: { where: { active: true }, orderBy: [{ displayOrder: "asc" }, { label: "asc" }] }, template: { select: { id: true, title: true, version: true, active: true } } },
    orderBy: [{ displayName: "asc" }],
  });
}

export function deliveryModeDescription(mode: DocumentDeliveryMode) {
  return deliveryDescriptions[mode];
}

export function configuredDocumentSummary(config: Pick<DocumentTypeConfiguration, "feeAmount" | "deliveryMode" | "paymentRequired" | "approvalRequired">) {
  const fee = Number(config.feeAmount) > 0 ? money(Number(config.feeAmount)) : "Free";
  return `${fee} - ${deliveryModeDescription(config.deliveryMode)}`;
}

export function statusForConfiguration(config: Pick<DocumentTypeConfiguration, "deliveryMode" | "approvalRequired" | "paymentRequired" | "requiresAdminReview" | "allowImmediateDownload">) {
  if (config.paymentRequired || config.deliveryMode === DocumentDeliveryMode.PAYMENT_REQUIRED || config.deliveryMode === DocumentDeliveryMode.PAYMENT_AND_APPROVAL_REQUIRED) {
    return DocumentRequestStatus.PAYMENT_PENDING;
  }
  if (config.approvalRequired || config.requiresAdminReview || config.deliveryMode === DocumentDeliveryMode.APPROVAL_REQUIRED) return DocumentRequestStatus.PENDING_APPROVAL;
  if (config.deliveryMode === DocumentDeliveryMode.REQUEST_ONLY) return DocumentRequestStatus.SUBMITTED;
  if (config.deliveryMode === DocumentDeliveryMode.INSTANT_DOWNLOAD && config.allowImmediateDownload) return DocumentRequestStatus.READY_FOR_DOWNLOAD;
  return DocumentRequestStatus.SUBMITTED;
}

export function isReadyForDownload(status: DocumentRequestStatus | string) {
  return status === DocumentRequestStatus.READY_FOR_DOWNLOAD || status === DocumentRequestStatus.GENERATED || status === DocumentRequestStatus.DOWNLOADED;
}

export function parseConfiguredFields(formData: FormData, fields: DocumentFieldConfiguration[]) {
  const values: Record<string, string | boolean> = {};
  const errors: string[] = [];
  for (const field of fields) {
    const raw = formData.get(`field_${field.key}`);
    if (field.fieldType === DocumentFieldType.CHECKBOX) {
      values[field.key] = raw === "on";
      continue;
    }
    const value = String(raw || "").trim();
    if (field.required && !value) errors.push(`${field.label} is required.`);
    if (field.fieldType === DocumentFieldType.DATE && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors.push(`${field.label} must be a valid date.`);
    if ((field.fieldType === DocumentFieldType.NUMBER || field.fieldType === DocumentFieldType.MONEY) && value && Number.isNaN(Number(value))) errors.push(`${field.label} must be numeric.`);
    values[field.key] = value;
  }
  return { values, errors };
}

export function legacyRequestFields(values: Record<string, string | boolean>) {
  const text = (key: string) => typeof values[key] === "string" ? values[key] as string : undefined;
  return {
    purpose: text("purpose"),
    remarks: text("remarks"),
    scheduledDate: text("scheduledDate"),
    startTime: text("startTime"),
    endTime: text("endTime"),
    passType: text("passType"),
    vehicleDetails: text("vehicleDetails"),
    partyName: text("partyName"),
    contractorDetails: text("contractorDetails"),
    representativeName: text("representativeName"),
    propertyDetails: text("propertyDetails"),
  };
}

export function buildSubjectSnapshot(args: {
  subjectType: DocumentSubjectType;
  homeowner: HomeownerProfile & { user: Pick<User, "name"> };
  member?: HouseholdMember | null;
}): RequestSubjectSnapshot {
  const { homeowner, subjectType, member } = args;
  const relationship = subjectType === DocumentSubjectType.SELF ? "Homeowner" : member?.relationship || "Registered household member";
  return {
    type: subjectType,
    fullName: subjectType === DocumentSubjectType.SELF ? homeowner.user.name : member?.fullName || homeowner.user.name,
    relationship,
    birthDate: (subjectType === DocumentSubjectType.SELF ? homeowner.birthDate : member?.birthDate)?.toISOString().slice(0, 10) ?? null,
    civilStatus: subjectType === DocumentSubjectType.SELF ? homeowner.civilStatus : member?.civilStatus ?? null,
    nationality: subjectType === DocumentSubjectType.SELF ? homeowner.citizenship : member?.nationality ?? null,
    address: member?.address || homeowner.address,
    homeownerName: homeowner.user.name,
    propertyAddress: homeowner.address,
    block: homeowner.block,
    lot: homeowner.lot,
    accountLabel: `Block ${homeowner.block}, Lot ${homeowner.lot}`,
  };
}

export function subjectSnapshotJson(snapshot: RequestSubjectSnapshot) {
  return asJson(snapshot);
}

export function requestDataSnapshotJson(config: DocumentConfigurationWithFields, values: Record<string, string | boolean>, numberOfCopies: number) {
  return asJson({
    configurationId: config.id,
    configurationVersion: config.version,
    type: config.type,
    displayName: config.displayName || documentTypeLabel(config.type),
    fields: values,
    numberOfCopies,
  });
}

export function fieldOptions(options: unknown) {
  return Array.isArray(options) ? options.map(String) : [];
}

export function canGenerateWithoutPayment(config: Pick<DocumentTypeConfiguration, "paymentRequired" | "feeAmount" | "allowPayLater">) {
  return !config.paymentRequired || Number(config.feeAmount) <= 0 || config.allowPayLater;
}

export function needsTemplate(config: Pick<DocumentTypeConfiguration, "deliveryMode">) {
  return config.deliveryMode !== DocumentDeliveryMode.REQUEST_ONLY;
}
