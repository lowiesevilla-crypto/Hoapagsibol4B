import { DocumentFieldType } from "@prisma/client";

export type NormalizedDocumentFieldOption = {
  label: string;
  value: string;
};

export type NormalizedDocumentFieldValidation = {
  min?: number | string;
  max?: number | string;
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

export type DocumentFieldInput = {
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

export function normalizeDocumentField(field: DocumentFieldInput): NormalizedDocumentField {
  const options = normalizeFieldOptions(field.options);
  return {
    key: field.key,
    label: field.label,
    fieldType: field.fieldType,
    required: field.required,
    active: field.active,
    displayOrder: field.displayOrder,
    defaultValue: normalizeDefaultValue(field.defaultValue, field.fieldType, options),
    options,
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
    if (field.required && !value) errors.push(field.fieldType === DocumentFieldType.SELECT ? `Select a ${field.label}.` : `${field.label} is required.`);
    if (field.fieldType === DocumentFieldType.DATE && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors.push(`${field.label} must be a valid date.`);
    if (field.fieldType === DocumentFieldType.DATE && value) {
      if (typeof field.validation.min === "string" && value < field.validation.min) errors.push(`${field.label} must be on or after ${field.validation.min}.`);
      if (typeof field.validation.max === "string" && value > field.validation.max) errors.push(`${field.label} must be on or before ${field.validation.max}.`);
    }
    if ((field.fieldType === DocumentFieldType.NUMBER || field.fieldType === DocumentFieldType.MONEY) && value) {
      const numeric = Number(value);
      if (Number.isNaN(numeric)) errors.push(`${field.label} must be numeric.`);
      if (typeof field.validation.min === "number" && numeric < field.validation.min) errors.push(`${field.label} must be at least ${field.validation.min}.`);
      if (typeof field.validation.max === "number" && numeric > field.validation.max) errors.push(`${field.label} must be at most ${field.validation.max}.`);
    }
    if ((field.fieldType === DocumentFieldType.TEXT || field.fieldType === DocumentFieldType.TEXTAREA) && value) {
      if (field.validation.minLength !== undefined && value.length < field.validation.minLength) errors.push(`${field.label} must be at least ${field.validation.minLength} characters.`);
      if (field.validation.maxLength !== undefined && value.length > field.validation.maxLength) errors.push(`${field.label} must not exceed ${field.validation.maxLength} characters.`);
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

export function fieldOptions(options: unknown) {
  return normalizeFieldOptions(options).map((option) => option.value);
}

function normalizeDefaultValue(value: unknown, fieldType: DocumentFieldType, options: NormalizedDocumentFieldOption[]): string | boolean | null {
  if (value === null || value === undefined) return fieldType === DocumentFieldType.CHECKBOX ? false : null;
  if (fieldType === DocumentFieldType.CHECKBOX) return value === true || value === "true" || value === "on" || value === "1";
  const normalized = typeof value === "string" || typeof value === "number" ? String(value) : typeof value === "boolean" ? (value ? "true" : "false") : null;
  if (fieldType === DocumentFieldType.SELECT && normalized && !options.some((option) => option.value === normalized)) return null;
  return normalized;
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
    min: numberOrDateConstraint(record.min),
    max: numberOrDateConstraint(record.max),
    minLength: nonNegativeInteger(record.minLength),
    maxLength: nonNegativeInteger(record.maxLength),
    pattern: typeof record.pattern === "string" && record.pattern.length <= 200 ? record.pattern : undefined,
  };
}

function numberOrDateConstraint(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function nonNegativeInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : undefined;
}
