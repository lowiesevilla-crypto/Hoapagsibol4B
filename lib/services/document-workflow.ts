import "server-only";

import {
  DocumentDeliveryMode,
  DocumentFieldType,
  DocumentRequestStatus,
  DocumentSubjectType,
  type DocumentTemplate,
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
  template: Pick<DocumentTemplate, "id" | "tenantId" | "type" | "title" | "version" | "active"> | null;
};

export type DocumentConfigurationStatus =
  | "COMPLETE"
  | "INACTIVE"
  | "MISSING_TEMPLATE"
  | "INVALID_TEMPLATE"
  | "DRAFT_ONLY";

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

export type NormalizedDocumentFieldOption = {
  label: string;
  value: string;
};

export type NormalizedDocumentFieldValidation = {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
};

export type NormalizedDocumentField = {
  key: string;
  label: string;
  fieldType: DocumentFieldType;
  required: boolean;
  active: boolean;
  displayOrder: number;
  defaultValue: string | boolean | null;
  options: NormalizedDocumentFieldOption[];
  validation: NormalizedDocumentFieldValidation;
};

type DocumentFieldInput = {
  key: string;
  label: string;
  fieldType: DocumentFieldType;
  required: boolean;
  active: boolean;
  displayOrder: number;
  options?: unknown;
  validation?: unknown;
  defaultValue?: unknown;
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
    include: { fields: { where: { active: true }, orderBy: [{ displayOrder: "asc" }, { label: "asc" }] }, template: { select: { id: true, tenantId: true, type: true, title: true, version: true, active: true } } },
    orderBy: [{ displayName: "asc" }],
  });
}

export async function getRequestableTenantDocumentConfigurations(tenantId: string) {
  const configurations = await getTenantDocumentConfigurations(tenantId, true);
  return configurations.filter((config) => documentConfigurationStatus(config).status === "COMPLETE");
}

