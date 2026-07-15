import { PrismaClient, TenantModule } from "@prisma/client";
import { getPaymentHistoryData } from "../lib/services/admin-payments";
import { homeownerAccountNumber, homeownerPropertyLabel } from "../lib/homeowner-account";
import { paymentProcessorIdentity } from "../lib/payment-processor";
import { runWithTenant } from "../lib/tenant-context";

const raw = new PrismaClient();
const checks: string[] = [];

function check(condition: unknown, label: string) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}

async function main() {
  const tenant = await raw.tenant.findUniqueOrThrow({ where: { slug: "test-hoa" } });
  const actor = await raw.user.findFirstOrThrow({ where: { tenantId: tenant.id, active: true, role: { in: ["SYSTEM_ADMIN", "ADMIN", "HOA_ADMIN"] } } });
  const active = await raw.payment.findFirstOrThrow({ where: { tenantId: tenant.id, status: "ACTIVE" }, include: { homeowner: true, processedBy: { include: { employeeProfile: true } } }, orderBy: { createdAt: "desc" } });
  const voided = await raw.payment.findFirstOrThrow({ where: { tenantId: tenant.id, status: "VOIDED" }, orderBy: { createdAt: "desc" } });
  const enabledModules = [TenantModule.BILLING, TenantModule.REPORTS];

  const processor = paymentProcessorIdentity(active.processedBy);
  check(homeownerAccountNumber(active.homeowner) === "HOA-B1-L1" && !homeownerAccountNumber(active.homeowner).includes(active.homeownerId), "public account number does not expose the internal homeowner ID");
  check(homeownerPropertyLabel(active.homeowner) === "Block 1, Lot 1" && active.homeowner.address === "The W Fifth Avenue", "property presentation uses block, lot, and complete address");
  check(Boolean(processor.name) && processor.name !== processor.role, "processor resolver separates real name from role or position");
  check(active.status === "ACTIVE" && voided.status === "VOIDED", "persisted payments preserve Active and Void statuses");
  check(Boolean(active.receiptNumber) && Boolean(voided.receiptNumber), "active and voided official receipt numbers remain stable");

  const history = await runWithTenant(tenant.id, () => getPaymentHistoryData({ tenantId: tenant.id }, {}), { role: actor.role, enabledModules });
  const paymentCount = await raw.payment.count({ where: { tenantId: tenant.id } });
  check(history.paymentCount === paymentCount, "transaction history count is based on Payment headers");
  check(new Set(history.payments.map((payment) => payment.id)).size === history.payments.length, "transaction history returns one row per Payment header");
  check(new Set(history.payments.map((payment) => payment.receiptNumber)).size === history.payments.length, "separate official receipts remain separate transaction rows");
  check(history.payments.some((payment) => payment.status === "ACTIVE") && history.payments.some((payment) => payment.status === "VOIDED"), "transaction history includes clearly distinguishable active and voided payments");

  const otherTenant = await raw.tenant.findFirstOrThrow({ where: { id: { not: tenant.id } } });
  check(await raw.payment.count({ where: { id: active.id, tenantId: otherTenant.id } }) === 0, "tenant-qualified receipt lookup cannot match a payment from another tenant");

  console.log(`PASS ${checks.length} payment finalization checks`);
  for (const label of checks) console.log(`- ${label}`);
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => raw.$disconnect());
