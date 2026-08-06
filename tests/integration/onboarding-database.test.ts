import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Role, TenantModule } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { ONBOARDING_HOMEOWNER_COLUMNS } from "@/lib/onboarding/csv";
import { applyOnboardingImport, validateOnboardingImport } from "@/lib/onboarding/import";
import { isHomeownerNoEmailAddress } from "@/lib/services/homeowner-digital-activation";

const runId = `onboarding-it-${process.pid}`;
const tenantAId = `${runId}-tenant-a`;
const tenantBId = `${runId}-tenant-b`;
const adminAId = `${runId}-admin-a`;
const adminBId = `${runId}-admin-b`;
const tenantIds = [tenantAId, tenantBId];
const sharedEmail = `${runId}-shared@example.invalid`;

function csvRows(values: string[][]) {
  return [ONBOARDING_HOMEOWNER_COLUMNS.join(","), ...values.map((row) => row.join(","))].join("\n");
}

const importCsv = csvRows([
  [
    "Imported Homeowner",
    sharedEmail,
    "09171234567",
    "7 Shared Street",
    "7",
    "9",
    "Phase 1",
    "HOUSE_AND_LOT",
    "OWNER_OCCUPIED",
    "ACTIVE",
    "750.25",
    "",
    "1250.50",
    "2026-07-31",
  ],
  [
    "Imported Homeowner Without Email",
    "",
    "09171234568",
    "8 Shared Street",
    "8",
    "10",
    "Phase 1",
    "HOUSE_AND_LOT",
    "OWNER_OCCUPIED",
    "ACTIVE",
    "600.00",
    "",
    "0.00",
    "",
  ],
]);

async function cleanFixtures() {
  await platformPrisma.notificationLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.homeownerEmailVerificationToken.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.homeownerActivationCredential.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.dataMigration.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.bill.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.homeownerAccountNumberReservation.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.systemSetting.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.homeownerProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.userRoleAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenantModuleEntitlement.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

before(async () => {
  await cleanFixtures();
  await platformPrisma.tenant.createMany({
    data: [
      { id: tenantAId, name: "Onboarding Tenant A", shortName: "ON-A", slug: `${runId}-a` },
      { id: tenantBId, name: "Onboarding Tenant B", shortName: "ON-B", slug: `${runId}-b` },
    ],
  });
  await platformPrisma.tenantModuleEntitlement.createMany({
    data: tenantIds.map((tenantId) => ({ tenantId, module: TenantModule.BILLING, enabled: true })),
  });
  await platformPrisma.user.createMany({
    data: [
      { id: adminAId, tenantId: tenantAId, name: "Onboarding Admin A", email: `${runId}-admin-a@example.invalid`, passwordHash: "integration-test-only", role: Role.HOA_ADMIN },
      { id: adminBId, tenantId: tenantBId, name: "Onboarding Admin B", email: `${runId}-admin-b@example.invalid`, passwordHash: "integration-test-only", role: Role.HOA_ADMIN },
    ],
  });
  await platformPrisma.userRoleAssignment.createMany({
    data: [
      { tenantId: tenantAId, userId: adminAId, role: Role.HOA_ADMIN, assignedBy: adminAId },
      { tenantId: tenantBId, userId: adminBId, role: Role.HOA_ADMIN, assignedBy: adminBId },
    ],
  });
  const foreignUser = await platformPrisma.user.create({
    data: {
      tenantId: tenantBId,
      name: "Existing Foreign Homeowner",
      email: sharedEmail,
      passwordHash: "integration-test-only",
      role: Role.HOMEOWNER,
      homeownerProfile: {
        create: {
          tenantId: tenantBId,
          phone: "09170000002",
          address: "7 Shared Street",
          block: "7",
          lot: "9",
          monthlyDuesAmount: 100,
        },
      },
    },
    include: { homeownerProfile: true },
  });
  await platformPrisma.userRoleAssignment.create({
    data: { tenantId: tenantBId, userId: foreignUser.id, role: Role.HOMEOWNER, assignedBy: adminBId },
  });
});

after(async () => {
  await cleanFixtures();
  await platformPrisma.$disconnect();
});

test("dry run is tenant-scoped and accepts a homeowner without email", async () => {
  const validation = await validateOnboardingImport(tenantAId, importCsv);
  assert.equal(validation.validRows, 2);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.rows[1].email, "");
});

