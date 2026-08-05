"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function confirmOnboardingBillingPreviewAction(formData: FormData) {
  const user = await requireUser();
  if (!user.permissions.includes("billing.preview")) throw new Error("Missing required permission: billing.preview");
  const cycle = String(formData.get("cycle") || "").trim();
  const reason = String(formData.get("reason") || "").trim();
  const confirmed = formData.get("confirm") === "on";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(cycle) || !confirmed || reason.length < 10) {
    redirect("/admin/onboarding?error=Complete%20the%20billing%20preview%20confirmation%20fields.");
  }
  const [activeRules, activeHomeowners] = await Promise.all([
    prisma.billingRule.count({ where: { tenantId: user.tenantId, active: true } }),
    prisma.homeownerProfile.count({ where: { tenantId: user.tenantId, status: "ACTIVE" } }),
  ]);
  if (!activeRules || !activeHomeowners) redirect("/admin/onboarding?error=Configure%20billing%20rules%20and%20import%20active%20homeowners%20before%20confirming%20a%20preview.");
  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      actorId: user.id,
      module: "ONBOARDING",
      action: "BILLING_PREVIEW_CONFIRMED",
      entityType: "Tenant",
      entityId: user.tenantId,
      metadata: { cycle, reason, activeRules, activeHomeowners, generationTriggered: false },
    },
  });
  revalidatePath("/admin/onboarding");
  redirect("/admin/onboarding?success=Billing%20preview%20review%20recorded.%20Generation%20remains%20a%20separate%20action.");
}
