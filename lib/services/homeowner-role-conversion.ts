import "server-only";

import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import {
  HomeownerActivationStatus,
  HomeownerEmailVerificationStatus,
  HomeownerStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { effectiveRolesForUser } from "@/lib/authorization/effective-access";
import { platformPrisma } from "@/lib/db";
import {
  ensureHomeownerAccountNumber,
  generateUniqueHomeownerAccountNumber,
  isValidHomeownerAccountNumber,
} from "@/lib/services/homeowner-account-number";
import {
  createHomeownerActivationCredential,
  type ActivationCredentialResult,
} from "@/lib/services/homeowner-activation";
import {
  hasHomeownerContactEmail,
  homeownerHasCompletedDigitalActivation,
  maskAccountNumber,
} from "@/lib/services/homeowner-digital-activation";

export type HomeownerConversionProfileInput = {
  phone: string;
  address: string;
  block: string;
  lot: string;
  phase?: string | null;
  propertyType?: string | null;
  occupancyStatus?: string | null;
  status: HomeownerStatus;
  monthlyDuesAmount: Prisma.Decimal | string | number;
};

export type PureHomeownerConfigurationResult = {
  profileId: string;
  accountNumber: string;
  accountNumberGenerated: boolean;
  profileCreated: boolean;
  activation: ActivationCredentialResult | null;
  invitation: {
    tenantId: string;
    userId: string;
    name: string;
    email: string;
    accountNumber: string;
  } | null;
};

function systemPasswordPlaceholder() {
  return `activation-only-${randomUUID()}`;
}

function isUniqueCollision(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function configurePureHomeownerAccount(input: {
  tenantId: string;
  userId: string;
  actorId: string;
  profile?: HomeownerConversionProfileInput;
  accountNumber?: string | null;
  maxAccountAttempts?: number;
}): Promise<PureHomeownerConfigurationResult> {
  const maxAttempts = input.maxAccountAttempts ?? 20;
  const user = await platformPrisma.user.findFirst({
    where: { tenantId: input.tenantId, id: input.userId },
    include: { homeownerProfile: true, userRoleAssignments: true },
  });
  if (!user) throw new Error("Tenant user not found.");
  if (!user.homeownerProfile && !input.profile) {
    throw new Error("Complete the required homeowner property and dues fields before assigning the Homeowner role.");
  }

  const oldRoles = effectiveRolesForUser(user.role, user.userRoleAssignments);
  const profileWasCreated = !user.homeownerProfile;
  const suppliedAccountNumber = String(input.accountNumber || "").trim();
  if (suppliedAccountNumber && !isValidHomeownerAccountNumber(suppliedAccountNumber)) {
    throw new Error("Account number must contain exactly 11 digits and cannot begin with zero.");
  }

  if (!profileWasCreated) {
    const oldAccountNumber = user.homeownerProfile!.accountNumber;
    const accountNumber = await ensureHomeownerAccountNumber(user.homeownerProfile!);
    const accountNumberGenerated = oldAccountNumber !== accountNumber;
    return configureExistingProfile({
      tenantId: input.tenantId,
      userId: input.userId,
      actorId: input.actorId,
      profileId: user.homeownerProfile!.id,
      accountNumber,
      accountNumberGenerated,
      oldRoles,
    });
  }

  const duplicateProperty = await platformPrisma.homeownerProfile.findFirst({
    where: {
      tenantId: input.tenantId,
      block: input.profile!.block,
      lot: input.profile!.lot,
    },
    select: { id: true },
  });
  if (duplicateProperty) throw new Error("A homeowner profile already uses this block and lot in the tenant.");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const accountNumber = suppliedAccountNumber || await generateUniqueHomeownerAccountNumber();
    if (suppliedAccountNumber) {
      const [existingProfile, existingReservation] = await Promise.all([
        platformPrisma.homeownerProfile.findUnique({ where: { accountNumber }, select: { id: true } }),
        platformPrisma.homeownerAccountNumberReservation.findUnique({ where: { accountNumber }, select: { id: true } }),
      ]);
      if (existingProfile || existingReservation) throw new Error("The supplied homeowner account number is already assigned or reserved.");
    }

    try {
      const changedAt = new Date();
      const contactEmail = hasHomeownerContactEmail(user.email);
      const invite = contactEmail && user.active && input.profile!.status === HomeownerStatus.ACTIVE;
      const passwordHash = await hash(systemPasswordPlaceholder(), 12);
      return await platformPrisma.$transaction(async (tx) => {
        const freshUser = await tx.user.findFirst({
          where: { tenantId: input.tenantId, id: input.userId, homeownerProfile: null },
          select: { id: true },
        });
        if (!freshUser) throw new Error("The user already has a homeowner profile or no longer exists.");

        const profile = await tx.homeownerProfile.create({
          data: {
            tenantId: input.tenantId,
            userId: input.userId,
            phone: input.profile!.phone,
            address: input.profile!.address,
            block: input.profile!.block,
            lot: input.profile!.lot,
            phase: input.profile!.phase || null,
            propertyType: input.profile!.propertyType || null,
            occupancyStatus: input.profile!.occupancyStatus || null,
            status: input.profile!.status,
            monthlyDuesAmount: input.profile!.monthlyDuesAmount,
            accountNumber,
            activationStatus: invite ? HomeownerActivationStatus.INVITATION_SENT : HomeownerActivationStatus.NOT_INVITED,
            emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
            activationSentAt: invite ? changedAt : null,
          },
        });
        await tx.homeownerAccountNumberReservation.create({
          data: { tenantId: input.tenantId, homeownerId: profile.id, accountNumber, reason: "ASSIGNED" },
        });
        await replaceWithPureHomeownerRole(tx, {
          tenantId: input.tenantId,
          userId: input.userId,
          actorId: input.actorId,
          changedAt,
          passwordHash,
        });
        const activation = invite
          ? await createHomeownerActivationCredential({
              tenantId: input.tenantId,
              userId: input.userId,
              createdById: input.actorId,
              tx,
            })
          : null;
        await tx.auditLog.create({
          data: {
            tenantId: input.tenantId,
            actorId: input.actorId,
            module: "AUTHORIZATION",
            action: "TENANT_USER_CONVERTED_TO_HOMEOWNER",
            entityType: "User",
            entityId: input.userId,
            metadata: {
              oldRoles,
              newRoles: [Role.HOMEOWNER],
              homeownerProfileId: profile.id,
              profileCreated: true,
              accountNumberGenerated: !suppliedAccountNumber,
              accountMasked: maskAccountNumber(accountNumber),
              activationInvitationCreated: Boolean(activation),
            },
          },
        });
        return {
          profileId: profile.id,
          accountNumber,
          accountNumberGenerated: !suppliedAccountNumber,
          profileCreated: true,
          activation,
          invitation: activation
            ? { tenantId: input.tenantId, userId: input.userId, name: user.name, email: user.email, accountNumber }
            : null,
        };
      });
    } catch (error) {
      if (!suppliedAccountNumber && isUniqueCollision(error)) continue;
      throw error;
    }
  }

  throw new Error("Unable to allocate a unique homeowner account number after multiple attempts.");
}

async function configureExistingProfile(input: {
  tenantId: string;
  userId: string;
  actorId: string;
  profileId: string;
  accountNumber: string;
  accountNumberGenerated: boolean;
  oldRoles: Role[];
}): Promise<PureHomeownerConfigurationResult> {
  const record = await platformPrisma.homeownerProfile.findFirst({
    where: { tenantId: input.tenantId, id: input.profileId, userId: input.userId },
    include: { user: true },
  });
  if (!record) throw new Error("Homeowner profile not found.");

  const completedActivation = homeownerHasCompletedDigitalActivation(record);
  const changedAt = new Date();
  const contactEmail = hasHomeownerContactEmail(record.user.email);
  const invite = !completedActivation && contactEmail && record.user.active && record.status === HomeownerStatus.ACTIVE;
  const passwordHash = completedActivation ? null : await hash(systemPasswordPlaceholder(), 12);

  return platformPrisma.$transaction(async (tx) => {
    await replaceWithPureHomeownerRole(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      actorId: input.actorId,
      changedAt,
      passwordHash,
    });

    if (!completedActivation) {
      await tx.homeownerActivationCredential.updateMany({
        where: { tenantId: input.tenantId, userId: input.userId, usedAt: null, revokedAt: null },
        data: { revokedAt: changedAt },
      });
      await tx.homeownerEmailVerificationToken.updateMany({
        where: { tenantId: input.tenantId, userId: input.userId, usedAt: null },
        data: { usedAt: changedAt },
      });
      await tx.homeownerProfile.update({
        where: { tenantId_id: { tenantId: input.tenantId, id: input.profileId } },
        data: {
          activationStatus: invite ? HomeownerActivationStatus.INVITATION_SENT : HomeownerActivationStatus.NOT_INVITED,
          emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
          emailVerifiedAt: null,
          activationSentAt: invite ? changedAt : null,
          activatedAt: null,
        },
      });
    }

    const activation = invite
      ? await createHomeownerActivationCredential({
          tenantId: input.tenantId,
          userId: input.userId,
          createdById: input.actorId,
          tx,
        })
      : null;
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        module: "AUTHORIZATION",
        action: "HOMEOWNER_ROLE_CONFIGURATION_REPAIRED",
        entityType: "HomeownerProfile",
        entityId: input.profileId,
        metadata: {
          oldRoles: input.oldRoles,
          newRoles: [Role.HOMEOWNER],
          profileCreated: false,
          accountNumberGenerated: input.accountNumberGenerated,
          accountMasked: maskAccountNumber(input.accountNumber),
          completedActivationPreserved: completedActivation,
          activationInvitationCreated: Boolean(activation),
        },
      },
    });
    return {
      profileId: input.profileId,
      accountNumber: input.accountNumber,
      accountNumberGenerated: input.accountNumberGenerated,
      profileCreated: false,
      activation,
      invitation: activation
        ? {
            tenantId: input.tenantId,
            userId: input.userId,
            name: record.user.name,
            email: record.user.email,
            accountNumber: input.accountNumber,
          }
        : null,
    };
  });
}

