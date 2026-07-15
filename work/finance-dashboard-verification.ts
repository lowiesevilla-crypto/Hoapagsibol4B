import { PrismaClient, TenantModule } from "@prisma/client";
import { getFinanceDashboard, parseFinanceDashboardDateRange } from "../lib/services/finance-dashboard";
import { runWithTenant } from "../lib/tenant-context";

const raw = new PrismaClient();
const checks: string[] = [];

function check(condition: unknown, label: string) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}

async function main() {
  const tenants = await raw.tenant.findMany({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" }, take: 2 });
  check(tenants.length === 2, "two active tenants are available for isolation verification");
  const range = parseFinanceDashboardDateRange("2020-01-01", new Date().toISOString().slice(0, 10));
  const reports = [];

  for (const tenant of tenants) {
    const actor = await raw.user.findFirstOrThrow({ where: { tenantId: tenant.id, active: true, role: { in: ["SUPER_ADMIN", "SYSTEM_ADMIN", "HOA_ADMIN", "BILLING_MANAGER", "ADMIN"] } } });
    const report = await runWithTenant(tenant.id, () => getFinanceDashboard({ tenantId: tenant.id, fromInput: range.fromText, toInput: range.toText }), { role: actor.role, enabledModules: Object.values(TenantModule) });
    reports.push(report);

    const [activeHeaders, voidedHeaders, billed] = await Promise.all([
      raw.payment.count({ where: { tenantId: tenant.id, status: "ACTIVE", paymentDate: { gte: range.from, lte: range.to } } }),
      raw.payment.count({ where: { tenantId: tenant.id, status: "VOIDED", paymentDate: { gte: range.from, lte: range.to } } }),
      raw.bill.aggregate({ where: { tenantId: tenant.id, archivedAt: null, billingMonth: { gte: range.from, lte: range.to }, createdAt: { lte: range.to } }, _sum: { totalAmount: true } }),
    ]);
    check(report.kpis.activeReceiptCount === activeHeaders, `${tenant.name}: active receipts count Payment headers once`);
    check(report.kpis.voidedReceiptCount === voidedHeaders, `${tenant.name}: voided receipts count Payment headers once`);
    check(Math.abs(report.kpis.totalBilled - Number(billed._sum.totalAmount ?? 0)) <= 0.01, `${tenant.name}: billed KPI matches tenant-scoped valid bills`);
    check(Math.abs(report.reconciliation.activePaymentReceived - report.reconciliation.amountAppliedToBills - report.reconciliation.unappliedCredit) <= 0.01, `${tenant.name}: active receipts reconcile to applied amount plus credit`);
    check(report.reconciliation.balanced && Math.abs(report.reconciliation.variance) <= report.reconciliation.tolerance, `${tenant.name}: reconciliation tolerance is enforced`);
    check(report.paymentMethods.reduce((sum, row) => sum + row.transactionCount, 0) === activeHeaders, `${tenant.name}: payment method counts reconcile to active headers`);
    check(Math.abs(report.aging.reduce((sum, row) => sum + row.amount, 0) - report.kpis.outstandingReceivables) <= 0.01, `${tenant.name}: aging buckets reconcile to outstanding receivables`);
    check(report.delinquent.exportRows.every((row) => !row.accountNumber.includes(row.homeownerId)), `${tenant.name}: public account numbers do not expose homeowner IDs`);
  }

  const firstActor = await raw.user.findFirstOrThrow({ where: { tenantId: tenants[0].id, active: true } });
  let crossTenantBlocked = false;
  try {
    await runWithTenant(tenants[0].id, () => getFinanceDashboard({ tenantId: tenants[1].id, fromInput: range.fromText, toInput: range.toText }), { role: firstActor.role, enabledModules: Object.values(TenantModule) });
  } catch (error) {
    crossTenantBlocked = error instanceof Error && error.message.includes("Cross-tenant query blocked");
  }
  check(crossTenantBlocked, "mismatched tenant input is blocked by the tenant boundary");
  check(reports.every((report) => report.monthlyTrend.length > 0), "zero-value calendar months are retained for trend continuity");

  let invalidRangeBlocked = false;
  try { parseFinanceDashboardDateRange("2026-12-31", "2026-01-01"); } catch (error) { invalidRangeBlocked = error instanceof Error && error.message === "Start date must be on or before end date."; }
  check(invalidRangeBlocked, "invalid date ranges return the precise validation message");
  console.log(`PASS ${checks.length} finance dashboard checks`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => raw.$disconnect());
