import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  HomeownerActivationStatus,
  HomeownerEmailVerificationStatus,
  HomeownerStatus,
  Role,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { isValidHomeownerAccountNumber } from "@/lib/services/homeowner-account-number";
import { configurePureHomeownerAccount } from "@/lib/services/homeowner-role-conversion";

const runId = `homeowner-conversion-it-${process.pid}`;
const tenantId = `${runId}-tenant`;
const actorId = `${runId}-actor`;
const repairUserId = `${runId}-repair-user`;
const preserveUserId = `${runId}-preserve-user`;
const createUserId = `${runId}-create-user`;
const preservedAccountNumber = "81234567890";
const suppliedAccountNumber = "92345678901";

async function cleanFixtures() {
  await platformPrisma.notificationLog.deleteMany({ where: { tenantId } });
  await platformPrisma.homeownerEmailVerificationToken.deleteMany({ where: { tenantId } });
  await platformPrisma.homeownerActivationCredential.deleteMany({ where: { tenantId } });
  await platformPrisma.passwordResetToken.deleteMany({ where: { tenantId } });
  await platformPrisma.userSession.deleteMany({ where: { tenantId } });
  await platformPrisma.auditLog.deleteMany({ where: { tenantId } });
  await platformPrisma.homeownerAccountNumberReservation.deleteMany({ where: { tenantId } });
  await platformPrisma.homeownerProfile.deleteMany({ where: { tenantId } });
  await platformPrisma.userRoleAssignment.deleteMany({ where: { tenantId } });
  await platformPrisma.user.deleteMany({ where: { tenantId } });
  await platformPrisma.tenant.deleteMany({ where: { id: tenantId } });
}

before(async () => {
  await cleanFixtures();
  await platformPrisma.tenant.create({
    data: { id: tenantId, name: "Homeowner Conversion Tenant", shortName: "HCT", slug: runId },
  });
  await platformPrisma.user.createMany({
    data: [
      { id: actorId, tenantId, name: "Conversion Actor", email: `${runId}-actor@example.invalid`, passwordHash: "test-only", role: Role.HOA_ADMIN },
      { id: repairUserId, tenantId, name: "Repair User", email: `${runId}-repair@example.invalid`, passwordHash: "old-system-admin-password", role: Role.SYSTEM_ADMIN },
      { id: preserveUserId, tenantId, name: "Preserve User", email: `${runId}-preserve@example.invalid`, passwordHash: "activated-homeowner-password", role: Role.SYSTEM_ADMIN },
      { id: createUserId, tenantId, name: "Create User", email: `${runId}-create@example.invalid`, passwordHash: "old-personnel-password", role: Role.SYSTEM_ADMIN },
    ],
  });
  await platformPrisma.userRoleAssignment.createMany({
    data: [
      { tenantId, userId: actorId, role: Role.HOA_ADMIN, assignedBy: actorId },
      { tenantId, userId: repairUserId, role: Role.SYSTEM_ADMIN, assignedBy: actorId },
      { tenantId, userId: preserveUserId, role: Role.SYSTEM_ADMIN, assignedBy: actorId },
      { tenantId, userId: createUserId, role: Role.SYSTEM_ADMIN, assignedBy: actorId },
    ],
  });
  await platformPrisma.homeownerProfile.createMany({
    data: [
      {
        tenantId,
        userId: repairUserId,
        phone: "09170000001",
        address: "Block 10 Lot 1",
        block: "10",
        lot: "1",
        status: HomeownerStatus.ACTIVE,
        activationStatus: HomeownerActivationStatus.NOT_INVITED,
        emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
        monthlyDuesAmount: 500,
      },
      {
        tenantId,
        userId: preserveUserId,
        phone: "09170000002",
        address: "Block 10 Lot 2",
        block: "10",
        lot: "2",
        accountNumber: preservedAccountNumber,
        status: HomeownerStatus.ACTIVE,
        activationStatus: HomeownerActivationStatus.ACTIVE,
        emailStatus: HomeownerEmailVerificationStatus.VERIFIED,
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        activatedAt: new Date("2026-01-01T00:00:00.000Z"),
        monthlyDuesAmount: 500,
      },
    ],
  });
  await platformPrisma.userSession.create({
    data: {
      tenantId,
      userId: repairUserId,
      tokenHash: `${runId}-session-token`,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    },
  });
});

after(async () => {
  await cleanFixtures();
  await platformPrisma.$disconnect();
});

