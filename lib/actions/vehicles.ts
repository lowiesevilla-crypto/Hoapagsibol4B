"use server";

import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";
import { CollectionType, PayerType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { vehicleSchema } from "@/lib/validation";

export async function saveVehicleAction(formData: FormData) {
  await requirePermission(Permission.PROPERTIES_MANAGE);
  const parsed = vehicleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid vehicle details.");
  const data = parsed.data;
  const collectionId = data.stickerCollectionId || null;
  if (collectionId) {
    const sticker = await prisma.collection.findFirst({ where: { id: collectionId, type: CollectionType.STICKER, payerType: PayerType.HOMEOWNER, homeownerId: data.homeownerId } });
    if (!sticker) throw new Error("The selected sticker payment does not belong to this homeowner.");
    const alreadyLinked = await prisma.vehicle.findFirst({ where: { stickerCollectionId: collectionId, id: data.id ? { not: data.id } : undefined } });
    if (alreadyLinked) throw new Error("That sticker payment is already linked to another vehicle.");
  }
  const values = {
    homeownerId: data.homeownerId,
    plateNumber: data.plateNumber,
    vehicleType: data.vehicleType,
    make: data.make,
    model: data.model,
    color: data.color,
    stickerNumber: data.stickerNumber,
    stickerCollectionId: collectionId,
    issuedAt: new Date(`${data.issuedAt}T00:00:00.000Z`),
    expiresAt: data.expiresAt ? new Date(`${data.expiresAt}T00:00:00.000Z`) : null,
    status: data.status,
    remarks: data.remarks || null,
  };
  if (data.id) await prisma.vehicle.update({ where: { id: data.id }, data: values });
  else await prisma.vehicle.create({ data: values });
  revalidatePath("/admin/vehicles");
  revalidatePath("/portal/vehicles");
  redirect("/admin/vehicles?success=saved&message=Vehicle%20and%20sticker%20record%20saved%20successfully.");
}

export async function deleteVehicleAction(formData: FormData) {
  await requirePermission(Permission.PROPERTIES_MANAGE);
  await prisma.vehicle.delete({ where: { id: String(formData.get("id") || "") } });
  revalidatePath("/admin/vehicles");
  revalidatePath("/portal/vehicles");
  redirect("/admin/vehicles?success=deleted&message=Vehicle%20record%20deleted%20successfully.");
}