async function replaceWithPureHomeownerRole(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    userId: string;
    actorId: string;
    changedAt: Date;
    passwordHash: string | null;
  },
) {
  await tx.userRoleAssignment.upsert({
    where: {
      tenantId_userId_role: {
        tenantId: input.tenantId,
        userId: input.userId,
        role: Role.HOMEOWNER,
      },
    },
    update: { active: true, assignedBy: input.actorId, assignedAt: input.changedAt },
    create: {
      tenantId: input.tenantId,
      userId: input.userId,
      role: Role.HOMEOWNER,
      active: true,
      assignedBy: input.actorId,
      assignedAt: input.changedAt,
    },
  });
  await tx.userRoleAssignment.updateMany({
    where: {
      tenantId: input.tenantId,
      userId: input.userId,
      role: { not: Role.HOMEOWNER },
      active: true,
    },
    data: { active: false },
  });
  await tx.user.update({
    where: { id: input.userId },
    data: {
      role: Role.HOMEOWNER,
      ...(input.passwordHash ? { passwordHash: input.passwordHash } : {}),
    },
  });
  await tx.userSession.updateMany({
    where: { tenantId: input.tenantId, userId: input.userId, revokedAt: null },
    data: { revokedAt: input.changedAt },
  });
  if (input.passwordHash) {
    await Promise.all([
      tx.userPasskeyCredential.deleteMany({ where: { tenantId: input.tenantId, userId: input.userId } }),
      tx.userPasskeyChallenge.deleteMany({ where: { tenantId: input.tenantId, userId: input.userId } }),
      tx.passwordResetToken.deleteMany({ where: { tenantId: input.tenantId, userId: input.userId } }),
    ]);
  }
}
