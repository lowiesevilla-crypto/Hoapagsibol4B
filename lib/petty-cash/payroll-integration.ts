import { EmployeeLoanStatus, PayrollStatus, Prisma } from "@prisma/client";

const AUTO_REMARK_PREFIX = "[AUTO_PETTY_CASH:";
const DEDUCTION_TYPE_PREFIX = "Petty Cash · ";

type PettyCashPayrollPeriod = {
  id: string;
  tenantId: string;
  startDate: Date;
  endDate: Date;
};

type PettyCashAdvanceSchedule = {
  id: string;
  voucherNumber: string;
  transactionDate: Date;
  employeeId: string;
  employeeLoanId: string;
  deductionPerCutoff: Prisma.Decimal;
};

export function calculatePettyCashDeductionAmount(configured: number, loanBalance: number, reservedAmount: number) {
  const safeConfigured = Number.isFinite(configured) ? Math.max(0, configured) : 0;
  const safeBalance = Number.isFinite(loanBalance) ? Math.max(0, loanBalance) : 0;
  const safeReserved = Number.isFinite(reservedAmount) ? Math.max(0, reservedAmount) : 0;
  const available = roundMoney(Math.max(0, safeBalance - safeReserved));
  return roundMoney(Math.min(safeConfigured, available));
}

/**
 * @requirement PAY-DED-001 PAY-LOAN-001
 * @status IMPLEMENTED
 * @description PCV-007 materializes Petty Cash Employee Cash Advance schedules into
 * the current mutable payroll cutoff. The resulting PayrollDeduction remains ordinary
 * payroll input; PR #166's Financial Engine PAYMENT processor is authoritative for
 * repayment, loan-balance mutation, posting, retry, and reversal.
 */
export async function materializePettyCashPayrollDeductions(
  tx: Prisma.TransactionClient,
  period: PettyCashPayrollPeriod,
) {
  const schedules = await tx.$queryRaw<PettyCashAdvanceSchedule[]>(Prisma.sql`
    SELECT id, voucherNumber, transactionDate, employeeId, employeeLoanId, deductionPerCutoff
    FROM PettyCashVoucher
    WHERE tenantId=${period.tenantId}
      AND status='POSTED'
      AND employeeId IS NOT NULL
      AND employeeLoanId IS NOT NULL
      AND deductionPerCutoff IS NOT NULL
      AND deductionPerCutoff > 0
      AND transactionDate <= ${period.endDate}
    ORDER BY transactionDate ASC, voucherNumber ASC
  `);

  const processedLoanIds = new Set<string>();
  for (const schedule of schedules) {
    // A Petty Cash voucher owns one EmployeeLoan. Fail closed if legacy or manual
    // data accidentally points more than one schedule at the same loan.
    if (processedLoanIds.has(schedule.employeeLoanId)) continue;
    processedLoanIds.add(schedule.employeeLoanId);

    const deductionTypeName = `${DEDUCTION_TYPE_PREFIX}${schedule.voucherNumber}`.slice(0, 100);
    const deductionType = await tx.payrollDeductionType.upsert({
      where: { tenantId_name: { tenantId: period.tenantId, name: deductionTypeName } },
      create: {
        tenantId: period.tenantId,
        name: deductionTypeName,
        description: `Automatic Employee Cash Advance repayment from Petty Cash Voucher ${schedule.voucherNumber}.`,
        amount: schedule.deductionPerCutoff,
        active: true,
        applyToMonthly: true,
        applyToDaily: true,
      },
      update: {
        description: `Automatic Employee Cash Advance repayment from Petty Cash Voucher ${schedule.voucherNumber}.`,
        amount: schedule.deductionPerCutoff,
        active: true,
        applyToMonthly: true,
        applyToDaily: true,
      },
      select: { id: true },
    });

    const existing = await tx.payrollDeduction.findFirst({
      where: {
        tenantId: period.tenantId,
        payrollId: period.id,
        employeeId: schedule.employeeId,
        deductionTypeId: deductionType.id,
      },
      select: { id: true, employeeLoanId: true, remarks: true },
    });

    const loan = await tx.employeeLoan.findFirst({
      where: {
        id: schedule.employeeLoanId,
        tenantId: period.tenantId,
        employeeId: schedule.employeeId,
      },
      select: { id: true, status: true, balance: true },
    });

    const isAutomaticExisting = existing?.remarks?.startsWith(`${AUTO_REMARK_PREFIX}${schedule.id}]`) ?? false;
    if (!loan || loan.status !== EmployeeLoanStatus.OPEN || Number(loan.balance) <= 0) {
      if (existing && isAutomaticExisting) await tx.payrollDeduction.delete({ where: { id: existing.id } });
      continue;
    }

    if (existing?.employeeLoanId && existing.employeeLoanId !== loan.id) {
      throw new Error(`Payroll deduction ${deductionTypeName} is already linked to a different employee loan.`);
    }

    const reservedRepayments = await tx.payrollDeduction.findMany({
      where: {
        tenantId: period.tenantId,
        employeeLoanId: loan.id,
        payroll: { status: { not: PayrollStatus.PAID } },
        ...(existing ? { NOT: { id: existing.id } } : {}),
      },
      select: { amount: true },
    });
    const reservedAmount = roundMoney(reservedRepayments.reduce((sum, item) => sum + Number(item.amount), 0));
    const amount = calculatePettyCashDeductionAmount(
      Number(schedule.deductionPerCutoff),
      Number(loan.balance),
      reservedAmount,
    );

    if (amount <= 0) {
      if (existing && isAutomaticExisting) await tx.payrollDeduction.delete({ where: { id: existing.id } });
      continue;
    }

    const remarks = `${AUTO_REMARK_PREFIX}${schedule.id}] Automatic repayment for ${schedule.voucherNumber}. Configured per-cutoff amount: PHP ${Number(schedule.deductionPerCutoff).toFixed(2)}.`;
    await tx.payrollDeduction.upsert({
      where: {
        payrollId_employeeId_deductionTypeId: {
          payrollId: period.id,
          employeeId: schedule.employeeId,
          deductionTypeId: deductionType.id,
        },
      },
      create: {
        tenantId: period.tenantId,
        payrollId: period.id,
        employeeId: schedule.employeeId,
        deductionTypeId: deductionType.id,
        employeeLoanId: loan.id,
        amount,
        remarks,
      },
      update: { employeeLoanId: loan.id, amount, remarks },
    });
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
