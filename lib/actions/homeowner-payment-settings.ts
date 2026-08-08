"use server";

import { SystemSettingCategory } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { HOMEOWNER_PAYMENT_FLOWS, type HomeownerPaymentFlow } from "@/lib/homeowner-payment-flow";
import { HOMEOWNER_PAYMENT_FLOW_KEY, PAYMONGO_LINKED_ACCOUNT_ID_KEY } from "@/lib/services/homeowner-payment-config";

export async function saveHomeownerPaymentSettingsAction(formData: FormData) {
  const admin = await requirePermission(Permission.TENANT_SETTINGS_MANAGE);
  const flow = String(formData.get("flow") || "").trim() as HomeownerPaymentFlow;
  const paymongoLinkedAccountId = String(formData.get("paymongoLinkedAccountId") || "").trim();

  if (!HOMEOWNER_PAYMENT_FLOWS.includes(flow)) {
    redirect("/admin/settings/payments?error=Invalid%20homeowner%20payment%20flow.");
  }
  if (flow === "PAYMONGO") {
    if (!paymongoLinkedAccountId) {
      redirect("/admin/settings/payments?error=Enter%20the%20PayMongo%20linked%20merchant%20account%20ID%20before%20enabling%20online%20payments.");
    }
    if (!process.env.PAYMONGO_HOMEOWNER_SECRET_KEY?.trim() || !process.env.PAYMONGO_HOMEOWNER_WEBHOOK_SECRET?.trim()) {
      redirect("/admin/settings/payments?error=Homeowner%20PayMongo%20server%20credentials%20are%20not%20configured.%20Keep%20Manual%20QR%20enabled%20until%20deployment%20secrets%20are%20ready.");
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const settings = [
        { key: HOMEOWNER_PAYMENT_FLOW_KEY, label: "Homeowner payment flow", value: flow },
        { key: PAYMONGO_LINKED_ACCOUNT_ID_KEY, label: "PayMongo linked merchant account ID", value: paymongoLinkedAccountId },
      ];
      for (const setting of settings) {
        await tx.systemSetting.upsert({
          where: {
            tenantId_category_key: {
              tenantId: admin.tenantId,
              category: SystemSettingCategory.PAYMENT,
              key: setting.key,
            },
          },
          create: {
            tenantId: admin.tenantId,
            category: SystemSettingCategory.PAYMENT,
            key: setting.key,
            label: setting.label,
            value: setting.value || null,
            isSecret: false,
            updatedById: admin.id,
          },
          update: {
            label: setting.label,
            value: setting.value || null,
            updatedById: admin.id,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: admin.tenantId,
          actorId: admin.id,
          module: "PAYMENTS",
          action: "UPDATE_HOMEOWNER_PAYMENT_FLOW",
          entityType: "SystemSetting",
          entityId: HOMEOWNER_PAYMENT_FLOW_KEY,
          metadata: {
            flow,
            paymongoLinkedAccountConfigured: Boolean(paymongoLinkedAccountId),
          },
        },
      });
    });
  } catch (error) {
    redirect(`/admin/settings/payments?error=${encodeURIComponent(error instanceof Error ? error.message : "Payment settings could not be saved.")}`);
  }

  revalidatePath("/admin/settings/payments");
  revalidatePath("/portal/pay");
  redirect(`/admin/settings/payments?success=saved&message=${encodeURIComponent(flow === "PAYMONGO" ? "PayMongo Online is now the only payment flow shown to homeowners for this tenant." : "Manual QR and proof verification is now the only payment flow shown to homeowners for this tenant.")}`);
}
