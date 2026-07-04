import { PrismaClient, TenantStatus, TenantSubscriptionStatus } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_TENANT_ID = "tenant_pagsibol4b_default";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function countRows(table: string, predicate = "1=1") {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(table)) throw new Error(`Unsafe table name: ${table}`);
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*) AS count FROM \`${table}\` WHERE ${predicate}`);
  return Number(rows[0]?.count || 0);
}

async function main() {
  const defaultTenant = await prisma.tenant.findUnique({ where: { id: DEFAULT_TENANT_ID } });
  check(Boolean(defaultTenant), "Default Pagsibol tenant exists");
  check(defaultTenant?.slug === "pagsibol4b" && defaultTenant.name === "PAGSIBOL VILLAGE PH2 4B EAST", "Default tenant identity and URL slug are correct");
  check(defaultTenant?.status === TenantStatus.ACTIVE && defaultTenant.subscriptionStatus === TenantSubscriptionStatus.ACTIVE && defaultTenant.subscriptionPlan === "ENTERPRISE", "Default tenant remains active on the enterprise plan");

  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  check(tenants.length >= 2, "Multi-tenant onboarding has preserved more than one tenant");
  check(new Set(tenants.map((tenant) => tenant.slug)).size === tenants.length && tenants.every((tenant) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenant.slug)), "Every tenant has a unique URL-safe slug");

  const tenantColumns = await prisma.$queryRaw<Array<{ TABLE_NAME: string; IS_NULLABLE: string }>>`
    SELECT TABLE_NAME, IS_NULLABLE
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND column_name = 'tenantId' AND table_name <> 'Tenant'
    ORDER BY TABLE_NAME
  `;
  check(tenantColumns.length >= 51, "All current tenant-owned tables expose tenantId");
  check(tenantColumns.every((column) => column.IS_NULLABLE === "NO"), "Tenant ownership is non-null on every tenant-owned table");

  let orphanCount = 0;
  for (const { TABLE_NAME } of tenantColumns) {
    orphanCount += await countRows(TABLE_NAME, "NOT EXISTS (SELECT 1 FROM `Tenant` t WHERE t.`id` = `tenantId`)");
  }
  check(orphanCount === 0, "No tenant-owned database row references a missing tenant");

  const tenantForeignKeys = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count
    FROM information_schema.referential_constraints
    WHERE constraint_schema = DATABASE() AND referenced_table_name = 'Tenant'
  `;
  check(Number(tenantForeignKeys[0]?.count || 0) >= tenantColumns.length, "Tenant foreign keys protect all tenant-owned tables");

  const temporaryAudit = await prisma.auditLog.create({ data: { tenantId: DEFAULT_TENANT_ID, module: "TENANT_MIGRATION_VERIFY", action: "CURRENT_ISOLATION" } });
  await prisma.auditLog.delete({ where: { id: temporaryAudit.id } });
  check(await prisma.auditLog.count({ where: { id: temporaryAudit.id } }) === 0, "Temporary verification record is fully cleaned up");
  console.log("PASS 10 current tenant migration checks");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
