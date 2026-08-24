import { EmployeeLoanStatus, PayrollDeductionScheduleMode, PayrollDeductionScheduleStatus, PayrollStatus, Prisma } from "@prisma/client";

type PayrollCutoff = Readonly<{
  id: string;
  tenantId: string;
  startDate: Date;
  endDate: Date;
  status: PayrollStatus;
}>;

type ScheduleWindow = Readonly<{
  mode: PayrollDeductionScheduleMode;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  installmentLimit: number | null;
}>;

export type ScheduleMaterializationResult = Readonly<{
  created: number;
  updated: number;
  removed: number;
  skipped: number;
}>;

/**
 * @requirement PAY-DED-002 PAY-LOAN-002
 * @status VERIFIED
 * @description Decide whether a schedule is eligible for a cutoff without reading mutable browser state.
 */
export function isDeductionScheduleEligible(
  schedule: ScheduleWindow,
  cutoffEndDate: Date,
  priorInstallments: number,
) {
  if (schedule.effectiveFrom > cutoffEndDate) return false;
  if (schedule.effectiveTo && schedule.effectiveTo < cutoffEndDate) return false;
  if (schedule.mode === PayrollDeductionScheduleMode.ONE_TIME && priorInstallments > 0) return false;
  if (schedule.installmentLimit !== null && priorInstallments >= schedule.installmentLimit) return false;
  return true;
}

/**
 * @requirement PAY-LOAN-001 PAY-LOAN-002
 * @status VERIFIED
 * @description Cap a generated repayment at the loan balance that remains after other unpaid payroll reservations.
 */
export function scheduledDeductionAmount(
  amountPerCutoff: number,
  loanBalance?: number,
  reservedAmount = 0,
) {
  const configured = roundMoney(Math.max(0, amountPerCutoff));
  if (loanBalance === undefined) return configured;
  const available = roundMoney(Math.max(0, loanBalance - Math.max(0, reservedAmount)));
  return roundMoney(Math.min(configured, available));
}

/**
 * @requirement PAY-SEC-001 PAY-DED-002 PAY-LOAN-002
 * @status VERIFIED
 * @description Materialize active tenant-scoped schedules into one mutable payroll cutoff idempotently.
 */
export async function materializePayrollDeductionSchedules(
  tx: Prisma.TransactionClient,
  period: PayrollCutoff,
): Promise<ScheduleMaterializationResult> {
  if (period.status !== PayrollStatus.DRAFT && period.status !== PayrollStatus.CALCULATED) {
    return { created: 0, updated: 0, removed: 0, skipped: 0 };
  }

  const schedules = await tx.payrollDeductionSchedule.findMany({
    where: {
      tenantId: period.tenantId,
      status: PayrollDeductionScheduleStatus.ACTIVE,
      effectiveFrom: { lte: period.endDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: period.endDate } }],
    },
    include: {
      employeeLoan: { select: { id: true, employeeId: true, balance: true, status: true } },
      payrollDeductions: { select: { id: true, payrollId: true } },
    },
    orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
  });

  let created = 0;
  let updated = 0;
  let removed = 0;
  let skipped = 0;

  for (const schedule of schedules) {
    const current = schedule.payrollDeductions.find((deduction) => deduction.payrollId === period.id);
    const priorInstallments = schedule.payrollDeductions.filter((deduction) => deduction.payrollId !== period.id).length;
    if (!isDeductionScheduleEligible(schedule, period.endDate, priorInstallments)) {
      skipped += 1;
      continue;
    }

    if (schedule.mode === PayrollDeductionScheduleMode.UNTIL_FULLY_PAID && !schedule.employeeLoan) {
      skipped += 1;
      continue;
    }

    let reservedAmount = 0;
    if (schedule.employeeLoan) {
      if (schedule.employeeLoan.employeeId !== schedule.employeeId || schedule.employeeLoan.status !== EmployeeLoanStatus.OPEN) {
        if (schedule.employeeLoan.status === EmployeeLoanStatus.PAID) {
          await tx.payrollDeductionSchedule.update({ where: { id: schedule.id }, data: { status: PayrollDeductionScheduleStatus.COMPLETED } });
        }
        if (current) {
          await tx.payrollDeduction.delete({ where: { id: current.id } });
          removed += 1;
        } else {
          skipped += 1;
        }
        continue;
      }
      const reservations = await tx.payrollDeduction.findMany({
        where: {
          tenantId: period.tenantId,
          employeeLoanId: schedule.employeeLoan.id,
          payroll: { status: { not: PayrollStatus.PAID } },
          ...(current ? { NOT: { id: current.id } } : {}),
        },
        select: { amount: true },
      });
      reservedAmount = reservations.reduce((sum, deduction) => sum + Number(deduction.amount), 0);
    }

    const amount = scheduledDeductionAmount(
      Number(schedule.amountPerCutoff),
      schedule.employeeLoan ? Number(schedule.employeeLoan.balance) : undefined,
      reservedAmount,
    );
    if (amount <= 0) {
      if (current) {
        await tx.payrollDeduction.delete({ where: { id: current.id } });
        removed += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    if (current) {
      await tx.payrollDeduction.update({
        where: { id: current.id },
        data: { amount, employeeLoanId: schedule.employeeLoanId, remarks: schedule.reason },
      });
      updated += 1;
      continue;
    }

    const conflictingDeduction = await tx.payrollDeduction.findFirst({
      where: {
        tenantId: period.tenantId,
        payrollId: period.id,
        employeeId: schedule.employeeId,
        deductionTypeId: schedule.deductionTypeId,
      },
      select: { id: true },
    });
    if (conflictingDeduction) {
      skipped += 1;
      continue;
    }

    await tx.payrollDeduction.create({
      data: {
        tenantId: period.tenantId,
        payrollId: period.id,
        employeeId: schedule.employeeId,
        deductionTypeId: schedule.deductionTypeId,
        employeeLoanId: schedule.employeeLoanId,
        scheduleId: schedule.id,
        amount,
        remarks: schedule.reason,
      },
    });
    created += 1;
  }

  return { created, updated, removed, skipped };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