test("apply creates activation-only and no-email homeowners atomically", async () => {
  const validation = await validateOnboardingImport(tenantAId, importCsv);
  const result = await applyOnboardingImport({
    tenantId: tenantAId,
    actorId: adminAId,
    csv: importCsv,
    expectedFileHash: validation.fileHash,
    fileName: "pilot-homeowners.csv",
  });
  assert.equal(result.importedRows, 2);
  assert.equal(result.openingBalancesPosted, 1);
  assert.equal(result.activationEmailsAttempted, 1);

  const user = await platformPrisma.user.findFirstOrThrow({
    where: { tenantId: tenantAId, email: sharedEmail },
    include: { homeownerProfile: true, userRoleAssignments: true, homeownerActivationCredentials: true, homeownerEmailVerificationTokens: true },
  });
  assert.equal(user.role, Role.HOMEOWNER);
  assert.match(user.passwordHash, /^\$2[aby]\$/);
  assert.equal(user.homeownerProfile?.activationStatus, "INVITATION_SENT");
  assert.equal(user.homeownerProfile?.emailStatus, "UNVERIFIED");
  assert.match(user.homeownerProfile?.accountNumber ?? "", /^[1-9][0-9]{10}$/);
  assert.equal(user.userRoleAssignments.some((assignment) => assignment.role === Role.HOMEOWNER && assignment.active), true);
  assert.equal(user.homeownerActivationCredentials.length, 1);
  assert.equal(user.homeownerEmailVerificationTokens.length, 1);

  const noEmailUser = await platformPrisma.user.findFirstOrThrow({
    where: { tenantId: tenantAId, homeownerProfile: { block: "8", lot: "10" } },
    include: { homeownerProfile: true, userRoleAssignments: true, homeownerActivationCredentials: true, homeownerEmailVerificationTokens: true },
  });
  assert.equal(isHomeownerNoEmailAddress(noEmailUser.email), true);
  assert.equal(noEmailUser.homeownerProfile?.activationStatus, "NOT_INVITED");
  assert.equal(noEmailUser.homeownerProfile?.emailStatus, "UNVERIFIED");
  assert.equal(noEmailUser.homeownerProfile?.activationSentAt, null);
  assert.match(noEmailUser.homeownerProfile?.accountNumber ?? "", /^[1-9][0-9]{10}$/);
  assert.equal(noEmailUser.userRoleAssignments.some((assignment) => assignment.role === Role.HOMEOWNER && assignment.active), true);
  assert.equal(noEmailUser.homeownerActivationCredentials.length, 0);
  assert.equal(noEmailUser.homeownerEmailVerificationTokens.length, 0);

  const bill = await platformPrisma.bill.findFirstOrThrow({ where: { tenantId: tenantAId, homeownerId: user.homeownerProfile!.id } });
  assert.equal(Number(bill.amount), 1250.5);
  assert.equal(Number(bill.balance), 1250.5);
  assert.equal(bill.coverageYear, 2026);
  assert.equal(bill.coverageMonth, 7);

  const migration = await platformPrisma.dataMigration.findFirstOrThrow({ where: { tenantId: tenantAId, homeownerId: user.homeownerProfile!.id } });
  assert.equal(migration.kind, "DUES_OPENING_BALANCE");
  assert.equal(migration.postedRecordId, bill.id);

  const setting = await platformPrisma.systemSetting.findFirstOrThrow({ where: { tenantId: tenantAId, key: "TENANT_ONBOARDING_V1" } });
  const state = JSON.parse(setting.value ?? "{}") as { import?: { appliedAt?: string; importedRows?: number; openingBalancesPosted?: number } };
  assert.ok(state.import?.appliedAt);
  assert.equal(state.import?.importedRows, 2);
  assert.equal(state.import?.openingBalancesPosted, 1);

  const auditActions = await platformPrisma.auditLog.findMany({ where: { tenantId: tenantAId, module: "ONBOARDING" }, select: { action: true } });
  assert.equal(auditActions.filter((entry) => entry.action === "HOMEOWNER_IMPORTED").length, 2);
  assert.equal(auditActions.some((entry) => entry.action === "HOMEOWNER_IMPORT_APPLIED"), true);

  assert.equal(await platformPrisma.bill.count({ where: { tenantId: tenantBId } }), 0);
  assert.equal(await platformPrisma.dataMigration.count({ where: { tenantId: tenantBId } }), 0);
});

test("replaying an applied file is rejected without creating additional records", async () => {
  const validation = await validateOnboardingImport(tenantAId, importCsv);
  await assert.rejects(
    () => applyOnboardingImport({ tenantId: tenantAId, actorId: adminAId, csv: importCsv, expectedFileHash: validation.fileHash, fileName: "pilot-homeowners.csv" }),
    /validation errors|already been applied/i,
  );
  assert.equal(await platformPrisma.user.count({ where: { tenantId: tenantAId } }), 3);
  assert.equal(await platformPrisma.user.count({ where: { tenantId: tenantAId, email: sharedEmail } }), 1);
  assert.equal(await platformPrisma.bill.count({ where: { tenantId: tenantAId } }), 1);
});
