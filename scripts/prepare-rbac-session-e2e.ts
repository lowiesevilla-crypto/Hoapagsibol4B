import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const tenantId = "tenant_pagsibol4b_default";
const platformAdministratorId = "e2e_rbac_platform_administrator";
const restrictedUserId = "e2e_rbac_restricted_user";
const protectedTargetId = "e2e_rbac_protected_target";

const platformAdministratorEmail =
  process.env.E2E_PLATFORM_ADMIN_EMAIL || "ci-platform-admin@example.invalid";
const restrictedUserEmail =
  process.env.E2E_RESTRICTED_USER_EMAIL || "ci-restricted-staff@example.invalid";
const protectedTargetEmail =
  process.env.E2E_PROTECTED_TARGET_EMAIL || "ci-protected-target@example.invalid";
const securityPassword =
  process.env.E2E_SECURITY_PASSWORD || "CI-Security-Password-2026!";

const fixtureUserIds = [
  platformAdministratorId,
  restrictedUserId,
  protectedTargetId,
];

function assertSafeDatabase() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error(
      "RBAC session fixtures are restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.",
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for RBAC session fixtures.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing RBAC session fixture operations against non-disposable host: ${host}`);
  }
  if (securityPassword.length < 12) {
    throw new Error("E2E_SECURITY_PASSWORD must contain at least 12 characters.");
  }
}

async function removeFixtures() {
  await prisma.userSession.deleteMany({
    where: { tenantId, userId: { in: fixtureUserIds } },
  });
  await prisma.userRoleAssignment.deleteMany({
    where: { tenantId, userId: { in: fixtureUserIds } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      tenantId,
      OR: [
        { actorId: { in: fixtureUserIds } },
        { entityId: { in: fixtureUserIds } },
      ],
    },
  });
  await prisma.user.deleteMany({
    where: { tenantId, id: { in: fixtureUserIds } },
  });
}

async function setup() {
  assertSafeDatabase();
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, status: "ACTIVE", subscriptionStatus: { not: "CANCELLED" } },
    select: { id: true },
  });
  if (!tenant) throw new Error("The primary E2E tenant is not active. Run pnpm db:seed first.");

  await removeFixtures();
  const passwordHash = await hash(securityPassword, 12);

  await prisma.user.createMany({
    data: [
      {
        id: platformAdministratorId,
        tenantId,
        name: "E2E Platform Administrator",
        email: platformAdministratorEmail,
        passwordHash,
        role: Role.PLATFORM_ADMIN,
        active: true,
      },
      {
        id: restrictedUserId,
        tenantId,
        name: "E2E Restricted Staff",
        email: restrictedUserEmail,
        passwordHash,
        role: Role.STAFF,
        active: true,
      },
      {
        id: protectedTargetId,
        tenantId,
        name: "E2E Protected Target",
        email: protectedTargetEmail,
        passwordHash,
        role: Role.STAFF,
        active: true,
      },
    ],
  });

  console.log("RBAC and stale-session browser fixtures prepared.");
  console.log(`Platform administrator: ${platformAdministratorEmail}`);
  console.log(`Restricted user: ${restrictedUserEmail}`);
  console.log(`Protected target: ${protectedTargetEmail}`);
}

async function cleanup() {
  assertSafeDatabase();
  await removeFixtures();
  console.log("RBAC and stale-session browser fixtures removed.");
}

const operation = process.argv[2] || "setup";

(operation === "cleanup" ? cleanup() : setup())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
