"use server";

import {
  BillingFrequency,
  BillingGenerationMode,
  BillingPenaltyFrequency,
  BillingPenaltyType,
  Prisma,
  RecurringChargeType,
  SystemSettingCategory,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission, requirePermissions } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { applyOnboardingImport, validateOnboardingImport } from "@/lib/onboarding/import";
import { onboardingPrerequisites, updateTenantOnboardingState } from "@/lib/onboarding/state";
import { assertNoOverlappingBillingRule, previewBillingGeneration } from "@/lib/services/billing-rules";

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export async function saveOnboardingProfileAction(formData: FormData) {
  const actor = await requirePermission(Permission.TENANT_SETTINGS_MANAGE);
  const name = requiredText(formData, "name", 120);
  const shortName = requiredText(formData, "shortName", 40);
  const address = optionalText(formData, "address", 1000);
  const supportEmail = optionalEmail(formData, "supportEmail");
  const supportPhone = optionalText(formData, "supportPhone", 40);
  const timezone = requiredText(formData, "timezone", 80);
  const currency = requiredText(formData, "currency", 3).toUpperCase();
  const receiptPrefix = normalizedPrefix(formData, "receiptPrefix", "OR");
  const documentPrefix = normalizedPrefix(formData, "documentPrefix", "DOC");
  if (!isSupportedTimezone(timezone)) throw new Error("Select a valid IANA timezone.");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must use a three-letter ISO code.");

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: actor.tenantId },
      data: { name, shortName, address, email: supportEmail, contactNumber: supportPhone },
    });
    await Promise.all([
      saveSetting(tx, actor.tenantId, actor.id, "TIMEZONE", "Timezone", timezone),
      saveSetting(tx, actor.tenantId, actor.id, "CURRENCY", "Currency", currency),
      saveSetting(tx, actor.tenantId, actor.id, "RECEIPT_PREFIX", "Receipt prefix", receiptPrefix),
      saveSetting(tx, actor.tenantId, actor.id, "DOCUMENT_PREFIX", "Document prefix", documentPrefix),
    ]);
    await updateTenantOnboardingState(actor.tenantId, actor.id, (state) => ({
      ...state,
      profile: {
        completedAt: new Date().toISOString(),
        timezone,
        currency,
        supportEmail,
        supportPhone,
        receiptPrefix,
        documentPrefix,
      },
    }), tx);
    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorId: actor.id,
        module: "ONBOARDING",
        action: "TENANT_PROFILE_CONFIGURED",
        entityType: "Tenant",
        entityId: actor.tenantId,
        metadata: { name, shortName, timezone, currency, receiptPrefix, documentPrefix },
      },
    });
  });
  finish("profile-saved", "Tenant profile and operational defaults saved.");
}

export async function acknowledgeOnboardingPrivacyAction(formData: FormData) {
  const actor = await requirePermission(Permission.TENANT_SETTINGS_MANAGE);
  const dataControllerAccepted = formData.get("dataControllerAccepted") === "on";
  const secureHandlingAccepted = formData.get("secureHandlingAccepted") === "on";
  const importAuthorizationAccepted = formData.get("importAuthorizationAccepted") === "on";
  if (!dataControllerAccepted || !secureHandlingAccepted || !importAuthorizationAccepted) {
    throw new Error("All privacy and data-handling acknowledgements are required before importing resident data.");
  }
  await prisma.$transaction(async (tx) => {
    await updateTenantOnboardingState(actor.tenantId, actor.id, (state) => ({
      ...state,
      privacy: {
        acknowledgedAt: new Date().toISOString(),
        acknowledgedById: actor.id,
        dataControllerAccepted,
        secureHandlingAccepted,
        importAuthorizationAccepted,
      },
    }), tx);
    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorId: actor.id,
        module: "ONBOARDING",
        action: "PRIVACY_RESPONSIBILITIES_ACKNOWLEDGED",
        entityType: "Tenant",
        entityId: actor.tenantId,
        metadata: { dataControllerAccepted, secureHandlingAccepted, importAuthorizationAccepted },
      },
    });
  });
  finish("privacy-saved", "Privacy and import responsibilities acknowledged.");
}

