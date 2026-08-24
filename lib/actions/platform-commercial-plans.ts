"use server";

import { Role, TenantModule } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AI_ASSISTANCE_FEATURE_CODE } from "@/lib/ai-assistance/commercial";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DOCUMENT_MANAGEMENT_FEATURE_CODE } from "@/lib/document-repository/constants";
import { PETTY_CASH_FEATURE_CODE } from "@/lib/petty-cash/constants";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function optionalMoney(value: FormDataEntryValue | null) {
  const raw = clean(value);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Plan prices must be zero or greater.");
  return parsed;
}

function optionalPositiveInt(value: FormDataEntryValue | null) {
  const raw = clean(value);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error("Plan limits must be positive whole numbers.");
  return parsed;
}

function optionalNonNegativeInt(value: FormDataEntryValue | null) {
  const raw = clean(value);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("AI allowances must be zero or a positive whole number.");
  return parsed;
}

function aiConfiguration(formData: FormData) {
  const modelTier = clean(formData.get("aiModelTier"));
  const overagePolicy = clean(formData.get("aiOveragePolicy"));
  return {
    monthlyRequestLimit: optionalNonNegativeInt(formData.get("aiMonthlyRequestLimit")),
    monthlyInputTokenLimit: optionalNonNegativeInt(formData.get("aiMonthlyInputTokenLimit")),
    monthlyOutputTokenLimit: optionalNonNegativeInt(formData.get("aiMonthlyOutputTokenLimit")),
    monthlySpendLimitCentavos: optionalNonNegativeInt(formData.get("aiMonthlySpendLimitCentavos")),
    requestsPerMinute: optionalPositiveInt(formData.get("aiRequestsPerMinute")) ?? 10,
    knowledgeIndexMb: optionalNonNegativeInt(formData.get("aiKnowledgeIndexMb")),
    modelTier: ["ECONOMY", "STANDARD", "PREMIUM"].includes(modelTier) ? modelTier : "STANDARD",
    overagePolicy: ["HARD_STOP", "APPROVAL_REQUIRED"].includes(overagePolicy) ? overagePolicy : "HARD_STOP",
  };
}

async function requirePlatformPlanOperator() {
  const user = await requireUser();
  if (!user.roles.includes(Role.SUPER_ADMIN) && !user.roles.includes(Role.PLATFORM_ADMIN)) redirect("/admin/dashboard");
  return user;
}

function commonPlanFields(formData: FormData) {
  const code = clean(formData.get("code")).toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
  const name = clean(formData.get("name"));
  if (!code || !name) throw new Error("Plan code and name are required.");
  const trialDays = Number(clean(formData.get("trialDays")) || "14");
  if (!Number.isSafeInteger(trialDays) || trialDays < 0 || trialDays > 365) throw new Error("Trial days must be between 0 and 365.");
  return {
    code,
    name,
    description: clean(formData.get("description")) || null,
    currency: (clean(formData.get("currency")) || "PHP").toUpperCase().slice(0, 3),
    monthlyPrice: optionalMoney(formData.get("monthlyPrice")),
    annualPrice: optionalMoney(formData.get("annualPrice")),
    setupFee: optionalMoney(formData.get("setupFee")) ?? 0,
    trialDays,
    maximumUsers: optionalPositiveInt(formData.get("maximumUsers")),
    maximumHomeowners: optionalPositiveInt(formData.get("maximumHomeowners")),
    maximumStorageMb: optionalPositiveInt(formData.get("maximumStorageMb")),
  };
}

function selectedModules(formData: FormData) {
  const selected = new Set(formData.getAll("modules").map(String));
  return Object.values(TenantModule).filter((module) => selected.has(module));
}

function documentFeature(formData: FormData) {
  return {
    enabled: formData.get("documentManagementEnabled") === "on",
    storageLimitMb: optionalPositiveInt(formData.get("documentStorageLimitMb")),
    maxFileSizeMb: optionalPositiveInt(formData.get("documentMaxFileSizeMb")) ?? 25,
    retainRevisionBinaries: formData.get("retainRevisionBinaries") === "on",
    maxRevisionBinaries: optionalPositiveInt(formData.get("maxRevisionBinaries")),
  };
}

