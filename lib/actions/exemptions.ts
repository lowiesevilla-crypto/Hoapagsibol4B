"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { duesExemptionSchema } from "@/lib/validation";

export async function saveDuesExemptionAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const parsed = duesExemptionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid exemption details.");
  const data = parsed.data;
  const billingMonth = new Date(`${data.billingMonth}-01T00:00:00.000Z`);
  const existingBill = await prisma.bill.findUnique({ where: { homeownerId_billingMonth: { homeownerId: data.homeownerId, billingMonth } } });
  if (existingBill) throw new Error("A bill already exists for this homeowner and month. Delete the unpaid bill before adding an exemption.");
  await prisma.duesExemption.upsert({
    where: { homeownerId_billingMonth: { homeownerId: data.homeownerId, billingMonth } },
    update: { reason: data.reason, createdById: admin.id },
    create: { homeownerId: data.homeownerId, billingMonth, reason: data.reason, createdById: admin.id },
  });
  revalidatePath("/admin/billing");
  redirect("/admin/billing?success=exempted");
}

export async function deleteDuesExemptionAction(formData: FormData) {
  await requireUser(Role.ADMIN);
  await prisma.duesExemption.delete({ where: { id: String(formData.get("id") || "") } });
  revalidatePath("/admin/billing");
  redirect("/admin/billing?success=deleted&message=Monthly%20dues%20exemption%20removed%20successfully.");
}