export async function validateOnboardingImportAction(formData: FormData) {
  const actor = await requirePermission(Permission.HOMEOWNERS_MANAGE);
  const file = uploadedCsv(formData.get("file"));
  const csv = await file.text();
  const result = await validateOnboardingImport(actor.tenantId, csv);
  await prisma.$transaction(async (tx) => {
    await updateTenantOnboardingState(actor.tenantId, actor.id, (state) => ({
      ...state,
      import: {
        templateVersion: result.templateVersion,
        fileHash: result.fileHash,
        fileName: file.name || "homeowners.csv",
        validatedAt: new Date().toISOString(),
        validRows: result.validRows,
        errors: result.errors.slice(0, 500),
      },
    }), tx);
    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorId: actor.id,
        module: "ONBOARDING",
        action: "HOMEOWNER_IMPORT_VALIDATED",
        entityType: "Tenant",
        entityId: actor.tenantId,
        metadata: { fileHash: result.fileHash, templateVersion: result.templateVersion, validRows: result.validRows, errorCount: result.errors.length },
      },
    });
  });
  const message = result.errors.length
    ? `Dry run found ${result.errors.length} validation error${result.errors.length === 1 ? "" : "s"}. No records were written.`
    : `Dry run passed for ${result.validRows} homeowner row${result.validRows === 1 ? "" : "s"}. Re-upload the unchanged file to apply.`;
  finish(result.errors.length ? "import-errors" : "import-valid", message);
}

export async function applyOnboardingImportAction(formData: FormData) {
  const actor = await requirePermissions([Permission.HOMEOWNERS_MANAGE, Permission.BILLING_ADJUST]);
  if (formData.get("confirmApply") !== "on") throw new Error("Explicit confirmation is required before importing homeowner and opening-balance data.");
  const expectedFileHash = requiredText(formData, "expectedFileHash", 64);
  if (!/^[a-f0-9]{64}$/.test(expectedFileHash)) throw new Error("Run dry-run validation before applying the import.");
  const file = uploadedCsv(formData.get("file"));
  const result = await applyOnboardingImport({
    tenantId: actor.tenantId,
    actorId: actor.id,
    csv: await file.text(),
    expectedFileHash,
    fileName: file.name || "homeowners.csv",
  });
  finish("import-applied", `${result.importedRows} homeowner record${result.importedRows === 1 ? "" : "s"} imported; ${result.openingBalancesPosted} opening balance${result.openingBalancesPosted === 1 ? "" : "s"} posted; activation delivery attempted for ${result.activationEmailsAttempted}.`);
}

