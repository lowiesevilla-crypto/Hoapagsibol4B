import {
  EmployeeLoanStatus,
  PayrollOutboxStatus,
  PayrollPostingEventType,
  PayrollPostingStatus,
  PayrollRevisionType,
  PayrollStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";

type DecimalLike = number | string | { toString(): string };

export type PayrollJournalLine = Readonly<{
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  metadata?: Prisma.InputJsonValue;
}>;

type RevisionPayslipEvidence = Readonly<{
  snapshot: Prisma.JsonValue;
  grossPay: DecimalLike;
  deduction: DecimalLike;
  netPay: DecimalLike;
}>;

/**
 * @requirement PAY-FIN-001 PAY-FIN-003
 * @status IMPLEMENTED
 * @description Build balanced accrual, disbursement, or reversal journal lines from one immutable payroll revision.
 */
export function buildPayrollJournalLines(input: {
  eventType: PayrollPostingEventType | "POST" | "PAYMENT" | "REVERSAL";
  revisionType: PayrollRevisionType | "INITIAL" | "CORRECTION" | "DELTA" | "REVERSAL";
  payslips: readonly RevisionPayslipEvidence[];
  loanRepaymentAmount?: DecimalLike;
  paymentWasPosted?: boolean;
}) {
  const totals = summarizeRevisionPayslips(input.payslips, input.revisionType === "REVERSAL");
  const loanRepaymentAmount = roundMoney(Number(input.loanRepaymentAmount ?? 0));
  let lines: PayrollJournalLine[];

  if (input.eventType === "PAYMENT") {
    lines = compactLines([
      line("2100", "Net payroll payable", totals.netPay, 0),
      line("1010", "Cash and cash equivalents", 0, totals.netPay),
      line("2150", "Payroll deduction clearing", loanRepaymentAmount, 0, { purpose: "EMPLOYEE_LOAN_REPAYMENT" }),
      line("1210", "Employee loans receivable", 0, loanRepaymentAmount, { purpose: "EMPLOYEE_LOAN_REPAYMENT" }),
    ]);
  } else {
    const restoredLoanReceivable = input.eventType === "REVERSAL" && input.paymentWasPosted
      ? Math.min(loanRepaymentAmount, totals.otherDeductions)
      : 0;
    const deductionClearing = roundMoney(totals.otherDeductions - restoredLoanReceivable);
    const netLiabilityAccount = input.eventType === "REVERSAL" && input.paymentWasPosted
      ? { code: "1220", name: "Payroll recovery receivable" }
      : { code: "2100", name: "Net payroll payable" };
    const accrual = compactLines([
      line("5100", "Salaries and wages expense", totals.grossPay, 0),
      line("5110", "Employer SSS and EC expense", totals.sssEmployer + totals.employeeCompensation, 0),
      line("5120", "Employer PhilHealth expense", totals.philHealthEmployer, 0),
      line("5130", "Employer Pag-IBIG expense", totals.pagIbigEmployer, 0),
      line("2110", "Compensation withholding tax payable", 0, totals.withholdingTax),
      line("2120", "SSS and EC contributions payable", 0, totals.sssEmployee + totals.sssEmployer + totals.employeeCompensation),
      line("2130", "PhilHealth contributions payable", 0, totals.philHealthEmployee + totals.philHealthEmployer),
      line("2140", "Pag-IBIG contributions payable", 0, totals.pagIbigEmployee + totals.pagIbigEmployer),
      line("2150", "Payroll deduction clearing", 0, deductionClearing),
      line("1210", "Employee loans receivable", 0, restoredLoanReceivable, { purpose: "EMPLOYEE_LOAN_REPAYMENT_REVERSAL" }),
      line(netLiabilityAccount.code, netLiabilityAccount.name, 0, totals.netPay),
    ]);
    lines = input.eventType === "REVERSAL"
      ? accrual.map((item) => ({ ...item, debit: item.credit, credit: item.debit }))
      : accrual;
  }

  assertBalancedJournal(lines);
  return lines;
}

/**
 * @requirement PAY-FIN-001 PAY-FIN-002
 * @status IMPLEMENTED
 * @description Enqueue one tenant/revision/event identity, retry failed delivery safely, then process it through the Financial Engine.
 */
export async function requestPayrollFinancialPosting(input: {
  tenantId: string;
  payrollId: string;
  actorId: string;
  eventType: PayrollPostingEventType;
}) {
  const request = await prisma.$transaction(async (tx) => {
    const payroll = await tx.payrollPeriod.findFirst({
      where: { id: input.payrollId, tenantId: input.tenantId },
      include: { revisions: { where: { tenantId: input.tenantId }, orderBy: { revisionNumber: "desc" } } },
    });
    if (!payroll) throw new Error("Payroll period not found.");
    const revision = selectPostingRevision(payroll, input.eventType);

    const idempotencyKey = `payroll-finance:${input.tenantId}:${revision.id}:${input.eventType}`;
    const existing = await tx.payrollFinancialPosting.findFirst({
      where: { tenantId: input.tenantId, revisionId: revision.id, eventType: input.eventType },
      include: { outbox: true },
    });
    if (existing?.status === PayrollPostingStatus.POSTED) return { postingId: existing.id, outboxId: existing.outboxId, reused: true };
    validatePostingLifecycle(payroll.status, input.eventType);

    if (input.eventType === PayrollPostingEventType.REVERSAL) {
      if (!revision.reversedRevisionId) throw new Error("The reversal revision has no immutable source reference.");
      const sourcePosting = await tx.payrollFinancialPosting.findFirst({
        where: {
          tenantId: input.tenantId,
          revisionId: revision.reversedRevisionId,
          eventType: PayrollPostingEventType.POST,
          status: PayrollPostingStatus.POSTED,
        },
      });
      if (!sourcePosting) throw new Error("Only payroll already posted to the Financial Engine can post a financial reversal.");
    }

    if (existing) {
      await tx.payrollPostingOutbox.update({
        where: { id: existing.outboxId },
        data: { status: PayrollOutboxStatus.PENDING, availableAt: new Date(), lockedAt: null, processedAt: null, lastError: null },
      });
      await tx.payrollFinancialPosting.update({
        where: { id: existing.id },
        data: { status: PayrollPostingStatus.PENDING, errorMessage: null, requestedById: input.actorId },
      });
      if (input.eventType === PayrollPostingEventType.POST) {
        await tx.payrollPeriod.update({ where: { id: payroll.id }, data: { status: PayrollStatus.POSTING } });
      }
      return { postingId: existing.id, outboxId: existing.outboxId, reused: true };
    }

    const outbox = await tx.payrollPostingOutbox.create({
      data: {
        tenantId: input.tenantId,
        idempotencyKey,
        eventType: input.eventType,
        payload: jsonValue({ tenantId: input.tenantId, payrollId: payroll.id, revisionId: revision.id, eventType: input.eventType }),
      },
    });
    const posting = await tx.payrollFinancialPosting.create({
      data: {
        tenantId: input.tenantId,
        payrollId: payroll.id,
        revisionId: revision.id,
        eventType: input.eventType,
        idempotencyKey,
        outboxId: outbox.id,
        requestedById: input.actorId,
      },
    });
    if (input.eventType === PayrollPostingEventType.POST) {
      await tx.payrollPeriod.update({ where: { id: payroll.id }, data: { status: PayrollStatus.POSTING } });
    }
    return { postingId: posting.id, outboxId: outbox.id, reused: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (request.reused) {
    const existing = await prisma.payrollFinancialPosting.findFirst({ where: { id: request.postingId, tenantId: input.tenantId } });
    if (existing?.status === PayrollPostingStatus.POSTED) return existing;
  }
  return processPayrollPostingOutbox({ tenantId: input.tenantId, outboxId: request.outboxId });
}

/**
 * @requirement PAY-FIN-002
 * @status IMPLEMENTED
 * @description Process one claimed outbox record transactionally; failures remain retryable without duplicate journals.
 */
export async function processPayrollPostingOutbox(input: { tenantId: string; outboxId: string }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.payrollPostingOutbox.updateMany({
        where: { id: input.outboxId, tenantId: input.tenantId, status: { in: [PayrollOutboxStatus.PENDING, PayrollOutboxStatus.FAILED] }, availableAt: { lte: new Date() } },
        data: { status: PayrollOutboxStatus.PROCESSING, lockedAt: new Date(), attemptCount: { increment: 1 }, lastError: null },
      });
      const outbox = await tx.payrollPostingOutbox.findFirst({
        where: { id: input.outboxId, tenantId: input.tenantId },
        include: {
          posting: {
            include: {
              revision: { include: { payslips: { orderBy: { employeeId: "asc" } } } },
              payroll: {
                include: {
                  deductions: { where: { tenantId: input.tenantId, employeeLoanId: { not: null } }, include: { employeeLoan: true } },
                  financialPostings: { where: { tenantId: input.tenantId } },
                },
              },
            },
          },
        },
      });
      if (!outbox?.posting) throw new Error("Payroll posting outbox record is incomplete.");
      if (outbox.status === PayrollOutboxStatus.COMPLETED && outbox.posting.status === PayrollPostingStatus.POSTED) return outbox.posting;
      if (claimed.count !== 1 || outbox.status !== PayrollOutboxStatus.PROCESSING) throw new Error("Payroll posting is already being processed.");

      await tx.payrollFinancialPosting.update({ where: { id: outbox.posting.id }, data: { status: PayrollPostingStatus.PROCESSING, errorMessage: null } });
      const loanRepaymentAmount = outbox.posting.payroll.deductions.reduce((sum, item) => sum + Number(item.amount), 0);
      const paymentWasPosted = outbox.posting.payroll.financialPostings.some((item) => item.eventType === PayrollPostingEventType.PAYMENT && item.status === PayrollPostingStatus.POSTED);
      const lines = buildPayrollJournalLines({
        eventType: outbox.eventType,
        revisionType: outbox.posting.revision.revisionType,
        payslips: outbox.posting.revision.payslips,
        loanRepaymentAmount,
        paymentWasPosted,
      });
      let journal = await tx.financialJournalEntry.findFirst({ where: { tenantId: input.tenantId, idempotencyKey: outbox.idempotencyKey } });
      if (!journal) {
        journal = await tx.financialJournalEntry.create({
          data: {
            tenantId: input.tenantId,
            idempotencyKey: outbox.idempotencyKey,
            entryDate: outbox.posting.payroll.payDate,
            description: journalDescription(outbox.eventType, outbox.posting.payroll.startDate, outbox.posting.payroll.endDate),
            sourceType: "PAYROLL_PERIOD",
            sourceId: outbox.posting.payrollId,
            sourceRevisionId: outbox.posting.revisionId,
            eventType: outbox.eventType,
            postedById: outbox.posting.requestedById,
            lines: {
              create: lines.map((item, index) => ({ tenantId: input.tenantId, lineOrder: index + 1, ...item })),
            },
          },
        });
      }

      if (outbox.eventType === PayrollPostingEventType.PAYMENT) {
        await applyLoanRepayments(tx as unknown as Prisma.TransactionClient, input.tenantId, outbox.posting.payroll.deductions);
        await tx.payrollPeriod.update({ where: { id: outbox.posting.payrollId }, data: { status: PayrollStatus.PAID } });
      } else if (outbox.eventType === PayrollPostingEventType.POST) {
        await tx.payrollPeriod.update({ where: { id: outbox.posting.payrollId }, data: { status: PayrollStatus.POSTED } });
      } else if (paymentWasPosted) {
        await restoreLoanRepayments(tx as unknown as Prisma.TransactionClient, input.tenantId, outbox.posting.payroll.deductions);
      }

      const now = new Date();
      const posting = await tx.payrollFinancialPosting.update({
        where: { id: outbox.posting.id },
        data: { status: PayrollPostingStatus.POSTED, journalEntryId: journal.id, postedAt: now, errorMessage: null },
      });
      await tx.payrollPostingOutbox.update({
        where: { id: outbox.id },
        data: { status: PayrollOutboxStatus.COMPLETED, processedAt: now, lockedAt: null, lastError: null },
      });
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorId: outbox.posting.requestedById,
          module: "PAYROLL",
          action: `PAYROLL_FINANCE_${outbox.eventType}_POSTED`,
          entityType: "PayrollFinancialPosting",
          entityId: posting.id,
          metadata: { payrollId: posting.payrollId, revisionId: posting.revisionId, journalEntryId: journal.id, idempotencyKey: posting.idempotencyKey },
        },
      });
      return posting;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const message = safeError(error);
    await prisma.$transaction(async (tx) => {
      const outbox = await tx.payrollPostingOutbox.findFirst({ where: { id: input.outboxId, tenantId: input.tenantId }, include: { posting: true } });
      if (!outbox?.posting || outbox.status === PayrollOutboxStatus.COMPLETED) return;
      await tx.payrollPostingOutbox.update({ where: { id: outbox.id }, data: { status: PayrollOutboxStatus.FAILED, lockedAt: null, lastError: message } });
      await tx.payrollFinancialPosting.update({ where: { id: outbox.posting.id }, data: { status: PayrollPostingStatus.FAILED, errorMessage: message } });
      if (outbox.eventType === PayrollPostingEventType.POST) {
        await tx.payrollPeriod.updateMany({ where: { id: outbox.posting.payrollId, tenantId: input.tenantId, status: PayrollStatus.POSTING }, data: { status: PayrollStatus.POST_FAILED } });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    throw error;
  }
}

/**
 * @requirement PAY-FIN-002 PAY-SEC-001
 * @status IMPLEMENTED
 * @description Process a bounded tenant-scoped batch of pending or retryable payroll finance events.
 */
export async function processReadyPayrollPostingOutbox(tenantId: string, limit = 25) {
  const records = await prisma.payrollPostingOutbox.findMany({
    where: { tenantId, status: { in: [PayrollOutboxStatus.PENDING, PayrollOutboxStatus.FAILED] }, availableAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: Math.min(100, Math.max(1, limit)),
  });
  const results = [];
  for (const record of records) {
    try {
      results.push(await processPayrollPostingOutbox({ tenantId, outboxId: record.id }));
    } catch {
      // The processor persists bounded failure evidence; continue to the next record.
    }
  }
  return results;
}

/**
 * @requirement PAY-FIN-001 PAY-FIN-003
 * @status IMPLEMENTED
 * @description Reject negative, double-sided, or out-of-balance payroll journal lines before persistence.
 */
export function assertBalancedJournal(lines: readonly PayrollJournalLine[]) {
  const totals = lines.reduce((sum, item) => ({ debit: roundMoney(sum.debit + item.debit), credit: roundMoney(sum.credit + item.credit) }), { debit: 0, credit: 0 });
  if (lines.some((item) => item.debit < 0 || item.credit < 0 || (item.debit > 0 && item.credit > 0))) throw new Error("Financial journal lines must contain one non-negative debit or credit.");
  if (Math.abs(totals.debit - totals.credit) > 0.005) throw new Error(`Payroll journal is out of balance by ${roundMoney(totals.debit - totals.credit)}.`);
  return totals;
}

function selectPostingRevision(
  payroll: { revisions: Array<{ id: string; revisionType: PayrollRevisionType; reversedRevisionId: string | null }> },
  eventType: PayrollPostingEventType,
) {
  if (eventType === PayrollPostingEventType.REVERSAL) {
    const reversal = payroll.revisions.find((item) => item.revisionType === PayrollRevisionType.REVERSAL);
    if (!reversal) throw new Error("Record immutable payroll reversal evidence before posting a financial reversal.");
    return reversal;
  }
  if (payroll.revisions[0]?.revisionType === PayrollRevisionType.REVERSAL) throw new Error("Reversed payroll cannot be posted or paid as an ordinary payroll.");
  const revision = payroll.revisions.find((item) => item.revisionType !== PayrollRevisionType.REVERSAL);
  if (!revision) throw new Error("Payroll has no immutable finalized revision to post.");
  return revision;
}

function validatePostingLifecycle(status: PayrollStatus, eventType: PayrollPostingEventType) {
  const postableStatuses: readonly PayrollStatus[] = [PayrollStatus.FINALIZED, PayrollStatus.POST_FAILED];
  const reversibleStatuses: readonly PayrollStatus[] = [PayrollStatus.POSTED, PayrollStatus.PAID];
  if (eventType === PayrollPostingEventType.POST && !postableStatuses.includes(status)) {
    throw new Error("Only finalized or failed-posting payroll can post to the Financial Engine.");
  }
  if (eventType === PayrollPostingEventType.PAYMENT && status !== PayrollStatus.POSTED) {
    throw new Error("Only posted payroll can record net-pay disbursement and become paid.");
  }
  if (eventType === PayrollPostingEventType.REVERSAL && !reversibleStatuses.includes(status)) {
    throw new Error("Only posted or paid payroll can post a financial reversal.");
  }
}

function summarizeRevisionPayslips(payslips: readonly RevisionPayslipEvidence[], reversal: boolean) {
  return payslips.reduce((sum, evidence) => {
    const wrapper = asRecord(evidence.snapshot);
    const snapshot = reversal ? asRecord(wrapper.sourceSnapshot) : wrapper;
    const grossPay = Math.abs(Number(evidence.grossPay));
    const deduction = Math.abs(Number(evidence.deduction));
    const netPay = Math.abs(Number(evidence.netPay));
    const statutoryDeduction = Math.abs(numberField(snapshot, "statutoryDeduction"));
    return {
      grossPay: roundMoney(sum.grossPay + grossPay),
      netPay: roundMoney(sum.netPay + netPay),
      otherDeductions: roundMoney(sum.otherDeductions + Math.max(0, deduction - statutoryDeduction)),
      sssEmployee: roundMoney(sum.sssEmployee + Math.abs(numberField(snapshot, "sssEmployeeContribution"))),
      sssEmployer: roundMoney(sum.sssEmployer + Math.abs(numberField(snapshot, "sssEmployerContribution"))),
      employeeCompensation: roundMoney(sum.employeeCompensation + Math.abs(numberField(snapshot, "employeeCompensationContribution"))),
      philHealthEmployee: roundMoney(sum.philHealthEmployee + Math.abs(numberField(snapshot, "philHealthEmployeeContribution"))),
      philHealthEmployer: roundMoney(sum.philHealthEmployer + Math.abs(numberField(snapshot, "philHealthEmployerContribution"))),
      pagIbigEmployee: roundMoney(sum.pagIbigEmployee + Math.abs(numberField(snapshot, "pagIbigEmployeeContribution"))),
      pagIbigEmployer: roundMoney(sum.pagIbigEmployer + Math.abs(numberField(snapshot, "pagIbigEmployerContribution"))),
      withholdingTax: roundMoney(sum.withholdingTax + Math.abs(numberField(snapshot, "withholdingTax"))),
    };
  }, emptyPostingTotals());
}

async function applyLoanRepayments(
  tx: Prisma.TransactionClient,
  tenantId: string,
  deductions: Array<{ amount: DecimalLike; employeeLoan: { id: string; tenantId: string; description: string; status: EmployeeLoanStatus; amountPaid: DecimalLike; balance: DecimalLike } | null }>,
) {
  for (const deduction of deductions) {
    const loan = deduction.employeeLoan;
    if (!loan) continue;
    if (loan.tenantId !== tenantId || loan.status !== EmployeeLoanStatus.OPEN) throw new Error(`Loan ${loan.description} is not available for tenant-scoped repayment.`);
    const amount = Number(deduction.amount);
    const balance = Number(loan.balance);
    if (amount > balance + 0.005) throw new Error(`Repayment for ${loan.description} exceeds the remaining balance.`);
    const nextBalance = roundMoney(Math.max(0, balance - amount));
    await tx.employeeLoan.update({
      where: { id: loan.id },
      data: { amountPaid: roundMoney(Number(loan.amountPaid) + amount), balance: nextBalance, status: nextBalance <= 0 ? EmployeeLoanStatus.PAID : EmployeeLoanStatus.OPEN },
    });
  }
}

async function restoreLoanRepayments(
  tx: Prisma.TransactionClient,
  tenantId: string,
  deductions: Array<{ amount: DecimalLike; employeeLoan: { id: string; tenantId: string; description: string; principalAmount: DecimalLike; amountPaid: DecimalLike; balance: DecimalLike } | null }>,
) {
  for (const deduction of deductions) {
    const loan = deduction.employeeLoan;
    if (!loan) continue;
    if (loan.tenantId !== tenantId) throw new Error(`Loan ${loan.description} is outside the authenticated tenant.`);
    const amount = Number(deduction.amount);
    const nextPaid = roundMoney(Number(loan.amountPaid) - amount);
    if (nextPaid < -0.005) throw new Error(`Loan ${loan.description} cannot reverse more than the recorded repayment.`);
    const nextBalance = roundMoney(Math.min(Number(loan.principalAmount), Number(loan.balance) + amount));
    await tx.employeeLoan.update({ where: { id: loan.id }, data: { amountPaid: Math.max(0, nextPaid), balance: nextBalance, status: EmployeeLoanStatus.OPEN } });
  }
}

function compactLines(lines: PayrollJournalLine[]) {
  return lines.filter((item) => item.debit > 0 || item.credit > 0);
}

function line(accountCode: string, accountName: string, debit: number, credit: number, metadata?: Prisma.InputJsonValue): PayrollJournalLine {
  return { accountCode, accountName, debit: roundMoney(debit), credit: roundMoney(credit), ...(metadata ? { metadata } : {}) };
}

function emptyPostingTotals() {
  return { grossPay: 0, netPay: 0, otherDeductions: 0, sssEmployee: 0, sssEmployer: 0, employeeCompensation: 0, philHealthEmployee: 0, philHealthEmployer: 0, pagIbigEmployee: 0, pagIbigEmployer: 0, withholdingTax: 0 };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberField(record: Record<string, unknown>, key: string) {
  const value = Number(record[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function journalDescription(eventType: PayrollPostingEventType, startDate: Date, endDate: Date) {
  const period = `${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}`;
  if (eventType === PayrollPostingEventType.PAYMENT) return `Payroll net-pay disbursement for ${period}`;
  if (eventType === PayrollPostingEventType.REVERSAL) return `Payroll financial reversal for ${period}`;
  return `Payroll accrual for ${period}`;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown payroll posting failure.";
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 1000);
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
