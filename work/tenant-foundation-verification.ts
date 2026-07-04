import { Prisma, PrismaClient, TenantStatus, TenantSubscriptionStatus } from "@prisma/client";

const prisma = new PrismaClient();

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function recordCounts() {
  const [users, homeowners, bills, payments, settings] = await Promise.all([
    prisma.user.count(),
    prisma.homeownerProfile.count(),
    prisma.bill.count(),
    prisma.payment.count(),
    prisma.systemSetting.count(),
  ]);
  return { users, homeowners, bills, payments, settings };
}

async function main() {
  const before = await recordCounts();
  const initialTenantCount = await prisma.tenant.count();
  const suffix = Date.now().toString(36);
  const createdIds: string[] = [];

  try {
    check(initialTenantCount >= 1, "Current database preserves the migrated default tenant");

    const trial = await prisma.tenant.create({
      data: {
        name: "Phase 2 Verification Homeowners Association",
        shortName: "P2V HOA",
        slug: `phase2-verification-${suffix}`,
        logoUrl: "/verification/logo.png",
        address: "Local verification address",
        contactNumber: "09170000000",
        email: "phase2-verification@example.test",
        secRegistrationNumber: "LOCAL-SEC-VERIFY",
        tinNumber: "000-000-000-000",
      },
    });
    createdIds.push(trial.id);
    check(trial.status === TenantStatus.ACTIVE, "Tenant status defaults to ACTIVE");
    check(trial.subscriptionPlan === "STANDARD", "Tenant subscription plan defaults to STANDARD");
    check(trial.subscriptionStatus === TenantSubscriptionStatus.TRIAL, "Tenant subscription status defaults to TRIAL");
    check(Boolean(trial.createdAt && trial.updatedAt), "Tenant audit timestamps are populated");
    check(trial.secRegistrationNumber === "LOCAL-SEC-VERIFY" && trial.tinNumber === "000-000-000-000", "Tenant SEC and TIN fields persist correctly");

    const suspended = await prisma.tenant.create({
      data: {
        name: "Suspended Phase 2 Verification HOA",
        shortName: "P2 Suspended",
        slug: `phase2-suspended-${suffix}`,
        status: TenantStatus.SUSPENDED,
        subscriptionPlan: "ENTERPRISE",
        subscriptionStatus: TenantSubscriptionStatus.PAST_DUE,
      },
    });
    createdIds.push(suspended.id);
    check(suspended.status === TenantStatus.SUSPENDED && suspended.subscriptionStatus === TenantSubscriptionStatus.PAST_DUE, "Tenant lifecycle and subscription states persist independently");

    let duplicateRejected = false;
    try {
      await prisma.tenant.create({
        data: {
          name: "Duplicate Slug Verification",
          shortName: "Duplicate",
          slug: trial.slug.toUpperCase(),
        },
      });
    } catch (error) {
      duplicateRejected = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    }
    check(duplicateRejected, "Tenant slug uniqueness is enforced case-insensitively by MySQL");

    const indexes = await prisma.$queryRaw<Array<{ INDEX_NAME: string }>>`
      SELECT DISTINCT INDEX_NAME
      FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = 'Tenant'
    `;
    const indexNames = new Set(indexes.map((row) => row.INDEX_NAME));
    check(indexNames.has("Tenant_slug_key"), "Tenant slug unique index exists");
    check(indexNames.has("Tenant_name_idx"), "Tenant name lookup index exists");
    check(indexNames.has("Tenant_status_subscriptionStatus_idx"), "Tenant lifecycle index exists");
    check(indexNames.has("Tenant_subscriptionPlan_subscriptionStatus_idx"), "Tenant subscription lookup index exists");

    const tenantColumns = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM information_schema.columns
      WHERE table_schema = DATABASE() AND column_name = 'tenantId' AND table_name <> 'Tenant'
    `;
    check(Number(tenantColumns[0]?.count || 0) >= 51, "Current schema applies tenant ownership across all tenant-owned tables");
  } finally {
    if (createdIds.length) await prisma.tenant.deleteMany({ where: { id: { in: createdIds } } });
  }

  const after = await recordCounts();
  check(JSON.stringify(after) === JSON.stringify(before), "Existing single-HOA record counts remain unchanged");
  check(await prisma.tenant.count() === initialTenantCount, "Phase 2 verification tenants are fully cleaned up");
  console.log("PASS 15 current tenant foundation checks");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
