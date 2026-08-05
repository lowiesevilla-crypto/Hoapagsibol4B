"use server";

import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";
import { RecurringChargeType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { duesExemptionSchema } from "@/lib/validation";

export async function saveDuesExemptionAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_CONFIGURE);
  const parsed = duesExemptionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid exemption details.");
  const data = parsed.data;
  const billingMonth = new Date(`${data.billingMonth}-01T00:00:00.000Z`);
  const homeowner = await prisma.homeownerProfile.findFirst({ where: { id: data.homeownerId, tenantId: admin.tenantId }, select: { id: true } });
  if (!homeowner) throw new Error("Homeowner not found or access denied.");
  const existingBill = await prisma.bill.findFirst({ where: { tenantId: admin.tenantId, homeownerId: homeowner.id, billingMonth } });
  if (existingBill) throw new Error("A bill already exists for this homeowner and month. Delete the unpaid bill before adding an exemption.");
  await prisma.duesExemption.upsert({
    where: { homeownerId_billingMonth: { homeownerId: homeowner.id, billingMonth } },
    update: { tenantId: admin.tenantId, recurringChargeType: RecurringChargeType.MONTHLY_DUES, reason: data.reason, createdById: admin.id, active: true, startYear: billingMonth.getUTCFullYear(), startMonth: billingMonth.getUTCMonth() + 1, endYear: billingMonth.getUTCFullYear(), endMonth: billingMonth.getUTCMonth() + 1 },
    create: { tenantId: admin.tenantId, homeownerId: homeowner.id, billingMonth, recurringChargeType: RecurringChargeType.MONTHLY_DUES, startYear: billingMonth.getUTCFullYear(), startMonth: billingMonth.getUTCMonth() + 1, endYear: billingMonth.getUTCFullYear(), endMonth: billingMonth.getUTCMonth() + 1, reason: data.reason, createdById: admin.id },
  });
  revalidatePath("/admin/billing");
  redirect("/admin/billing?success=exempted");
}

export async function deleteDuesExemptionAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_CONFIGURE);
  const exemption = await prisma.duesExemption.findFirst({ where: { id: String(formData.get("id") || ""), tenantId: admin.tenantId, active: true }, select: { id: true } });
  if (!exemption) throw new Error("Exemption not found or access denied.");
  await prisma.duesExemption.update({ where: { id: exemption.id }, data: { active: false, updatedById: admin.id, deactivatedById: admin.id, deactivatedAt: new Date() } });
  revalidatePath("/admin/billing");
  redirect("/admin/billing?success=deactivated&message=Monthly%20dues%20exemption%20deactivated.%20History%20was%20preserved.");
}
