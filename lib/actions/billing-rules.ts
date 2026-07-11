"use server";

import { RecurringChargeType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBillingSettingsAccess } from "@/lib/billing-access";
import { prisma } from "@/lib/db";
import { assertNoOverlappingBillingRule, assertNoOverlappingExemption, normalizedPeriodDate } from "@/lib/services/billing-rules";
import { billingExemptionSchema, billingRuleSchema } from "@/lib/validation";

function redirectError(path: string, error: unknown, field?: string): never {
  const message = error instanceof Error ? error.message : String(error || "The request could not be completed.");
  const params = new URLSearchParams({ error: message });
  if (field) params.set("field", field);
  redirect(`${path}?${params.toString()}`);
}

function firstValidationError(error: { issues: Array<{ message: string; path: Array<string | number> }> }) {
  const issue = error.issues[0];
  return { message: issue?.message || "Please check the billing rule fields.", field: typeof issue?.path[0] === "string" ? issue.path[0] : undefined };
}

function auditMetadata(payload: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, value instanceof Date ? value.toISOString().slice(0, 10) : value]));
}

export async function saveBillingRuleAction(formData: FormData) {
  const admin = await requireBillingSettingsAccess();
  const parsed = billingRuleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const validationError = firstValidationError(parsed.error);
    redirectError("/admin/settings/billing-rules", validationError.message, validationError.field);
  }
  const data = parsed.data;
  if (data.recurringChargeType !== "MONTHLY_DUES") redirectError("/admin/settings/billing-rules", "Only monthly dues can be configured in Phase 2.2A.");
  try {
    if (data.active) {
      await assertNoOverlappingBillingRule({
        tenantId: admin.tenantId,
        recurringChargeType: data.recurringChargeType as RecurringChargeType,
        startYear: data.effectiveStartYear,
        startMonth: data.effectiveStartMonth,
        endYear: data.effectiveEndYear,
        endMonth: data.effectiveEndMonth,
        excludeId: data.id,
      });
    }
    const payload = {
      tenantId: admin.tenantId,
      recurringChargeType: data.recurringChargeType as RecurringChargeType,
      amount: data.amount,
      billingFrequency: data.billingFrequency,
      generationMode: data.generationMode,
      billingDay: data.billingDay,
      dueDay: data.dueDay,
      gracePeriodDays: data.gracePeriodDays,
      penaltyType: data.penaltyType,
      penaltyValue: data.penaltyValue,
      penaltyFrequency: data.penaltyFrequency,
      effectiveStartYear: data.effectiveStartYear,
      effectiveStartMonth: data.effectiveStartMonth,
      effectiveEndYear: data.effectiveEndYear ?? null,
      effectiveEndMonth: data.effectiveEndMonth ?? null,
      resolutionReference: data.resolutionReference,
      resolutionDate: data.resolutionDate ? new Date(`${data.resolutionDate}T00:00:00.000Z`) : null,
      notes: data.notes ?? null,
      active: data.active,
      updatedById: admin.id,
    };
    const existingRule = data.id ? await prisma.billingRule.findFirst({ where: { id: data.id, tenantId: admin.tenantId }, select: { id: true } }) : null;
    if (data.id && !existingRule) throw new Error("Billing rule not found or access denied.");
    const rule = data.id
      ? await prisma.billingRule.update({ where: { id: existingRule!.id }, data: payload })
      : await prisma.billingRule.create({ data: { ...payload, createdById: admin.id } });
    await prisma.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "BILLING", action: data.id ? "BILLING_RULE_UPDATED" : "BILLING_RULE_CREATED", entityType: "BillingRule", entityId: rule.id, metadata: auditMetadata(payload) } });
  } catch (error) {
    console.error("Billing rule save failed", {
      tenantId: admin.tenantId,
      userId: admin.id,
      ruleId: data.id || null,
      recurringChargeType: data.recurringChargeType,
      effectiveStartYear: data.effectiveStartYear,
      effectiveStartMonth: data.effectiveStartMonth,
      effectiveEndYear: data.effectiveEndYear ?? null,
      effectiveEndMonth: data.effectiveEndMonth ?? null,
      error,
    });
    redirectError("/admin/settings/billing-rules", error, error instanceof Error && error.message.includes("overlap") ? "effectiveStartMonth" : undefined);
  }
  revalidatePath("/admin/settings/billing-rules");
  revalidatePath("/admin/billing");
  redirect("/admin/settings/billing-rules?success=saved&message=Billing%20rule%20saved%20successfully.");
}

