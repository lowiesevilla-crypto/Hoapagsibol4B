import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { HomeownerActivationStatus, Role } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { ONBOARDING_HOMEOWNER_COLUMNS } from "@/lib/onboarding/csv";
import { applyOnboardingImport, validateOnboardingImport } from "@/lib/onboarding/import";

const runId = `onboarding-large-it-${process.pid}`;
const tenantId = `${runId}-tenant`;
const adminId = `${runId}-admin`;

function csvRows(values: string[][]) {
  return [ONBOARDING_HOMEOWNER_COLUMNS.join(","), ...values.map((row) => row.join(","))].join("\n");
}

const largeImportRows = Array.from({ length: 26 }, (_, index) => {
  const ordinal = index + 1;
  return [
    `Large Import Homeowner ${ordinal}`,
    `${runId}-homeowner-${ordinal}@example.invalid`,
    `0917${String(ordinal).padStart(7, "0")}`,
    `${ordinal} Client Scale Street`,
    `B${String(ordinal).padStart(2, "0")}`,
    `L${String(ordinal).padStart(2, "0")}`,
    "Phase 1",
    "HOUSE_AND_LOT",
    "OWNER_OCCUPIED",
    "ACTIVE",
    "500.00",
    "",
    "0.00",
    "",
  ];
});
const largeImportCsv = csvRows(largeImportRows);

async function cleanFixtures() {
  await platformPrisma.notificationLog.deleteMany({ where: { tenantId } });
  await platformPrisma.homeownerEmailVerificationToken.deleteMany({ where: { tenantId } });
  await platformPrisma.homeownerActivationCredential.deleteMany({ where: { tenantId } });
  await platformPrisma.auditLog.deleteMany({ where: { tenantId } });
  await platformPrisma.dataMigration.deleteMany({ where: { tenantId } });
  await platformPrisma.bill.deleteMany({ where: { tenantId } });
  await platformPrisma.homeownerAccountNumberReservation.deleteMany({ where: { tenantId } });
  await platformPrisma.systemSetting.deleteMany({ where: { tenantId } });
  await platformPrisma.homeownerProfile.deleteMany({ where: { tenantId } });
  await platformPrisma.userRoleAssignment.deleteMany({ where: { tenantId } });
  await platformPrisma.user.deleteMany({ where: { tenantId } });
  await platformPrisma.tenant.deleteMany({ where: { id: tenantId } });
}

before(async () => {
  await cleanFixtures();
  await platformPrisma.tenant.create({
    data: { id: tenantId, name: "Large Onboarding Integration HOA", shortName: "LARGE-IT", slug: `${runId}-hoa` },
  });
  await platformPrisma.user.create({
    data: {
      id: adminId,
      tenantId,
      name: "Large Onboarding Admin",
      email: `${runId}-admin@example.invalid`,
      passwordHash: "integration-test-only",
      role: Role.HOA_ADMIN,
    },
  });
  await platformPrisma.userRoleAssignment.create({
    data: { tenantId, userId: adminId, role: Role.HOA_ADMIN, assignedBy: adminId, active: true },
  });
});

after(async () => {
  await cleanFixtures();
  await platformPrisma.$disconnect();
});

test("client-scale apply batches records and defers activation invitations", async () => {
  const validation = await validateOnboardingImport(tenantId, largeImportCsv);
  assert.equal(validation.validRows, 26);
  assert.deepEqual(validation.errors, []);

  const result = await applyOnboardingImport({
    tenantId,
    actorId: adminId,
    csv: largeImportCsv,
    expectedFileHash: validation.fileHash,
    fileName: "client-scale-homeowners.csv",
  });

  assert.equal(result.importedRows, 26);
  assert.equal(result.openingBalancesPosted, 0);
  assert.equal(result.activationEmailsAttempted, 0);
  assert.equal(result.activationInvitationsDeferred, 26);

  const homeowners = await platformPrisma.homeownerProfile.findMany({
    where: { tenantId },
    select: { id: true, accountNumber: true, activationStatus: true, activationSentAt: true, user: { select: { email: true } } },
  });
  assert.equal(homeowners.length, 26);
  assert.equal(homeowners.every((homeowner) => homeowner.activationStatus === HomeownerActivationStatus.NOT_INVITED), true);
  assert.equal(homeowners.every((homeowner) => homeowner.activationSentAt === null), true);
  assert.equal(new Set(homeowners.map((homeowner) => homeowner.accountNumber)).size, 26);
  assert.equal(homeowners.every((homeowner) => /^[1-9][0-9]{10}$/.test(homeowner.accountNumber ?? "")), true);

  assert.equal(await platformPrisma.homeownerAccountNumberReservation.count({ where: { tenantId } }), 26);
  assert.equal(await platformPrisma.homeownerActivationCredential.count({ where: { tenantId } }), 0);
  assert.equal(await platformPrisma.homeownerEmailVerificationToken.count({ where: { tenantId } }), 0);
  assert.equal(await platformPrisma.notificationLog.count({ where: { tenantId } }), 0);

  const setting = await platformPrisma.systemSetting.findFirstOrThrow({ where: { tenantId, key: "TENANT_ONBOARDING_V1" } });
  const state = JSON.parse(setting.value ?? "{}") as { import?: { appliedAt?: string; importedRows?: number; activationInvitationsDeferred?: number } };
  assert.ok(state.import?.appliedAt);
  assert.equal(state.import?.importedRows, 26);
  assert.equal(state.import?.activationInvitationsDeferred, 26);

  const importAudits = await platformPrisma.auditLog.count({ where: { tenantId, module: "ONBOARDING", action: "HOMEOWNER_IMPORTED" } });
  assert.equal(importAudits, 26);
});
