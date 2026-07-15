import { PaymentMethod, Prisma, PrismaClient } from "@prisma/client";
import { paymentCoverageLabel } from "../lib/payment-coverage";
import { normalizePaymentReference } from "../lib/payment-methods";
import { recordMonthlyDuesPayment } from "../lib/services/payment-recording";
import { recalculateBillFromActivePayments } from "../lib/services/payment-ledger";
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
      const months = [5, 6, 7, 8, 9, 10].map((month) => new Date(Date.UTC(2097, month, 1)));
      const bills = await Promise.all(months.map((billingMonth) => tx.bill.create({
        data: {
          homeownerId: homeowner.id,
          billingMonth,
          coverageYear: billingMonth.getUTCFullYear(),
          coverageMonth: billingMonth.getUTCMonth() + 1,
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
        billIds: bills.slice(0, 3).map((bill) => bill.id),
        amount: 3000,
        paymentDate: new Date("2097-06-15T00:00:00.000Z"),
        method: PaymentMethod.CASH,
        idempotencyKey: `${marker}-payment`,
        coverageFromMonth: 6,
        coverageFromYear: 2097,
        coverageToMonth: 8,
        coverageToYear: 2097,
        referenceNumber: "",
        remarks: marker,
      });
      const payments = await tx.payment.findMany({ where: { id: { in: result.paymentIds } }, include: { allocations: { include: { bill: true }, orderBy: { bill: { billingMonth: "asc" } } } } });
      const payment = payments[0];
      check(result.referenceNumber === null && payment?.referenceNumber === null, "Cash reference is stored as null without blocking receipt creation");
      check(payments.length === 1 && Boolean(payment.receiptNumber), "one payment header and one receipt are generated for the submission");
      check(payment.paymentBatchId === result.paymentBatchId, "the payment transaction keeps its persisted batch identifier");
      check(payment.allocations.length === 3 && new Set(payment.allocations.map((allocation) => allocation.billId)).size === 3, "three selected billings are stored as three unique allocations");
      check(Number(payment.amount) === payment.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0), "payment header total equals the allocation total");
      check(paymentCoverageLabel(payment) === "June 2097 to August 2097", "the receipt carries the June-to-August coverage");
      check(Array.isArray(payment.coverageMonths) && payment.coverageMonths.length === 3, "the exact selected billing months are stored on the payment header");
      check(payment.coverageFromMonth === 6 && payment.coverageFromYear === 2097 && payment.coverageToMonth === 8 && payment.coverageToYear === 2097, "explicit Coverage From and Coverage To fields are stored on the payment header");
      check(payment.paymentCoverageDisplay === "Monthly Dues - June 2097 to August 2097", "generated Payment Coverage Display is stored consistently");
      const paidBills = await tx.bill.findMany({ where: { id: { in: bills.slice(0, 3).map((bill) => bill.id) } } });
      check(paidBills.every((bill) => Number(bill.amountPaid) === 1000 && Number(bill.balance) === 0 && bill.status === "PAID"), "payment allocation recalculates every selected bill to PAID");
      check(await tx.auditLog.count({ where: { entityId: result.paymentId, action: "RECORD_PAYMENT_TRANSACTION" } }) === 1, "payment recording writes one transaction-level audit event");
      const audit = await tx.auditLog.findFirstOrThrow({ where: { entityId: result.paymentId, action: "RECORD_PAYMENT_TRANSACTION" } });
      const auditMetadata = audit.metadata as Record<string, unknown>;
      check(auditMetadata.paymentCoverageDisplay === "Monthly Dues - June 2097 to August 2097" && Array.isArray(auditMetadata.allocations) && Boolean(auditMetadata.homeowner) && Boolean(auditMetadata.adminUser) && Boolean(auditMetadata.timestamp), "audit metadata includes allocations, coverage, homeowner, Admin, and timestamp");

      const counterAfterFirst = await tx.receiptCounter.findUniqueOrThrow({ where: { tenantId_series_year: { tenantId: actor.tenantId, series: "MD", year: 2097 } } });
      const retried = await recordMonthlyDuesPayment(tx, {
        actor: { id: actor.id, tenantId: actor.tenantId, name: actor.name, email: actor.email },
        billIds: bills.slice(0, 3).map((bill) => bill.id),
        amount: 3000,
        paymentDate: new Date("2097-06-15T00:00:00.000Z"),
        method: PaymentMethod.CASH,
        idempotencyKey: `${marker}-payment`,
        coverageFromMonth: 6,
        coverageFromYear: 2097,
        coverageToMonth: 8,
        coverageToYear: 2097,
        referenceNumber: "",
        remarks: marker,
      });
      const counterAfterRetry = await tx.receiptCounter.findUniqueOrThrow({ where: { tenantId_series_year: { tenantId: actor.tenantId, series: "MD", year: 2097 } } });
      check(retried.reused && retried.paymentId === result.paymentId, "repeated submission reuses the persisted payment transaction");
      check(counterAfterRetry.lastNumber === counterAfterFirst.lastNumber, "repeated submission does not allocate another receipt number");
      check(await tx.payment.count({ where: { idempotencyKey: `${marker}-payment` } }) === 1, "idempotency key stores exactly one payment header");

      const partial = await recordMonthlyDuesPayment(tx, {
        actor: { id: actor.id, tenantId: actor.tenantId, name: actor.name, email: actor.email },
        billIds: [bills[3].id, bills[3].id],
        amount: 400,
        paymentDate: new Date("2097-09-15T00:00:00.000Z"),
        method: PaymentMethod.GCASH,
        idempotencyKey: `${marker}-partial`,
        coverageFromMonth: 9,
        coverageFromYear: 2097,
        coverageToMonth: 9,
        coverageToYear: 2097,
        referenceNumber: `${marker}-GCASH-PARTIAL`,
        remarks: marker,
      });
      const partialPayment = await tx.payment.findUniqueOrThrow({ where: { id: partial.paymentId }, include: { allocations: true } });
      const partialBill = await tx.bill.findUniqueOrThrow({ where: { id: bills[3].id } });
      check(partialPayment.allocations.length === 1 && Number(partialPayment.allocations[0].amount) === 400, "duplicate bill IDs are normalized into one positive allocation");
      check(Number(partialPayment.amount) === 400 && Number(partialBill.amountPaid) === 400 && Number(partialBill.balance) === 600 && partialBill.status === "PARTIAL", "single-bill partial payment updates amount, balance, and status correctly");

      const overpayment = await recordMonthlyDuesPayment(tx, {
          actor: { id: actor.id, tenantId: actor.tenantId, name: actor.name, email: actor.email },
          billIds: [bills[3].id],
          amount: 1100,
          paymentDate: new Date("2097-09-16T00:00:00.000Z"),
          method: PaymentMethod.CASH,
          idempotencyKey: `${marker}-over-allocation`,
          coverageFromMonth: 9,
          coverageFromYear: 2097,
          coverageToMonth: 9,
          coverageToYear: 2097,
          referenceNumber: "",
          remarks: marker,
        });
      const overpaidPayment = await tx.payment.findUniqueOrThrow({ where: { id: overpayment.paymentId }, include: { allocations: true } });
      check(Number(overpaidPayment.amount) === 1100, "overpayment stores the full amount received on one payment header");
      check(overpaidPayment.allocations.length === 1 && Number(overpaidPayment.allocations[0].amount) === 600, "overpayment caps bill allocation at the outstanding balance");
      check(overpayment.appliedAmount === 600 && overpayment.unappliedCredit === 500, "overpayment confirmation reports PHP 500.00 as unapplied credit");
      check(await tx.payment.count({ where: { id: overpayment.paymentId } }) === 1 && Boolean(overpaidPayment.receiptNumber), "overpayment creates one payment and one official receipt number");

      for (const [index, method] of [PaymentMethod.GCASH, PaymentMethod.BANK_TRANSFER].entries()) {
        const bill = bills[4 + index];
        const referenceNumber = `${marker}-${method}-REUSE`;
        const original = await recordMonthlyDuesPayment(tx, {
          actor: { id: actor.id, tenantId: actor.tenantId, name: actor.name, email: actor.email },
          billIds: [bill.id],
          amount: 500,
          paymentDate: new Date(`2097-${10 + index}-15T00:00:00.000Z`),
          method,
          idempotencyKey: `${marker}-${method}-original`,
          coverageFromMonth: 10 + index,
          coverageFromYear: 2097,
          coverageToMonth: 10 + index,
          coverageToYear: 2097,
          referenceNumber,
          remarks: marker,
        });
        let activeDuplicateBlocked = false;
        try {
          await recordMonthlyDuesPayment(tx, {
            actor: { id: actor.id, tenantId: actor.tenantId, name: actor.name, email: actor.email },
            billIds: [bill.id], amount: 100, paymentDate: new Date(`2097-${10 + index}-16T00:00:00.000Z`), method,
            idempotencyKey: `${marker}-${method}-duplicate`, coverageFromMonth: 10 + index, coverageFromYear: 2097,
            coverageToMonth: 10 + index, coverageToYear: 2097, referenceNumber, remarks: marker,
          });
        } catch (error) {
          activeDuplicateBlocked = error instanceof Error && error.message.includes("already been recorded");
        }
        check(activeDuplicateBlocked, `${method} active reference duplicate is blocked`);
        await tx.payment.update({ where: { id: original.paymentId }, data: { status: "VOIDED", voidedAt: new Date() } });
        await recalculateBillFromActivePayments(tx, bill);
        const replacement = await recordMonthlyDuesPayment(tx, {
          actor: { id: actor.id, tenantId: actor.tenantId, name: actor.name, email: actor.email },
          billIds: [bill.id], amount: 100, paymentDate: new Date(`2097-${10 + index}-17T00:00:00.000Z`), method,
          idempotencyKey: `${marker}-${method}-replacement`, coverageFromMonth: 10 + index, coverageFromYear: 2097,
          coverageToMonth: 10 + index, coverageToYear: 2097, referenceNumber, remarks: marker,
        });
        check(replacement.paymentId !== original.paymentId && Boolean((await tx.payment.findUniqueOrThrow({ where: { id: replacement.paymentId } })).receiptNumber), `${method} voided-only reference is reusable on a new receipt`);
      }
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