export async function saveOnboardingBillingRuleAction(formData: FormData) {
  const actor = await requirePermission(Permission.BILLING_CONFIGURE);
  const monthlyAmount = positiveMoney(formData, "monthlyAmount");
  const dueDay = integer(formData, "dueDay", 1, 28);
  const effectiveFrom = requiredText(formData, "effectiveFrom", 7);
  const period = parseMonth(effectiveFrom);
  const description = requiredText(formData, "description", 500);
  const currentStateSetting = await prisma.systemSetting.findFirst({
    where: { tenantId: actor.tenantId, category: SystemSettingCategory.ASSOCIATION, key: "TENANT_ONBOARDING_V1" },
    select: { value: true },
  });
  let existingRuleId: string | undefined;
  try {
    existingRuleId = currentStateSetting?.value ? (JSON.parse(currentStateSetting.value) as { billing?: { ruleId?: string } }).billing?.ruleId : undefined;
  } catch {
    existingRuleId = undefined;
  }
  if (existingRuleId) {
    const exists = await prisma.billingRule.findFirst({ where: { tenantId: actor.tenantId, id: existingRuleId }, select: { id: true } });
    if (!exists) existingRuleId = undefined;
  }
  await assertNoOverlappingBillingRule({
    tenantId: actor.tenantId,
    recurringChargeType: RecurringChargeType.MONTHLY_DUES,
    startYear: period.year,
    startMonth: period.month,
    excludeId: existingRuleId,
  });

  await prisma.$transaction(async (tx) => {
    const rule = existingRuleId
      ? await tx.billingRule.update({
          where: { id: existingRuleId },
          data: {
            amount: monthlyAmount,
            dueDay,
            effectiveStartYear: period.year,
            effectiveStartMonth: period.month,
            resolutionReference: `ONBOARDING-${actor.tenantId.slice(-8).toUpperCase()}`,
            notes: description,
            active: true,
            updatedById: actor.id,
          },
        })
      : await tx.billingRule.create({
          data: {
            tenantId: actor.tenantId,
            recurringChargeType: RecurringChargeType.MONTHLY_DUES,
            amount: monthlyAmount,
            billingFrequency: BillingFrequency.MONTHLY,
            generationMode: BillingGenerationMode.MANUAL,
            billingDay: 1,
            dueDay,
            gracePeriodDays: 0,
            penaltyType: BillingPenaltyType.NONE,
            penaltyValue: 0,
            penaltyFrequency: BillingPenaltyFrequency.NONE,
            effectiveStartYear: period.year,
            effectiveStartMonth: period.month,
            resolutionReference: `ONBOARDING-${actor.tenantId.slice(-8).toUpperCase()}`,
            notes: description,
            active: true,
            createdById: actor.id,
            updatedById: actor.id,
          },
        });
    await updateTenantOnboardingState(actor.tenantId, actor.id, (state) => ({
      ...state,
      billing: {
        completedAt: new Date().toISOString(),
        ruleId: rule.id,
        monthlyAmount,
        effectiveFrom,
        dueDay,
        description,
      },
      preview: undefined,
      completedAt: undefined,
      completedById: undefined,
    }), tx);
    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorId: actor.id,
        module: "ONBOARDING",
        action: existingRuleId ? "BILLING_RULE_UPDATED" : "BILLING_RULE_CREATED",
        entityType: "BillingRule",
        entityId: rule.id,
        metadata: { monthlyAmount, dueDay, effectiveFrom, generationMode: "MANUAL", source: "TENANT_ONBOARDING" },
      },
    });
  });
  finish("billing-saved", "Monthly dues rule saved in manual mode. No bills were generated.");
}

export async function previewOnboardingBillingAction(formData: FormData) {
  const actor = await requirePermission(Permission.BILLING_PREVIEW);
  const targetMonth = requiredText(formData, "targetMonth", 7);
  const period = parseMonth(targetMonth);
  const before = await prisma.bill.count({ where: { tenantId: actor.tenantId } });
  const preview = await previewBillingGeneration({
    actor: { id: actor.id, tenantId: actor.tenantId, name: actor.name, email: actor.email },
    coverageYear: period.year,
    coverageMonth: period.month,
    scope: "ALL",
  });
  const after = await prisma.bill.count({ where: { tenantId: actor.tenantId } });
  if (after !== before) throw new Error("Billing preview safety check failed because persisted bill count changed.");
  await prisma.$transaction(async (tx) => {
    await updateTenantOnboardingState(actor.tenantId, actor.id, (state) => ({
      ...state,
      preview: {
        completedAt: new Date().toISOString(),
        year: period.year,
        month: period.month,
        eligible: preview.projectedNewBillCount,
        skipped: preview.exemptCount + preview.duplicateCount,
        errors: preview.invalidCount,
        totalAmount: preview.projectedTotalAmount,
        confirmationRequired: true,
      },
    }), tx);
    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorId: actor.id,
        module: "ONBOARDING",
        action: "FIRST_BILLING_PREVIEW_COMPLETED",
        entityType: "Tenant",
        entityId: actor.tenantId,
        metadata: { targetMonth, projectedNewBillCount: preview.projectedNewBillCount, projectedTotalAmount: preview.projectedTotalAmount, persistedBillCountBefore: before, persistedBillCountAfter: after },
      },
    });
  });
  finish("preview-complete", `Preview complete: ${preview.projectedNewBillCount} eligible, ${preview.exemptCount + preview.duplicateCount} skipped, projected total ${preview.projectedTotalAmount.toFixed(2)}. No bills were generated.`);
}