export async function createSubscriptionPlanAction(formData: FormData) {
  const actor = await requirePlatformPlanOperator();
  let createdPlanId = "";
  let errorMessage = "";
  try {
    const planFields = commonPlanFields(formData);
    const modules = selectedModules(formData);
    const documentManagement = documentFeature(formData);
    const aiAssistance = { enabled: formData.get("aiAssistanceEnabled") === "on", configuration: aiConfiguration(formData) };
    const pettyCash = { enabled: formData.get("pettyCashEnabled") === "on" };

    const plan = await prisma.$transaction(async (tx) => {
      const created = await tx.subscriptionPlan.create({ data: planFields });
      if (modules.length) await tx.subscriptionPlanModule.createMany({ data: modules.map((module) => ({ planId: created.id, module, enabled: true })) });
      await tx.subscriptionPlanFeatureEntitlement.createMany({
        data: [
          { planId: created.id, featureCode: DOCUMENT_MANAGEMENT_FEATURE_CODE, ...documentManagement },
          { planId: created.id, featureCode: AI_ASSISTANCE_FEATURE_CODE, enabled: aiAssistance.enabled, configuration: aiAssistance.configuration },
          { planId: created.id, featureCode: PETTY_CASH_FEATURE_CODE, enabled: pettyCash.enabled },
        ],
      });
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.id,
          module: "PLATFORM_BILLING",
          action: "PLAN_CREATED",
          entityType: "SubscriptionPlan",
          entityId: created.id,
          metadata: {
            code: created.code,
            name: created.name,
            modules,
            sellableFeatures: { documentManagement, aiAssistance, pettyCash },
          },
        },
      });
      return created;
    });
    createdPlanId = plan.id;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "The plan could not be created.";
  }
  if (errorMessage) redirect(`/platform/plans?error=${encodeURIComponent(errorMessage)}`);
  revalidatePath("/platform/plans");
  redirect(`/platform/plans/${createdPlanId}?success=${encodeURIComponent("Plan created with sellable feature configuration.")}`);
}

export async function updateSubscriptionPlanAction(formData: FormData) {
  const actor = await requirePlatformPlanOperator();
  const planId = clean(formData.get("planId"));
  if (!planId) redirect("/platform/plans?error=Plan%20not%20found.");
  let errorMessage = "";
  try {
    const planFields = commonPlanFields(formData);
    const modules = selectedModules(formData);
    const documentManagement = documentFeature(formData);
    const aiAssistance = { enabled: formData.get("aiAssistanceEnabled") === "on", configuration: aiConfiguration(formData) };
    const pettyCash = { enabled: formData.get("pettyCashEnabled") === "on" };
    const existing = await prisma.subscriptionPlan.findUnique({ where: { id: planId }, include: { modules: true } });
    if (!existing) throw new Error("Subscription plan not found.");
    const existingFeatures = await prisma.subscriptionPlanFeatureEntitlement.findMany({ where: { planId, featureCode: { in: [DOCUMENT_MANAGEMENT_FEATURE_CODE, AI_ASSISTANCE_FEATURE_CODE, PETTY_CASH_FEATURE_CODE] } } });

    await prisma.$transaction(async (tx) => {
      await tx.subscriptionPlan.update({ where: { id: planId }, data: planFields });
      await tx.subscriptionPlanModule.deleteMany({ where: { planId } });
      if (modules.length) await tx.subscriptionPlanModule.createMany({ data: modules.map((module) => ({ planId, module, enabled: true })) });
      await tx.subscriptionPlanFeatureEntitlement.upsert({
        where: { planId_featureCode: { planId, featureCode: DOCUMENT_MANAGEMENT_FEATURE_CODE } },
        update: documentManagement,
        create: { planId, featureCode: DOCUMENT_MANAGEMENT_FEATURE_CODE, ...documentManagement },
      });
      await tx.subscriptionPlanFeatureEntitlement.upsert({
        where: { planId_featureCode: { planId, featureCode: AI_ASSISTANCE_FEATURE_CODE } },
        update: aiAssistance,
        create: { planId, featureCode: AI_ASSISTANCE_FEATURE_CODE, ...aiAssistance },
      });
      await tx.subscriptionPlanFeatureEntitlement.upsert({
        where: { planId_featureCode: { planId, featureCode: PETTY_CASH_FEATURE_CODE } },
        update: pettyCash,
        create: { planId, featureCode: PETTY_CASH_FEATURE_CODE, ...pettyCash },
      });
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.id,
          module: "PLATFORM_BILLING",
          action: "PLAN_UPDATED",
          entityType: "SubscriptionPlan",
          entityId: planId,
          metadata: {
            previous: {
              code: existing.code,
              name: existing.name,
              modules: existing.modules.filter((item) => item.enabled).map((item) => item.module),
              sellableFeatures: existingFeatures.map((feature) => ({ featureCode: feature.featureCode, enabled: feature.enabled, configuration: feature.configuration })),
            },
            updated: {
              code: planFields.code,
              name: planFields.name,
              modules,
              sellableFeatures: { documentManagement, aiAssistance, pettyCash },
            },
            historicalAgreementTermsUnaffected: true,
          },
        },
      });
    });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Plan update failed.";
  }
  if (errorMessage) redirect(`/platform/plans/${encodeURIComponent(planId)}?error=${encodeURIComponent(errorMessage)}`);
  revalidatePath("/platform/plans");
  revalidatePath(`/platform/plans/${planId}`);
  revalidatePath("/platform/document-management");
  revalidatePath("/admin/document-management");
  revalidatePath("/admin/petty-cash");
  redirect(`/platform/plans/${planId}?success=${encodeURIComponent("Subscription plan and sellable features updated.")}`);
}