export function documentConfigurationStatus(config: DocumentConfigurationWithFields): { status: DocumentConfigurationStatus; label: string; requestable: boolean } {
  if (!config.active) return { status: "INACTIVE", label: "Inactive", requestable: false };
  if (needsTemplate(config) && !config.templateId) return { status: "MISSING_TEMPLATE", label: "Missing template", requestable: false };
  if (needsTemplate(config) && !config.template) return { status: "MISSING_TEMPLATE", label: "Missing template", requestable: false };
  if (config.template && (config.template.tenantId !== config.tenantId || config.template.type !== config.type)) return { status: "INVALID_TEMPLATE", label: "Invalid template", requestable: false };
  if (config.template && !config.template.active) return { status: "DRAFT_ONLY", label: "Draft only", requestable: false };
  return { status: "COMPLETE", label: "Complete", requestable: true };
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

export function normalizeDocumentField(field: DocumentFieldInput): NormalizedDocumentField {
  return {
    key: field.key,
    label: field.label,
    fieldType: field.fieldType,
    required: field.required,
    active: field.active,
    displayOrder: field.displayOrder,
    defaultValue: normalizeDefaultValue(field.defaultValue, field.fieldType),
    options: normalizeFieldOptions(field.options),
    validation: normalizeFieldValidation(field.validation),
  };
}

export function normalizeDocumentFields(fields: DocumentFieldInput[]) {
  return fields.map(normalizeDocumentField).sort((left, right) => left.displayOrder - right.displayOrder || left.label.localeCompare(right.label));
}

export function validateDocumentRequestData(fields: NormalizedDocumentField[], submittedData: Record<string, FormDataEntryValue | null>) {
  const activeFields = fields.filter((field) => field.active);
  const allowedKeys = new Set(activeFields.map((field) => field.key));
  const values: Record<string, string | boolean> = {};
  const errors: string[] = [];
  for (const key of Object.keys(submittedData)) {
    if (!allowedKeys.has(key)) errors.push(`Unknown field ${key} is not allowed.`);
  }
  for (const field of activeFields) {
    const raw = submittedData[field.key];
    if (field.fieldType === DocumentFieldType.CHECKBOX) {
      const checked = raw === "on" || raw === "true" || raw === "1";
      if (field.required && !checked) errors.push(`${field.label} must be checked.`);
      values[field.key] = checked;
      continue;
    }
    const value = String(raw || "").trim();
    if (field.required && !value) errors.push(`${field.label} is required.`);
    if (field.fieldType === DocumentFieldType.DATE && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors.push(`${field.label} must be a valid date.`);
    if ((field.fieldType === DocumentFieldType.NUMBER || field.fieldType === DocumentFieldType.MONEY) && value) {
      const numeric = Number(value);
      if (Number.isNaN(numeric)) errors.push(`${field.label} must be numeric.`);
      if (field.validation.min !== undefined && numeric < field.validation.min) errors.push(`${field.label} must be at least ${field.validation.min}.`);
      if (field.validation.max !== undefined && numeric > field.validation.max) errors.push(`${field.label} must be at most ${field.validation.max}.`);
    }
    if ((field.fieldType === DocumentFieldType.TEXT || field.fieldType === DocumentFieldType.TEXTAREA) && value) {
      if (field.validation.minLength !== undefined && value.length < field.validation.minLength) errors.push(`${field.label} must be at least ${field.validation.minLength} characters.`);
      if (field.validation.maxLength !== undefined && value.length > field.validation.maxLength) errors.push(`${field.label} must be at most ${field.validation.maxLength} characters.`);
      if (field.validation.pattern) {
        try {
          if (!new RegExp(field.validation.pattern).test(value)) errors.push(`${field.label} has an invalid format.`);
        } catch {
          errors.push(`${field.label} has an invalid validation pattern.`);
        }
      }
    }
    if (field.fieldType === DocumentFieldType.SELECT && value) {
      const allowed = new Set(field.options.map((option) => option.value));
      if (!allowed.has(value)) errors.push(`${field.label} must be one of the configured options.`);
    }
    values[field.key] = value;
  }
  return { values, errors };
}

export function parseConfiguredFields(formData: FormData, fields: DocumentFieldInput[]) {
  const normalizedFields = normalizeDocumentFields(fields);
  const submittedData: Record<string, FormDataEntryValue | null> = {};
  for (const [name, value] of formData.entries()) {
    if (name.startsWith("field_")) submittedData[name.slice(6)] = value;
  }
  return validateDocumentRequestData(normalizedFields, submittedData);
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
  return normalizeFieldOptions(options).map((option) => option.value);
}

export function canGenerateWithoutPayment(config: Pick<DocumentTypeConfiguration, "paymentRequired" | "feeAmount" | "allowPayLater">) {
  return !config.paymentRequired || Number(config.feeAmount) <= 0 || config.allowPayLater;
}

export function needsTemplate(config: Pick<DocumentTypeConfiguration, "deliveryMode">) {
  return config.deliveryMode !== DocumentDeliveryMode.REQUEST_ONLY;
}

function normalizeDefaultValue(value: unknown, fieldType: DocumentFieldType): string | boolean | null {
  if (value === null || value === undefined) return fieldType === DocumentFieldType.CHECKBOX ? false : null;
  if (fieldType === DocumentFieldType.CHECKBOX) return value === true || value === "true" || value === "on" || value === "1";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}

function normalizeFieldOptions(options: unknown): NormalizedDocumentFieldOption[] {
  if (!Array.isArray(options)) return [];
  return options.map((option) => {
    if (option && typeof option === "object" && !Array.isArray(option)) {
      const record = option as Record<string, unknown>;
      const value = String(record.value ?? record.label ?? "").trim();
      const label = String(record.label ?? record.value ?? "").trim();
      return value ? { label: label || value, value } : null;
    }
    const value = String(option ?? "").trim();
    return value ? { label: value.replaceAll("_", " "), value } : null;
  }).filter((option): option is NormalizedDocumentFieldOption => Boolean(option));
}

function normalizeFieldValidation(validation: unknown): NormalizedDocumentFieldValidation {
  if (!validation || typeof validation !== "object" || Array.isArray(validation)) return {};
  const record = validation as Record<string, unknown>;
  return {
    min: finiteNumber(record.min),
    max: finiteNumber(record.max),
    minLength: nonNegativeInteger(record.minLength),
    maxLength: nonNegativeInteger(record.maxLength),
    pattern: typeof record.pattern === "string" && record.pattern.length <= 200 ? record.pattern : undefined,
  };
}

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function nonNegativeInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : undefined;
}