test("repairing a converted homeowner generates missing account configuration and revokes personnel access", async () => {
  const result = await configurePureHomeownerAccount({ tenantId, userId: repairUserId, actorId });
  assert.equal(result.profileCreated, false);
  assert.equal(result.accountNumberGenerated, true);
  assert.equal(isValidHomeownerAccountNumber(result.accountNumber), true);
  assert.ok(result.activation);

  const user = await platformPrisma.user.findUniqueOrThrow({
    where: { id: repairUserId },
    include: { homeownerProfile: true, userRoleAssignments: true, sessions: true, homeownerActivationCredentials: true },
  });
  assert.equal(user.role, Role.HOMEOWNER);
  assert.notEqual(user.passwordHash, "old-system-admin-password");
  assert.equal(user.userRoleAssignments.some((assignment) => assignment.role === Role.HOMEOWNER && assignment.active), true);
  assert.equal(user.userRoleAssignments.some((assignment) => assignment.role === Role.SYSTEM_ADMIN && assignment.active), false);
  assert.equal(user.sessions.every((session) => session.revokedAt instanceof Date), true);
  assert.equal(user.homeownerProfile?.accountNumber, result.accountNumber);
  assert.equal(user.homeownerProfile?.activationStatus, HomeownerActivationStatus.INVITATION_SENT);
  assert.equal(user.homeownerProfile?.emailStatus, HomeownerEmailVerificationStatus.UNVERIFIED);
  assert.equal(user.homeownerActivationCredentials.length, 1);
});

test("conversion preserves a valid existing account number and completed homeowner activation", async () => {
  const result = await configurePureHomeownerAccount({ tenantId, userId: preserveUserId, actorId });
  assert.equal(result.profileCreated, false);
  assert.equal(result.accountNumberGenerated, false);
  assert.equal(result.accountNumber, preservedAccountNumber);
  assert.equal(result.activation, null);

  const user = await platformPrisma.user.findUniqueOrThrow({
    where: { id: preserveUserId },
    include: { homeownerProfile: true, userRoleAssignments: true },
  });
  assert.equal(user.role, Role.HOMEOWNER);
  assert.equal(user.passwordHash, "activated-homeowner-password");
  assert.equal(user.homeownerProfile?.accountNumber, preservedAccountNumber);
  assert.equal(user.homeownerProfile?.activationStatus, HomeownerActivationStatus.ACTIVE);
  assert.ok(user.homeownerProfile?.activatedAt);
  assert.equal(user.userRoleAssignments.some((assignment) => assignment.role === Role.SYSTEM_ADMIN && assignment.active), false);
});

test("converting personnel without a profile creates all mandatory homeowner records and uses a supplied account number", async () => {
  const result = await configurePureHomeownerAccount({
    tenantId,
    userId: createUserId,
    actorId,
    accountNumber: suppliedAccountNumber,
    profile: {
      phone: "09170000003",
      address: "Block 11 Lot 3",
      block: "11",
      lot: "3",
      phase: "Phase 1",
      propertyType: "HOUSE_AND_LOT",
      occupancyStatus: "OWNER_OCCUPIED",
      status: HomeownerStatus.ACTIVE,
      monthlyDuesAmount: 750,
    },
  });
  assert.equal(result.profileCreated, true);
  assert.equal(result.accountNumberGenerated, false);
  assert.equal(result.accountNumber, suppliedAccountNumber);
  assert.ok(result.activation);

  const user = await platformPrisma.user.findUniqueOrThrow({
    where: { id: createUserId },
    include: { homeownerProfile: true, userRoleAssignments: true, homeownerActivationCredentials: true },
  });
  assert.equal(user.role, Role.HOMEOWNER);
  assert.notEqual(user.passwordHash, "old-personnel-password");
  assert.equal(user.homeownerProfile?.accountNumber, suppliedAccountNumber);
  assert.equal(user.homeownerProfile?.block, "11");
  assert.equal(user.homeownerProfile?.lot, "3");
  assert.equal(user.homeownerProfile?.activationStatus, HomeownerActivationStatus.INVITATION_SENT);
  assert.equal(user.userRoleAssignments.some((assignment) => assignment.role === Role.HOMEOWNER && assignment.active), true);
  assert.equal(user.userRoleAssignments.some((assignment) => assignment.role === Role.SYSTEM_ADMIN && assignment.active), false);
  assert.equal(user.homeownerActivationCredentials.length, 1);
});
