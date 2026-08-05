import { PrismaClient, Role, TenantModule } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const primaryTenantId = "e2e_onboarding_primary_tenant";
const secondaryTenantId = "e2e_onboarding_secondary_tenant";
const primaryTenantSlug = "ci-onboarding-primary";
const secondaryTenantSlug = "ci-onboarding-secondary";
const administratorId = "e2e_onboarding_administrator";
const restrictedUserId = "e2e_onboarding_restricted_staff";
const secondaryHomeownerUserId = "e2e_onboarding_secondary_homeowner_user";
const secondaryHomeownerId = "e2e_onboarding_secondary_homeowner";
const importedEmail = process.env.E2E_ONBOARDING_HOMEOWNER_EMAIL || "ci-onboarding-homeowner@example.invalid";
const administratorEmail = process.env.E2E_ONBOARDING_ADMIN_EMAIL || "ci-onboarding-admin@example.invalid";
const restrictedEmail = process.env.E2E_ONBOARDING_RESTRICTED_EMAIL || "ci-onboarding-restricted@example.invalid";
const password = process.env.E2E_ONBOARDING_PASSWORD || "CI-Onboarding-Password-2026!";
const tenantIds = [primaryTenantId, secondaryTenantId];
const fixtureUserIds = [administratorId, restrictedUserId, secondaryHomeownerUserId];

function assertSafeDatabase() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error(
      "Onboarding browser fixtures are restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.",
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for onboarding browser fixtures.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing onboarding fixture operations against non-disposable host: ${host}`);
  }
  if (password.length < 12) throw new Error("E2E_ONBOARDING_PASSWORD must contain at least 12 characters.");
}

async function removeFixtures() {
  await prisma.notificationLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.userSession.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.homeownerEmailVerificationToken.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.homeownerActivationCredential.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.dataMigration.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.bill.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.homeownerAccountNumberReservation.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.systemSetting.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.billingRule.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.homeownerProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.userRoleAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenantModuleEntitlement.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds }, id: { in: fixtureUserIds } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

async function setup() {
  assertSafeDatabase();
  await removeFixtures();
  const passwordHash = await hash(password, 12);

  await prisma.tenant.createMany({
    data: [
      {
        id: primaryTenantId,
        name: "E2E Onboarding Primary HOA",
        shortName: "E2E-ON-A",
        slug: primaryTenantSlug,
        address: "Primary Onboarding Address",
      },
      {
        id: secondaryTenantId,
        name: "E2E Onboarding Secondary HOA",
        shortName: "E2E-ON-B",
        slug: secondaryTenantSlug,
        address: "Secondary Onboarding Address",
      },
    ],
  });

  await prisma.tenantModuleEntitlement.createMany({
    data: tenantIds.flatMap((tenantId) =>
      Object.values(TenantModule).map((module) => ({ tenantId, module, enabled: true })),
    ),
  });

  await prisma.user.createMany({
    data: [
      {
        id: administratorId,
        tenantId: primaryTenantId,
        name: "E2E Onboarding Administrator",
        email: administratorEmail,
        passwordHash,
        role: Role.HOA_ADMIN,
        active: true,
      },
      {
        id: restrictedUserId,
        tenantId: primaryTenantId,
        name: "E2E Onboarding Restricted Staff",
        email: restrictedEmail,
        passwordHash,
        role: Role.STAFF,
        active: true,
      },
      {
        id: secondaryHomeownerUserId,
        tenantId: secondaryTenantId,
        name: "E2E Existing Secondary Homeowner",
        email: importedEmail,
        passwordHash,
        role: Role.HOMEOWNER,
        active: true,
      },
    ],
  });

  await prisma.userRoleAssignment.createMany({
    data: [
      { tenantId: primaryTenantId, userId: administratorId, role: Role.HOA_ADMIN, assignedBy: administratorId, active: true },
      { tenantId: primaryTenantId, userId: restrictedUserId, role: Role.STAFF, assignedBy: administratorId, active: true },
      { tenantId: secondaryTenantId, userId: secondaryHomeownerUserId, role: Role.HOMEOWNER, assignedBy: secondaryHomeownerUserId, active: true },
    ],
  });

  await prisma.homeownerProfile.create({
    data: {
      id: secondaryHomeownerId,
      tenantId: secondaryTenantId,
      userId: secondaryHomeownerUserId,
      phone: "09170000002",
      address: "7 Shared Street",
      block: "7",
      lot: "9",
      phase: "Phase 1",
      monthlyDuesAmount: 100,
    },
  });

  console.log("Tenant onboarding browser fixtures prepared.");
  console.log(`Primary tenant login: /${primaryTenantSlug}/login`);
  console.log(`Administrator: ${administratorEmail}`);
  console.log(`Restricted staff: ${restrictedEmail}`);
  console.log(`Imported homeowner identity: ${importedEmail}`);
}

async function cleanup() {
  assertSafeDatabase();
  await removeFixtures();
  console.log("Tenant onboarding browser fixtures removed.");
}

const operation = process.argv[2] || "setup";

(operation === "cleanup" ? cleanup() : setup())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
