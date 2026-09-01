"use server";

import { RecurringChargeType, TenantModule } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { isUxActionProgressEnabled } from "@/lib/feature-flags/ux-action-progress";
import { billingGenerationScopes, findEffectiveBillingRule, type BillingGenerationScope } from "@/lib/services/billing-rules";
import { createBillingGenerationJob, processBillingGenerationJob } from "@/lib/services/billing-generation-jobs";

export async function startBillingGenerationJobAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_GENERATE);
  const enabled = isUxActionProgressEnabled({
    tenantId: admin.tenantId,
    module: TenantModule.BILLING,
    role: admin.role,
  });
  if (!enabled) {
    redirect("/admin/billing?error=Durable%20billing%20progress%20is%20currently%20disabled%20for%20this%20tenant.%20Refresh%20the%20page%20before%20trying%20again.");
  }

  let jobId = "";
  try {
    const input = parseGenerationForm(admin, formData);
    await assertManualGenerationAllowed(admin.tenantId, input.coverageYear, input.coverageMonth);
    const idempotencyKey = String(formData.get("idempotencyKey") || "");
    const { job } = await createBillingGenerationJob(input, idempotencyKey);
    jobId = job.id;

    after(async () => {
      await processBillingGenerationJob(job.id, admin).catch(() => undefined);
    });

    revalidatePath("/admin/billing");
  } catch (error) {
    redirect(`/admin/billing?error=${encodeURIComponent(error instanceof Error ? error.message : "Billing generation job could not be started.")}`);
  }
  redirect(`/admin/billing?billingJob=${encodeURIComponent(jobId)}`);
}

async function assertManualGenerationAllowed(tenantId: string, coverageYear: number, coverageMonth: number) {
  const rule = await findEffectiveBillingRule(tenantId, RecurringChargeType.MONTHLY_DUES, coverageYear, coverageMonth);
  if (rule?.generationMode !== "AUTOMATIC") return;
  throw new Error(`Automatic billing is ON for ${periodLabel(coverageYear, coverageMonth)}. Manual billing generation is disabled to prevent duplicate or partial billing. Turn Automatic Billing OFF in Billing Rules before generating manually.`);
}

function parseGenerationForm(admin: Awaited<ReturnType<typeof requirePermission>>, formData: FormData) {
  const coverageYear = Number(formData.get("coverageYear"));
  const coverageMonth = Number(formData.get("coverageMonth"));
  if (!Number.isInteger(coverageYear) || coverageYear < 1900 || coverageYear > 2200) throw new Error("Enter a valid four-digit coverage year.");
  if (!Number.isInteger(coverageMonth) || coverageMonth < 1 || coverageMonth > 12) throw new Error("Choose a coverage month from January through December.");
  const rawScope = String(formData.get("scope") || "ALL");
  const scope = billingGenerationScopes.includes(rawScope as BillingGenerationScope) ? rawScope as BillingGenerationScope : "ALL";
  const homeownerIds = formData.getAll("homeownerIds").map(String).filter(Boolean);
  const individualHomeowner = String(formData.get("homeownerId") || "");
  return {
    actor: admin,
    coverageYear,
    coverageMonth,
    scope,
    homeownerIds: scope === "HOMEOWNER" ? [individualHomeowner].filter(Boolean) : homeownerIds,
    block: String(formData.get("block") || "").trim(),
    phase: String(formData.get("phase") || "").trim(),
  };
}

function periodLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
}
