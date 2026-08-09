"use server";

import { Role, SystemSettingCategory } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  HOMEOWNER_PLATFORM_FEE_AMOUNT_CENTAVOS_KEY,
  HOMEOWNER_PLATFORM_FEE_ENABLED_KEY,
  centavosToPesos,
  parsePlatformFeePesos,
} from "@/lib/homeowner-convenience-fee";

async function requirePlatformOwner() {
  const actor = await requireUser();
  if (!actor.roles.includes(Role.SUPER_ADMIN) && !actor.roles.includes(Role.PLATFORM_ADMIN)) {
    redirect("/admin/dashboard");
  }
  return actor;
}

export async function updateTenantHomeownerConvenienceFeeAction(formData: FormData) {
  const actor = await requirePlatformOwner();
  const tenantId = String(formData.get("tenantId") || "").trim();
  const enabled = formData.get("enabled") === "on";
  if (!tenantId) redirect("/platform/tenants?error=Tenant%20is%20required.");

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
  if (!tenant) redirect("/platform/tenants?error=Tenant%20not%20found.");

  let amountCentavos = 0;
  try {
    if (enabled) amountCentavos = parsePlatformFeePesos(formData.get("amountPesos"));
  } catch (error) {
    redirect(`/platform/tenants/${tenantId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Check the convenience fee amount.")}#homeowner-convenience-fee`);
  }

  await prisma.$transaction(async (tx) => {
    const settings = [
      {
        key: HOMEOWNER_PLATFORM_FEE_ENABLED_KEY,
        label: "HOAHub homeowner convenience fee enabled",
        value: enabled ? "true" : "false",
      },
      {
        key: HOMEOWNER_PLATFORM_FEE_AMOUNT_CENTAVOS_KEY,
        label: "HOAHub homeowner convenience fee amount (centavos)",
        value: String(amountCentavos),
      },
    ];

    for (const setting of settings) {
      await tx.systemSetting.upsert({
        where: {
          tenantId_category_key: {
            tenantId,
            category: SystemSettingCategory.PAYMENT,
            key: setting.key,
          },
        },
        create: {
          tenantId,
          category: SystemSettingCategory.PAYMENT,
          key: setting.key,
          label: setting.label,
          value: setting.value,
          isSecret: false,
          updatedById: actor.id,
        },
        update: {
          label: setting.label,
          value: setting.value,
          isSecret: false,
          updatedById: actor.id,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        module: "PLATFORM",
        action: "UPDATE_HOMEOWNER_CONVENIENCE_FEE",
        entityType: "Tenant",
        entityId: tenantId,
        metadata: {
          tenantName: tenant.name,
          enabled,
          amountCentavos,
          amountPesos: centavosToPesos(amountCentavos),
          feeOwner: "HOAHUB_PLATFORM",
        },
      },
    });
  });

  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath("/admin/settings/payments");
  revalidatePath("/portal/pay");
  redirect(`/platform/tenants/${tenantId}?success=fee&message=${encodeURIComponent(enabled ? `HOAHub homeowner convenience fee set to PHP ${centavosToPesos(amountCentavos)}.` : "HOAHub homeowner convenience fee disabled.")}#homeowner-convenience-fee`);
}
