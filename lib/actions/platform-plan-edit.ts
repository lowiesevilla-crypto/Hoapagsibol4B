"use server";

import { Role, TenantModule } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error("Plan limits must be positive whole numbers.");
  return parsed;
}

async function requirePlatformPlanUser() {
  const user = await requireUser();
  if (!user.roles.includes(Role.SUPER_ADMIN) && !user.roles.includes(Role.PLATFORM_ADMIN)) redirect("/admin/dashboard");
  return user;
}

export async function updateSubscriptionPlanAction(formData: FormData) {
  const actor = await requirePlatformPlanUser();
  const planId = clean(formData.get("planId"));
  const code = clean(formData.get("code")).toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
  const name = clean(formData.get("name"));
  if (!planId || !code || !name) redirect(`/platform/plans/${encodeURIComponent(planId)}?error=Plan%20code%20and%20name%20are%20required.`);

  try {
    const existing = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      include: { modules: true },
    });
    if (!existing) throw new Error("Subscription plan not found.");

    const trialDays = Number(clean(formData.get("trialDays")) || "0");
    if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) throw new Error("Trial days must be between 0 and 365.");
    const setupFee = optionalMoney(formData.get("setupFee")) ?? 0;
    const modules = new Set(formData.getAll("modules").map(String));
    const enabledModules = Object.values(TenantModule).filter((module) => modules.has(module));

    await prisma.$transaction(async (tx) => {
      await tx.subscriptionPlan.update({
        where: { id: existing.id },
        data: {
          code,
          name,
          description: clean(formData.get("description")) || null,
          currency: (clean(formData.get("currency")) || "PHP").toUpperCase().slice(0, 3),
          monthlyPrice: optionalMoney(formData.get("monthlyPrice")),
          annualPrice: optionalMoney(formData.get("annualPrice")),
          setupFee,
          trialDays,
          maximumUsers: optionalPositiveInt(formData.get("maximumUsers")),
          maximumHomeowners: optionalPositiveInt(formData.get("maximumHomeowners")),
          maximumStorageMb: optionalPositiveInt(formData.get("maximumStorageMb")),
        },
      });
      await tx.subscriptionPlanModule.deleteMany({ where: { planId: existing.id } });
      if (enabledModules.length) {
        await tx.subscriptionPlanModule.createMany({
          data: enabledModules.map((module) => ({ planId: existing.id, module, enabled: true })),
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.id,
          module: "PLATFORM_BILLING",
          action: "PLAN_UPDATED",
          entityType: "SubscriptionPlan",
          entityId: existing.id,
          metadata: {
            previous: {
              code: existing.code,
              name: existing.name,
              monthlyPrice: existing.monthlyPrice?.toString() ?? null,
              annualPrice: existing.annualPrice?.toString() ?? null,
              setupFee: existing.setupFee.toString(),
              trialDays: existing.trialDays,
              modules: existing.modules.filter((item) => item.enabled).map((item) => item.module),
            },
            updated: {
              code,
              name,
              monthlyPrice: optionalMoney(formData.get("monthlyPrice")),
              annualPrice: optionalMoney(formData.get("annualPrice")),
              setupFee,
              trialDays,
              modules: enabledModules,
            },
            historicalAgreementTermsUnaffected: true,
          },
        },
      });
    });
  } catch (error) {
    redirect(`/platform/plans/${encodeURIComponent(planId)}?error=${encodeURIComponent(error instanceof Error ? error.message : "Plan update failed.")}`);
  }

  revalidatePath("/platform/plans");
  revalidatePath(`/platform/plans/${planId}`);
  redirect(`/platform/plans/${planId}?success=Subscription%20plan%20updated.`);
}
