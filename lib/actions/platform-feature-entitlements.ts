"use server";

import { Prisma, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AI_ASSISTANCE_FEATURE_CODE } from "@/lib/ai-assistance/commercial";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DOCUMENT_MANAGEMENT_FEATURE_CODE } from "@/lib/document-repository/constants";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function optionalPositiveInt(value: FormDataEntryValue | null) {
  const raw = clean(value);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error("Feature limits must be positive whole numbers.");
  return parsed;
}

function optionalNonNegativeInt(value: FormDataEntryValue | null) {
  const raw = clean(value);
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("AI limits must be zero or a positive whole number.");
  return parsed;
}

function enabledOverride(value: FormDataEntryValue | null) {
  const mode = clean(value);
  if (mode === "DISABLE") return false;
  if (mode === "INHERIT") return null;
  // Tenant-specific controls are restrictions only. Inclusion must come from the
  // active plan so Platform Admin plan configuration remains authoritative.
  if (mode === "ENABLE") throw new Error("A tenant cannot be force-enabled for a capability excluded from its plan. Add the capability to the plan or assign an eligible plan first.");
  throw new Error("Invalid feature override mode.");
}

async function requirePlatformFeatureOperator() {
  const user = await requireUser();
  if (!user.roles.includes(Role.SUPER_ADMIN) && !user.roles.includes(Role.PLATFORM_ADMIN)) redirect("/admin/dashboard");
  return user;
}

function aiConfigurationOverride(formData: FormData): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  const configuration: Record<string, string | number> = {};
  const requestLimit = optionalNonNegativeInt(formData.get("aiMonthlyRequestLimit"));
  const inputTokens = optionalNonNegativeInt(formData.get("aiMonthlyInputTokenLimit"));
  const outputTokens = optionalNonNegativeInt(formData.get("aiMonthlyOutputTokenLimit"));
  const spendCentavos = optionalNonNegativeInt(formData.get("aiMonthlySpendLimitCentavos"));
  const requestsPerMinute = optionalPositiveInt(formData.get("aiRequestsPerMinute"));
  const knowledgeIndexMb = optionalNonNegativeInt(formData.get("aiKnowledgeIndexMb"));
  const modelTier = clean(formData.get("aiModelTier"));
  const overagePolicy = clean(formData.get("aiOveragePolicy"));

  if (requestLimit !== undefined) configuration.monthlyRequestLimit = requestLimit;
  if (inputTokens !== undefined) configuration.monthlyInputTokenLimit = inputTokens;
  if (outputTokens !== undefined) configuration.monthlyOutputTokenLimit = outputTokens;
  if (spendCentavos !== undefined) configuration.monthlySpendLimitCentavos = spendCentavos;
  if (requestsPerMinute !== null) configuration.requestsPerMinute = requestsPerMinute;
  if (knowledgeIndexMb !== undefined) configuration.knowledgeIndexMb = knowledgeIndexMb;
  if (["ECONOMY", "STANDARD", "PREMIUM"].includes(modelTier)) configuration.modelTier = modelTier;
  if (["HARD_STOP", "APPROVAL_REQUIRED"].includes(overagePolicy)) configuration.overagePolicy = overagePolicy;

  return Object.keys(configuration).length ? configuration : Prisma.JsonNull;
}

export async function updateTenantFeatureEntitlementsAction(formData: FormData) {
  const actor = await requirePlatformFeatureOperator();
  const tenantId = clean(formData.get("tenantId"));
  if (!tenantId) redirect("/platform/tenants?error=Tenant%20not%20found.");

  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
    if (!tenant) throw new Error("Tenant not found.");

    const documentEnabledOverride = enabledOverride(formData.get("documentEnabledOverride"));
    const aiEnabledOverride = enabledOverride(formData.get("aiEnabledOverride"));
    const documentStorageLimitMbOverride = optionalPositiveInt(formData.get("documentStorageLimitMbOverride"));
    const documentMaxFileSizeMbOverride = optionalPositiveInt(formData.get("documentMaxFileSizeMbOverride"));
    const documentMaxRevisionBinariesOverride = optionalPositiveInt(formData.get("documentMaxRevisionBinariesOverride"));
    const retainMode = clean(formData.get("documentRetainRevisionBinariesOverride"));
    const retainRevisionBinariesOverride = retainMode === "ENABLE" ? true : retainMode === "DISABLE" ? false : null;
    const aiConfiguration = aiConfigurationOverride(formData);

    await prisma.$transaction(async (tx) => {
      await tx.tenantFeatureEntitlement.upsert({
        where: { tenantId_featureCode: { tenantId, featureCode: DOCUMENT_MANAGEMENT_FEATURE_CODE } },
        update: {
          enabledOverride: documentEnabledOverride,
          storageLimitMbOverride: documentStorageLimitMbOverride,
          maxFileSizeMbOverride: documentMaxFileSizeMbOverride,
          retainRevisionBinariesOverride,
          maxRevisionBinariesOverride: documentMaxRevisionBinariesOverride,
          updatedById: actor.id,
        },
        create: {
          tenantId,
          featureCode: DOCUMENT_MANAGEMENT_FEATURE_CODE,
          enabledOverride: documentEnabledOverride,
          storageLimitMbOverride: documentStorageLimitMbOverride,
          maxFileSizeMbOverride: documentMaxFileSizeMbOverride,
          retainRevisionBinariesOverride,
          maxRevisionBinariesOverride: documentMaxRevisionBinariesOverride,
          updatedById: actor.id,
        },
      });
      await tx.tenantFeatureEntitlement.upsert({
        where: { tenantId_featureCode: { tenantId, featureCode: AI_ASSISTANCE_FEATURE_CODE } },
        update: {
          enabledOverride: aiEnabledOverride,
          configurationOverride: aiConfiguration,
          updatedById: actor.id,
        },
        create: {
          tenantId,
          featureCode: AI_ASSISTANCE_FEATURE_CODE,
          enabledOverride: aiEnabledOverride,
          configurationOverride: aiConfiguration,
          updatedById: actor.id,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.id,
          module: "PLATFORM_BILLING",
          action: "TENANT_FEATURE_ENTITLEMENTS_UPDATED",
          entityType: "Tenant",
          entityId: tenantId,
          metadata: {
            commercialPolicy: "ACTIVE_PLAN_IS_CAPABILITY_CEILING",
            documentManagement: {
              enabledOverride: documentEnabledOverride,
              storageLimitMbOverride: documentStorageLimitMbOverride,
              maxFileSizeMbOverride: documentMaxFileSizeMbOverride,
              retainRevisionBinariesOverride,
              maxRevisionBinariesOverride: documentMaxRevisionBinariesOverride,
            },
            aiAssistance: {
              enabledOverride: aiEnabledOverride,
              configurationOverride: aiConfiguration === Prisma.JsonNull ? null : aiConfiguration,
            },
            dataPreservation: "Feature disablement does not delete tenant repository or AI audit data.",
          },
        },
      });
    });
  } catch (error) {
    redirect(`/platform/tenants/${encodeURIComponent(tenantId)}/features?error=${encodeURIComponent(error instanceof Error ? error.message : "Feature controls could not be saved.")}`);
  }

  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath(`/platform/tenants/${tenantId}/features`);
  revalidatePath("/platform/document-management");
  revalidatePath("/platform/plans");
  revalidatePath("/admin/document-management");
  revalidatePath("/portal/document-library");
  redirect(`/platform/tenants/${tenantId}/features?success=${encodeURIComponent("Tenant feature restrictions updated.")}`);
}
