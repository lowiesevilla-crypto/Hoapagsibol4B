import { PaymentMethod, Prisma, PrismaClient } from "@prisma/client";
import { paymentCoverageLabel } from "../lib/payment-coverage";
import { normalizePaymentReference } from "../lib/payment-methods";
import { recordMonthlyDuesPayment } from "../lib/services/payment-recording";
import { paymentSchema } from "../lib/validation";

const prisma = new PrismaClient();
const checks: string[] = [];
const rollback = new Error("EXPECTED_PAYMENT_COVERAGE_ROLLBACK");
const marker = `PAYMENT-COVERAGE-QA-${Date.now()}`;

function check(condition: unknown, label: string) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}

function formValues(method: PaymentMethod, referenceNumber = "") {
  return {
    billIds: "placeholder-bill-id",
    amount: "3000",
    paymentDate: "2097-06-15",
    method,
    coverageFromMonth: "6",
    coverageFromYear: "2097",
    coverageToMonth: "8",
    coverageToYear: "2097",
    referenceNumber,
    remarks: marker,
  };
}

async function main() {
  check(paymentSchema.safeParse(formValues(PaymentMethod.CASH)).success, "Cash payment validation accepts a blank reference number");
  check(normalizePaymentReference(PaymentMethod.CASH, "") === null, "backend normalization stores a blank Cash reference as null");
  for (const method of [PaymentMethod.GCASH, PaymentMethod.BANK_TRANSFER, PaymentMethod.CHECK, PaymentMethod.OTHER]) {
    const parsed = paymentSchema.safeParse(formValues(method));
    check(!parsed.success && parsed.error.issues.some((issue) => issue.path[0] === "referenceNumber"), `${method} requires a reference number`);
    check(paymentSchema.safeParse(formValues(method, `${marker}-${method}`)).success, `${method} accepts a supplied reference number`);
    let backendRejected = false;
    try {
      normalizePaymentReference(method, "");
    } catch (error) {
      backendRejected = error instanceof Error && error.message.includes("required");
    }
    check(backendRejected, `backend payment service rejects a blank ${method} reference`);
  }

  check(paymentCoverageLabel({ coverageMonths: ["2097-06-01"] }) === "June 2097", "one billing month displays as a single month");
  check(paymentCoverageLabel({ coverageMonths: ["2097-08-01", "2097-06-01", "2097-07-01"] }) === "June 2097 to August 2097", "multiple billing months display the earliest-to-latest range");
  check(!paymentSchema.safeParse({ ...formValues(PaymentMethod.CASH), coverageFromMonth: "12", coverageFromYear: "2097", coverageToMonth: "1", coverageToYear: "2097" }).success, "Coverage To cannot be earlier than Coverage From");
  check(!paymentSchema.safeParse({ ...formValues(PaymentMethod.CASH), coverageFromMonth: "13" }).success, "coverage month must be January through December");
  check(!paymentSchema.safeParse({ ...formValues(PaymentMethod.CASH), coverageFromYear: "year" }).success, "coverage year must be numeric");

  try {
    await prisma.$transaction(async (tx) => {
      const actor = await tx.user.findFirstOrThrow({ where: { role: { in: ["SYSTEM_ADMIN", "ADMIN"] } }, orderBy: { role: "asc" } });
      const homeownerUser = await tx.user.create({
        data: {
          name: marker,
          email: `${marker.toLowerCase()}@example.test`,
          passwordHash: marker,
          role: "HOMEOWNER",
        },
      });
      const homeowner = await tx.homeownerProfile.create({
        data: {
          userId: homeownerUser.id,
          address: "Rollback verification address",
          block: "QA",
          lot: marker.slice(-8),
          phone: "09000000000",
          status: "ACTIVE",
          monthlyDuesAmount: 1000,
        },
      });
      const months = [5, 6, 7].map((month) => new Date(Date.UTC(2097, month, 1)));
      const bills = await Promise.all(months.map((billingMonth) => tx.bill.create({
        data: {
          homeownerId: homeowner.id,
          billingMonth,
          amount: 1000,
          totalAmount: 1000,
          amountPaid: 0,
          balance: 1000,
          dueDate: new Date(Date.UTC(2097, billingMonth.getUTCMonth(), 28)),
          status: "UNPAID",
          notes: marker,
        },
      })));

      const result = await recordMonthlyDuesPayment(tx, {
        actor: { id: actor.id, tenantId: actor.tenantId, name: actor.name, email: actor.email },
        billIds: bills.map((bill) => bill.id),
        amount: 3000,
        paymentDate: new Date("2097-06-15T00:00:00.000Z"),
        method: PaymentMethod.CASH,
        coverageFromMonth: 6,
        coverageFromYear: 2097,
        coverageToMonth: 8,
        coverageToYear: 2097,
        referenceNumber: "",
        remarks: marker,
      });
      const payments = await tx.payment.findMany({ where: { id: { in: result.paymentIds } }, include: { bill: true }, orderBy: { bill: { billingMonth: "asc" } } });
      check(result.referenceNumber === null && payments.every((payment) => payment.referenceNumber === null), "Cash reference is stored as null without blocking receipt creation");
      check(payments.length === 3 && payments.every((payment) => Boolean(payment.receiptNumber)), "one receipt allocation is generated for every selected billing month");
      check(new Set(payments.map((payment) => payment.paymentBatchId)).size === 1 && payments[0].paymentBatchId === result.paymentBatchId, "selected billing months are persisted under one payment transaction batch");
      check(payments.every((payment) => paymentCoverageLabel(payment) === "June 2097 to August 2097"), "every receipt and history allocation carries the same June-to-August coverage");
      check(payments.every((payment) => Array.isArray(payment.coverageMonths) && payment.coverageMonths.length === 3), "the exact selected billing months are stored with every payment allocation");
      check(payments.every((payment) => payment.coverageFromMonth === 6 && payment.coverageFromYear === 2097 && payment.coverageToMonth === 8 && payment.coverageToYear === 2097), "explicit Coverage From and Coverage To fields are stored on every payment allocation");
      check(payments.every((payment) => payment.paymentCoverageDisplay === "Monthly Dues - June 2097 to August 2097"), "generated Payment Coverage Display is stored consistently");
      const paidBills = await tx.bill.findMany({ where: { id: { in: bills.map((bill) => bill.id) } } });
      check(paidBills.every((bill) => Number(bill.amountPaid) === 1000 && Number(bill.balance) === 0 && bill.status === "PAID"), "payment allocation recalculates every selected bill to PAID");
      check(await tx.auditLog.count({ where: { entityId: { in: result.paymentIds }, action: "GENERATE_MD_RECEIPT" } }) === 3, "receipt generation writes an audit record for each allocation");
      const audit = await tx.auditLog.findFirstOrThrow({ where: { entityId: result.paymentIds[0], action: "GENERATE_MD_RECEIPT" } });
      const auditMetadata = audit.metadata as Record<string, unknown>;
      check(auditMetadata.paymentType === "MONTHLY_DUES" && auditMetadata.paymentCoverageDisplay === "Monthly Dues - June 2097 to August 2097" && Boolean(auditMetadata.homeowner) && Boolean(auditMetadata.adminUser) && Boolean(auditMetadata.timestamp), "audit metadata includes type, coverage, homeowner, Admin, and timestamp");
      throw rollback;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  } catch (error) {
    if (error !== rollback) throw error;
  }

  check(await prisma.user.count({ where: { name: marker } }) === 0, "verification records and receipt counters are rolled back cleanly");
  console.log(`PASS ${checks.length} monthly dues payment checks`);
  for (const label of checks) console.log(`- ${label}`);
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