export async function completeTenantOnboardingAction(formData: FormData) {
  const actor = await requirePermission(Permission.TENANT_SETTINGS_MANAGE);
  if (formData.get("confirmComplete") !== "on") throw new Error("Confirm that onboarding setup has been reviewed.");
  const setting = await prisma.systemSetting.findFirst({
    where: { tenantId: actor.tenantId, category: SystemSettingCategory.ASSOCIATION, key: "TENANT_ONBOARDING_V1" },
    select: { value: true },
  });
  if (!setting?.value) throw new Error("Complete the onboarding steps first.");
  const state = JSON.parse(setting.value);
  const prerequisites = onboardingPrerequisites(state);
  const missing = Object.entries(prerequisites).filter(([, complete]) => !complete).map(([step]) => step);
  if (missing.length) throw new Error(`Complete these onboarding steps first: ${missing.join(", ")}.`);
  await prisma.$transaction(async (tx) => {
    await updateTenantOnboardingState(actor.tenantId, actor.id, (current) => ({ ...current, completedAt: new Date().toISOString(), completedById: actor.id }), tx);
    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorId: actor.id,
        module: "ONBOARDING",
        action: "TENANT_ONBOARDING_COMPLETED",
        entityType: "Tenant",
        entityId: actor.tenantId,
        metadata: { prerequisites },
      },
    });
  });
  finish("completed", "Tenant onboarding is complete. Billing generation remains a separate authorized action.");
}

async function saveSetting(tx: Prisma.TransactionClient, tenantId: string, actorId: string, key: string, label: string, value: string) {
  const existing = await tx.systemSetting.findFirst({ where: { tenantId, category: SystemSettingCategory.ASSOCIATION, key }, select: { id: true } });
  if (existing) await tx.systemSetting.update({ where: { id: existing.id }, data: { value, updatedById: actorId } });
  else await tx.systemSetting.create({ data: { tenantId, category: SystemSettingCategory.ASSOCIATION, key, label, value, updatedById: actorId } });
}

function uploadedCsv(value: FormDataEntryValue | null) {
  if (!value || typeof value === "string" || !("size" in value) || typeof value.size !== "number" || !("text" in value) || typeof value.text !== "function") throw new Error("Upload a CSV file.");
  if (!value.size) throw new Error("CSV file is empty.");
  if (value.size > MAX_IMPORT_BYTES) throw new Error("CSV files are limited to 2 MB.");
  const name = "name" in value && typeof value.name === "string" ? value.name : "homeowners.csv";
  if (!name.toLowerCase().endsWith(".csv")) throw new Error("Upload a .csv file.");
  return value as File;
}

function requiredText(formData: FormData, field: string, max: number) {
  const value = String(formData.get(field) || "").trim();
  if (!value) throw new Error(`${field} is required.`);
  if (value.length > max) throw new Error(`${field} is too long.`);
  return value;
}

function optionalText(formData: FormData, field: string, max: number) {
  const value = String(formData.get(field) || "").trim();
  if (value.length > max) throw new Error(`${field} is too long.`);
  return value || null;
}

function optionalEmail(formData: FormData, field: string) {
  const value = optionalText(formData, field, 191);
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`${field} must be a valid email address.`);
  return value?.toLowerCase() ?? null;
}

function normalizedPrefix(formData: FormData, field: string, fallback: string) {
  const value = String(formData.get(field) || fallback).trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!value || value.length > 12) throw new Error(`${field} must contain 1 to 12 letters, numbers, or hyphens.`);
  return value;
}

function positiveMoney(formData: FormData, field: string) {
  const raw = String(formData.get(field) || "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error(`${field} must be a valid amount with at most two decimal places.`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be greater than zero.`);
  return value;
}

function integer(formData: FormData, field: string, minimum: number, maximum: number) {
  const value = Number(formData.get(field));
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${field} must be from ${minimum} to ${maximum}.`);
  return value;
}

function parseMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  if (!match || year < 2020 || year > 2100 || month < 1 || month > 12) throw new Error("Use a valid month in YYYY-MM format.");
  return { year, month };
}

function isSupportedTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function finish(code: string, message: string): never {
  revalidatePath("/admin/onboarding");
  redirect(`/admin/onboarding?status=${encodeURIComponent(code)}&message=${encodeURIComponent(message)}`);
}
