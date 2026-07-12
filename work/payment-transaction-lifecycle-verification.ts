import { PrismaClient, Role, TenantModule } from "@prisma/client";
import { updatePaymentAmountLedger, voidPaymentLedger } from "../lib/services/payment-ledger";
import { runWithTenant } from "../lib/tenant-context";

const raw = new PrismaClient();
const marker = `PAYMENT-LIFECYCLE-QA-${Date.now()}`;
const checks: string[] = [];
const ids: { user?: string; homeowner?: string; bills: string[]; payment?: string; archive?: string } = { bills: [] };

function check(condition: unknown, label: string) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}

async function main() {
  const actor = await raw.user.findFirstOrThrow({ where: { role: { in: [Role.SYSTEM_ADMIN, Role.ADMIN] }, active: true }, orderBy: { role: "asc" } });
  const user = await raw.user.create({ data: { tenantId: actor.tenantId, name: marker, email: `${marker.toLowerCase()}@example.test`, passwordHash: marker, role: Role.HOMEOWNER } });
  ids.user = user.id;
  const homeowner = await raw.homeownerProfile.create({ data: { tenantId: actor.tenantId, userId: user.id, address: "Temporary lifecycle verification", block: "QA", lot: marker.slice(-8), phone: "09000000000", status: "ACTIVE", monthlyDuesAmount: 1000 } });
  ids.homeowner = homeowner.id;
  const bills = [];
  for (const month of [10, 11]) {
    const billingMonth = new Date(Date.UTC(2096, month, 1));
    bills.push(await raw.bill.create({ data: { tenantId: actor.tenantId, homeownerId: homeowner.id, billingMonth, coverageYear: billingMonth.getUTCFullYear(), coverageMonth: billingMonth.getUTCMonth() + 1, amount: 1000, totalAmount: 1000, amountPaid: month === 10 ? 1000 : 600, balance: month === 10 ? 0 : 400, dueDate: new Date(Date.UTC(2096, month, 28)), status: month === 10 ? "PAID" : "PARTIAL", notes: marker } }));
  }
  ids.bills = bills.map((bill) => bill.id);
  const payment = await raw.payment.create({ data: { tenantId: actor.tenantId, billId: null, homeownerId: homeowner.id, amount: 1600, paymentDate: new Date("2096-11-15T00:00:00.000Z"), method: "CASH", paymentBatchId: marker, idempotencyKey: marker, coverageFromMonth: 11, coverageFromYear: 2096, coverageToMonth: 12, coverageToYear: 2096, paymentCoverageDisplay: "Monthly Dues - November 2096 to December 2096", receiptNumber: marker, remarks: marker, processedById: actor.id } });
  ids.payment = payment.id;
  await raw.paymentAllocation.createMany({ data: [
    { tenantId: actor.tenantId, paymentId: payment.id, billId: bills[0].id, amount: 1000, coverageYear: bills[0].coverageYear, coverageMonth: bills[0].coverageMonth, coverageLabel: "November 2096" },
    { tenantId: actor.tenantId, paymentId: payment.id, billId: bills[1].id, amount: 600, coverageYear: bills[1].coverageYear, coverageMonth: bills[1].coverageMonth, coverageLabel: "December 2096" },
  ] });

  const actorInput = { id: actor.id, tenantId: actor.tenantId, name: actor.name, email: actor.email };
  await runWithTenant(actor.tenantId, () => updatePaymentAmountLedger({ paymentId: payment.id, amount: 1200, actor: actorInput, reason: marker }), { role: actor.role, enabledModules: [TenantModule.BILLING] });
  const updated = await raw.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { allocations: { orderBy: { coverageMonth: "asc" } } } });
  const updatedBills = await raw.bill.findMany({ where: { id: { in: ids.bills } }, orderBy: { coverageMonth: "asc" } });
  check(Number(updated.amount) === 1200, "payment header amount updates once");
  check(updated.allocations.length === 2 && Number(updated.allocations[0].amount) === 1000 && Number(updated.allocations[1].amount) === 200, "payment edit redistributes the transaction total across covered bills");
  check(Number(updatedBills[0].balance) === 0 && Number(updatedBills[1].balance) === 800, "payment edit recalculates every affected bill");
  check(await raw.auditLog.count({ where: { tenantId: actor.tenantId, entityId: payment.id, action: "UPDATE_PAYMENT_AMOUNT" } }) === 1, "payment edit writes one audit event");

  const voided = await runWithTenant(actor.tenantId, () => voidPaymentLedger({ paymentId: payment.id, actor: actorInput, reason: marker }), { role: actor.role, enabledModules: [TenantModule.BILLING] });
  ids.archive = voided.archiveId;
  const voidedPayment = await raw.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { allocations: true } });
  const restoredBills = await raw.bill.findMany({ where: { id: { in: ids.bills } }, orderBy: { coverageMonth: "asc" } });
  check(voidedPayment.status === "VOIDED" && voidedPayment.receiptNumber === marker, "voiding preserves the receipt number and marks one transaction voided");
  check(voidedPayment.allocations.length === 2, "voiding preserves allocation history");
  check(restoredBills.every((bill) => Number(bill.amountPaid) === 0 && Number(bill.balance) === 1000), "voiding restores all covered bill balances");
  check(await raw.paymentArchive.count({ where: { originalPaymentId: payment.id } }) === 1, "voiding creates one transaction archive");
  check(await raw.auditLog.count({ where: { tenantId: actor.tenantId, action: "VOID_PAYMENT_TRANSACTION", metadata: { path: "$.originalPaymentId", equals: payment.id } } }) === 1, "voiding writes one transaction-level audit event");

  console.log(`PASS ${checks.length} payment lifecycle checks`);
  for (const label of checks) console.log(`- ${label}`);
}

async function cleanup() {
  if (ids.payment) await raw.auditLog.deleteMany({ where: { OR: [{ entityId: ids.payment }, ...(ids.archive ? [{ entityId: ids.archive }] : [])] } });
  if (ids.archive) await raw.paymentArchive.deleteMany({ where: { id: ids.archive } });
  if (ids.payment) {
    await raw.paymentAllocation.deleteMany({ where: { paymentId: ids.payment } });
    await raw.payment.deleteMany({ where: { id: ids.payment } });
  }
  if (ids.bills.length) await raw.bill.deleteMany({ where: { id: { in: ids.bills } } });
  if (ids.homeowner) await raw.homeownerProfile.deleteMany({ where: { id: ids.homeowner } });
  if (ids.user) await raw.user.deleteMany({ where: { id: ids.user } });
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
      check(await raw.user.count({ where: { name: marker } }) === 0, "temporary lifecycle records are removed");
    } finally {
      await raw.$disconnect();
    }
  });
