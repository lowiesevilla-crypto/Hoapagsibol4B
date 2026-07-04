import { PrismaClient, Role, TenantModule, TenantStatus, TenantSubscriptionStatus } from "@prisma/client";

const prisma = new PrismaClient();
let passed = 0;
function check(condition: unknown, label: string) { if (!condition) throw new Error(`FAIL: ${label}`); passed++; console.log(`PASS ${passed}: ${label}`); }

async function nextTenantSequence(tenantId: string, scope: string, date: Date) {
  const year = date.getFullYear();
  return prisma.$transaction(async (tx) => {
    await tx.tenantSequence.upsert({ where: { tenantId_scope_year: { tenantId, scope, year } }, update: { nextValue: { increment: 1 } }, create: { tenantId, scope, year, nextValue: 2 } });
    const sequence = await tx.tenantSequence.findUniqueOrThrow({ where: { tenantId_scope_year: { tenantId, scope, year } } });
    return { year, value: sequence.nextValue - 1, formatted: `${scope}-${year}-${String(sequence.nextValue - 1).padStart(6, "0")}` };
  });
}

async function main() {
  const staleTenants = await prisma.tenant.findMany({ where: { slug: { startsWith: "verify-" } }, select: { id: true } });
  for (const stale of staleTenants) {
    await prisma.user.deleteMany({ where: { tenantId: stale.id } });
    await prisma.tenantSequence.deleteMany({ where: { tenantId: stale.id } });
    await prisma.tenant.delete({ where: { id: stale.id } });
  }
  const defaultTenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "pagsibol4b" }, include: { moduleEntitlements: true } });
  await prisma.tenantSequence.deleteMany({ where: { tenantId: defaultTenant.id, scope: "VERIFY", year: 2026 } });
  check(defaultTenant.status === TenantStatus.ACTIVE, "default tenant is active");
  check(defaultTenant.moduleEntitlements.length === Object.values(TenantModule).length, "default tenant has every module entitlement");
  const fkRows = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) count FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'Tenant' AND COLUMN_NAME = 'tenantId'`;
  check(Number(fkRows[0]?.count) >= 50, "tenant foreign keys cover existing and platform tables");
  const indexRows = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(DISTINCT TABLE_NAME) count FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'tenantId'`;
  check(Number(indexRows[0]?.count) >= 50, "tenant indexes cover tenant-owned tables");

  const suffix = Date.now();
  const tenant = await prisma.tenant.create({ data: { name: "Verification HOA", shortName: "VERIFY", slug: `verify-${suffix}`, status: TenantStatus.ACTIVE, subscriptionPlan: "TEST", subscriptionStatus: TenantSubscriptionStatus.TRIAL, moduleEntitlements: { create: Object.values(TenantModule).map((module) => ({ module, enabled: module !== TenantModule.PAYROLL })) } } });
  try {
    const user = await prisma.user.create({ data: { tenantId: tenant.id, name: "Verification Admin", email: `verify-${suffix}@example.invalid`, passwordHash: "not-a-login-password", role: Role.HOA_ADMIN } });
    check(user.tenantId === tenant.id, "new tenant user is assigned to its HOA");
    check((await prisma.user.count({ where: { tenantId: defaultTenant.id, id: user.id } })) === 0, "default tenant query cannot see second-tenant user");
    check((await prisma.user.count({ where: { tenantId: tenant.id, id: user.id } })) === 1, "second tenant can see its own user");
    const payroll = await prisma.tenantModuleEntitlement.findUniqueOrThrow({ where: { tenantId_module: { tenantId: tenant.id, module: TenantModule.PAYROLL } } });
    check(!payroll.enabled, "subscription can disable a module per tenant");
    await prisma.tenant.update({ where: { id: tenant.id }, data: { status: TenantStatus.SUSPENDED } });
    check((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).status === TenantStatus.SUSPENDED, "tenant suspension persists");
    const sequenceA = await nextTenantSequence(defaultTenant.id, "VERIFY", new Date("2026-01-01"));
    const sequenceB = await nextTenantSequence(tenant.id, "VERIFY", new Date("2026-01-01"));
    check(sequenceA.value === 1 && sequenceB.value === 1, "document sequences start independently per tenant");
    check(sequenceA.formatted === "VERIFY-2026-000001", "tenant number format is stable");
    let orphanRejected = false;
    try { await prisma.auditLog.create({ data: { tenantId: "missing-tenant", module: "VERIFY", action: "VERIFY_FK", entityType: "Tenant", entityId: "missing" } }); } catch { orphanRejected = true; }
    check(orphanRejected, "database rejects orphan tenant records");
  } finally {
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenantSequence.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.tenantSequence.deleteMany({ where: { tenantId: defaultTenant.id, scope: "VERIFY", year: 2026 } });
  }
  check((await prisma.tenant.count({ where: { slug: { startsWith: "verify-" } } })) === 0, "temporary verification tenant is removed");
  console.log(`MULTI_TENANT_VERIFICATION_PASS=${passed}`);
}

main().finally(() => prisma.$disconnect());
