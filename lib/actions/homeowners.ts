"use server";

import { randomUUID } from "node:crypto";
import { HomeownerActivationStatus, HomeownerEmailVerificationStatus, Prisma, Role, type HomeownerStatus } from "@prisma/client";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { homeownerSchema } from "@/lib/validation";
import { generateUniqueHomeownerAccountNumber } from "@/lib/services/homeowner-account-number";
import { createHomeownerActivationCredential, sendHomeownerActivationEmail } from "@/lib/services/homeowner-activation";

export async function saveHomeownerAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const parsed = homeownerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid homeowner details.");
  const data = parsed.data;

  if (data.id) {
    const existing = await prisma.homeownerProfile.findFirst({ where: { id: data.id, tenantId: admin.tenantId }, select: { userId: true } });
    if (!existing) throw new Error("Homeowner not found.");
    await prisma.$transaction([
      prisma.user.update({
        where: { id: existing.userId },
        data: {
          name: data.name,
          email: data.email,
          ...(data.password ? { passwordHash: await hash(data.password, 12) } : {}),
        },
      }),
      prisma.homeownerProfile.update({
        where: { tenantId_id: { tenantId: admin.tenantId, id: data.id } },
        data: {
          phone: data.phone,
          birthDate: optionalProfileDate(data.birthDate),
          civilStatus: data.civilStatus || null,
          citizenship: data.citizenship || null,
          occupation: data.occupation || null,
          residencyDate: optionalProfileDate(data.residencyDate),
          phase: data.phase || null,
          propertyType: data.propertyType || null,
          occupancyStatus: data.occupancyStatus || null,
          address: data.address,
          block: data.block,
          lot: data.lot,
          messengerId: data.messengerId || null,
          status: data.status,
          monthlyDuesAmount: data.monthlyDuesAmount,
        },
      }),
    ]);
  } else {
    const created = await createHomeownerWithAccountNumber({
      name: data.name,
      email: data.email,
      tenantId: admin.tenantId,
      createdById: admin.id,
      profile: {
        phone: data.phone,
        birthDate: optionalProfileDate(data.birthDate),
        civilStatus: data.civilStatus || null,
        citizenship: data.citizenship || null,
        occupation: data.occupation || null,
        residencyDate: optionalProfileDate(data.residencyDate),
        phase: data.phase || null,
        propertyType: data.propertyType || null,
        occupancyStatus: data.occupancyStatus || null,
        address: data.address,
        block: data.block,
        lot: data.lot,
        messengerId: data.messengerId || null,
        status: data.status,
        monthlyDuesAmount: data.monthlyDuesAmount,
      },
    });
    await sendHomeownerActivationEmail({
      tenantId: admin.tenantId,
      userId: created.user.id,
      email: created.email,
      name: created.name,
      accountNumber: created.accountNumber,
      temporaryPassword: created.activation.temporaryPassword,
      expiresAt: created.activation.expiresAt,
      actorId: admin.id,
    });
  }

  revalidatePath("/admin/homeowners");
  redirect(data.id ? "/admin/homeowners?success=saved&message=Homeowner%20record%20updated%20successfully." : "/admin/homeowners?success=created&message=Homeowner%20record%20created%20and%20activation%20email%20queued.");
}

async function createHomeownerWithAccountNumber(input: {
  name: string;
  email: string;
  tenantId: string;
  createdById: string;
  profile: {
    phone: string;
    birthDate: Date | null;
    civilStatus: string | null;
    citizenship: string | null;
    occupation: string | null;
    residencyDate: Date | null;
    phase: string | null;
    propertyType: string | null;
    occupancyStatus: string | null;
    address: string;
    block: string;
    lot: string;
    messengerId: string | null;
    status: HomeownerStatus;
    monthlyDuesAmount: Prisma.Decimal | string | number;
  };
}) {
  for (let attempt = 1; attempt <= 20; attempt++) {
    const accountNumber = await generateUniqueHomeownerAccountNumber();
    try {
      return await prisma.$transaction(async (tx) => {
        const passwordHash = await hash(generateSystemPasswordPlaceholder(), 12);
        const user = await tx.user.create({
          data: {
            name: input.name,
            email: input.email,
            tenantId: input.tenantId,
            passwordHash,
            role: Role.HOMEOWNER,
            homeownerProfile: {
              create: {
                ...input.profile,
                tenantId: input.tenantId,
                accountNumber,
                activationStatus: HomeownerActivationStatus.PENDING_ACTIVATION,
                emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
                activationSentAt: new Date(),
              },
            },
          },
          include: { homeownerProfile: true },
        });
        await tx.homeownerAccountNumberReservation.create({
          data: { tenantId: input.tenantId, homeownerId: user.homeownerProfile?.id, accountNumber, reason: "ASSIGNED" },
        });
        const activation = await createHomeownerActivationCredential({ tenantId: input.tenantId, userId: user.id, createdById: input.createdById, tx });
        await tx.auditLog.create({
          data: {
            tenantId: input.tenantId,
            actorId: input.createdById,
            module: "AUTH",
            action: "HOMEOWNER_ACTIVATION_CREATED",
            entityType: "User",
            entityId: user.id,
            metadata: { accountNumber },
          },
        });
        return { user, activation, id: user.id, email: user.email, name: user.name, accountNumber };
      });
    } catch (error) {
      if (isUniqueAccountNumberCollision(error)) continue;
      throw error;
    }
  }
  throw new Error("Unable to allocate a unique homeowner account number.");
}

function optionalProfileDate(value?: string) { return value ? new Date(`${value}T00:00:00.000Z`) : null; }

function generateSystemPasswordPlaceholder() {
  return `activation-only-${randomUUID()}`;
}

function isUniqueAccountNumberCollision(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function deleteHomeownerAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const id = String(formData.get("id") || "");
  const profile = await prisma.homeownerProfile.findFirst({ where: { id, tenantId: admin.tenantId }, select: { userId: true, _count: { select: { collections: true } } } });
  if (!profile) throw new Error("Homeowner not found.");
  if (profile._count.collections) throw new Error("A homeowner with collection history cannot be deleted. Mark the profile inactive instead.");
  await prisma.user.delete({ where: { id: profile.userId } });
  revalidatePath("/admin/homeowners");
  redirect("/admin/homeowners?success=deleted");
}