export async function deactivateBillingRuleAction(formData: FormData) {
  const admin = await requireBillingSettingsAccess();
  const id = String(formData.get("id") || "");
  try {
    const existingRule = await prisma.billingRule.findFirst({ where: { id, tenantId: admin.tenantId, active: true }, select: { id: true } });
    if (!existingRule) throw new Error("Billing rule not found or access denied.");
    const rule = await prisma.billingRule.update({ where: { id: existingRule.id }, data: { active: false, updatedById: admin.id } });
    await prisma.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "BILLING", action: "BILLING_RULE_DEACTIVATED", entityType: "BillingRule", entityId: rule.id, metadata: { resolutionReference: rule.resolutionReference } } });
  } catch (error) {
    redirectError("/admin/settings/billing-rules", error);
  }
  revalidatePath("/admin/settings/billing-rules");
  redirect("/admin/settings/billing-rules?success=deactivated");
}

export async function saveBillingExemptionAction(formData: FormData) {
  const admin = await requireBillingSettingsAccess();
  const parsed = billingExemptionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirectError("/admin/settings/billing-exemptions", parsed.error.issues[0]?.message || "Invalid exemption.");
  const data = parsed.data;
  try {
    const homeowner = await prisma.homeownerProfile.findFirstOrThrow({ where: { id: data.homeownerId, tenantId: admin.tenantId } });
    await assertNoOverlappingExemption({ tenantId: admin.tenantId, homeownerId: homeowner.id, recurringChargeType: RecurringChargeType.MONTHLY_DUES, startYear: data.startYear, startMonth: data.startMonth, endYear: data.endYear, endMonth: data.endMonth });
    const exemption = await prisma.duesExemption.create({
      data: {
        tenantId: admin.tenantId,
        homeownerId: homeowner.id,
        recurringChargeType: RecurringChargeType.MONTHLY_DUES,
        billingMonth: normalizedPeriodDate(data.startYear, data.startMonth),
        startYear: data.startYear,
        startMonth: data.startMonth,
        endYear: data.endYear,
        endMonth: data.endMonth,
        reason: data.reason,
        resolutionReference: data.resolutionReference || null,
        approvedBy: data.approvedBy || null,
        createdById: admin.id,
      },
    });
    await prisma.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "BILLING", action: "DUES_EXEMPTION_CREATED", entityType: "DuesExemption", entityId: exemption.id, metadata: { homeownerId: homeowner.id, block: homeowner.block, lot: homeowner.lot, startYear: data.startYear, startMonth: data.startMonth, endYear: data.endYear, endMonth: data.endMonth, reason: data.reason } } });
  } catch (error) {
    redirectError("/admin/settings/billing-exemptions", error);
  }
  revalidatePath("/admin/settings/billing-exemptions");
  revalidatePath("/admin/billing");
  redirect("/admin/settings/billing-exemptions?success=saved");
}

export async function deactivateBillingExemptionAction(formData: FormData) {
  const admin = await requireBillingSettingsAccess();
  const id = String(formData.get("id") || "");
  try {
    const existingExemption = await prisma.duesExemption.findFirst({ where: { id, tenantId: admin.tenantId, active: true }, select: { id: true } });
    if (!existingExemption) throw new Error("Exemption not found or access denied.");
    const exemption = await prisma.duesExemption.update({ where: { id: existingExemption.id }, data: { active: false, updatedById: admin.id, deactivatedById: admin.id, deactivatedAt: new Date() } });
    await prisma.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "BILLING", action: "DUES_EXEMPTION_DEACTIVATED", entityType: "DuesExemption", entityId: exemption.id, metadata: { homeownerId: exemption.homeownerId, reason: exemption.reason } } });
  } catch (error) {
    redirectError("/admin/settings/billing-exemptions", error);
  }
  revalidatePath("/admin/settings/billing-exemptions");
  revalidatePath("/admin/billing");
  redirect("/admin/settings/billing-exemptions?success=deactivated");
}
