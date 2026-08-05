"use server";

import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { contractorSchema } from "@/lib/validation";

export async function saveContractorAction(formData: FormData) {
  await requirePermission(Permission.PROPERTIES_MANAGE);
  const parsed = contractorSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid contractor details.");
  const { id, email, licenseNumber, ...data } = parsed.data;
  const values = { ...data, email: email || null, licenseNumber: licenseNumber || null };

  if (id) {
    const existing = await prisma.contractorProfile.findUnique({ where: { id } });
    if (!existing) throw new Error("Contractor not found.");
    await prisma.contractorProfile.update({ where: { id }, data: values });
  } else {
    await prisma.contractorProfile.create({ data: values });
  }

  revalidatePath("/admin/contractors");
  redirect("/admin/contractors?success=saved");
}

export async function deleteContractorAction(formData: FormData) {
  await requirePermission(Permission.PROPERTIES_MANAGE);
  const id = String(formData.get("id") || "");
  const contractor = await prisma.contractorProfile.findUnique({ where: { id }, select: { _count: { select: { collections: true } } } });
  if (!contractor) throw new Error("Contractor not found.");
  if (contractor._count.collections) throw new Error("A contractor with collection history cannot be deleted. Mark the profile inactive instead.");
  await prisma.contractorProfile.delete({ where: { id } });
  revalidatePath("/admin/contractors");
  redirect("/admin/contractors?success=deleted");
}
