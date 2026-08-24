"use server";

import { EmployeeLoanStatus, OvertimeSource, OvertimeStatus, PayrollAccessRole, PayrollDayType, PayrollPostingEventType, PayrollRevisionType, PayrollStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { payrollApprovalRoles, payrollManageRoles, payrollWriteRoles, requirePayrollAccess } from "@/lib/payroll-access";
import { normalizePayrollCorrectionReason } from "@/lib/payroll-lifecycle";
import { calculatePayslip } from "@/lib/services/payroll";
import { requestPayrollFinancialPosting } from "@/lib/services/payroll-finance";
import {
  calculateStatutoryContributions,
  parsePhilippineStatutoryRules,
  payrollPolicyFromStatutoryRules,
  type PayrollStatutoryRuleRecord,
} from "@/lib/services/payroll-statutory";
import { employeeLoanSchema, employeeScheduleRangeSchema, overtimeRecordSchema, payrollAccessSchema, payrollCalendarSchema, payrollDeductionSchema, payrollDeductionTypeSchema, payrollPeriodSchema } from "@/lib/validation";

const MUTABLE_PAYROLL_STATUSES: readonly PayrollStatus[] = [PayrollStatus.DRAFT, PayrollStatus.CALCULATED];

/**
 * @requirement PAY-SEC-001 PAY-CALC-001
 * @status IMPLEMENTED
 */
export async function generatePayrollAction(formData: FormData) {
  const { user: admin } = await requirePayrollAccess(payrollWriteRoles);
  const parsed = payrollPeriodSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid payroll period.");
  const startDate = new Date(`${parsed.data.startDate}T00:00:00.000Z`);
  const endDate = new Date(`${parsed.data.endDate}T00:00:00.000Z`);
  const payDate = new Date(`${parsed.data.payDate}T00:00:00.000Z`);
  if (startDate > endDate) throw new Error("Payroll start date must be on or before the end date.");
  const periodId = await calculatePeriod({ startDate, endDate, payDate, createdById: admin.id });
  await writeAuditLog({ actorId: admin.id, module: "PAYROLL", action: "GENERATE_PAYROLL", entityType: "PayrollPeriod", entityId: periodId, metadata: { startDate, endDate, payDate } });
  redirect(`/admin/payroll?section=processing&period=${periodId}&success=calculated`);
}

/**
 * @requirement PAY-SEC-001 PAY-RUN-003
 * @status IMPLEMENTED
 */
export async function recalculatePayrollAction(formData: FormData) {
  const { user: admin } = await requirePayrollAccess(payrollWriteRoles);
  const id = String(formData.get("id") || "");
  const period = await prisma.payrollPeriod.findFirst({ where: { id, tenantId: admin.tenantId } });
  if (!period) throw new Error("Payroll period not found.");
  if (!MUTABLE_PAYROLL_STATUSES.includes(period.status)) throw new Error("Finalized or paid payroll requires a controlled correction before recalculation.");
  const periodId = await calculatePeriod({ startDate: period.startDate, endDate: period.endDate, payDate: period.payDate, createdById: admin.id });
  await writeAuditLog({ actorId: admin.id, module: "PAYROLL", action: "RECALCULATE_PAYROLL", entityType: "PayrollPeriod", entityId: periodId });
  redirect(`/admin/payroll?section=processing&period=${periodId}&success=recalculated`);
}

/**
 * @requirement PAY-SEC-001 PAY-CALC-001
 * @status IMPLEMENTED
 */
async function calculatePeriod(input: { startDate: Date; endDate: Date; payDate: Date; createdById: string }) {
  return prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUniqueOrThrow({ where: { id: input.createdById }, select: { tenantId: true } });
    const statutoryRuleSet = await tx.payrollStatutoryRuleSet.findFirst({
      where: {
        active: true,
        jurisdiction: "PH",
        effectiveFrom: { lte: input.payDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.payDate } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!statutoryRuleSet) throw new Error("No verified Philippine statutory rule set applies to this payroll pay date.");
    parsePhilippineStatutoryRules(statutoryRuleSet.rules);
    const existing = await tx.payrollPeriod.findUnique({ where: { tenantId_startDate_endDate: { tenantId: actor.tenantId, startDate: input.startDate, endDate: input.endDate } } });
    if (existing && !MUTABLE_PAYROLL_STATUSES.includes(existing.status)) throw new Error("Finalized or paid payroll requires a controlled correction before recalculation.");
    const period = existing
      ? await tx.payrollPeriod.update({ where: { id: existing.id }, data: { payDate: input.payDate, statutoryRuleSetId: statutoryRuleSet.id } })
      : await tx.payrollPeriod.create({ data: { ...input, tenantId: actor.tenantId, statutoryRuleSetId: statutoryRuleSet.id } });
    await refreshPeriodPayslips(tx as unknown as Prisma.TransactionClient, period, statutoryRuleSet);
    await tx.payrollPeriod.update({ where: { id: period.id }, data: { status: PayrollStatus.CALCULATED } });
    return period.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/**
 * @requirement PAY-SEC-001 PAY-CALC-001 PAY-ATT-001 PAY-OT-001 PAY-COMP-002 PAY-COMP-003
 * @status IMPLEMENTED
 * @description Resolve the employee payroll configuration effective on the cutoff end date and persist an immutable configuration snapshot on the payslip.
 */
async function refreshPeriodPayslips(
  tx: Prisma.TransactionClient,
  period: { id: string; tenantId: string; startDate: Date; endDate: Date },
  statutoryRuleSet: PayrollStatutoryRuleRecord,
) {
  const statutoryRules = parsePhilippineStatutoryRules(statutoryRuleSet.rules);
  const calculationPolicy = payrollPolicyFromStatutoryRules(statutoryRuleSet.code, statutoryRules);
  const employees = await tx.employeeProfile.findMany({
    where: { tenantId: period.tenantId, status: "ACTIVE", hireDate: { lte: period.endDate } },
    include: {
      attendance: { where: { tenantId: period.tenantId, date: { gte: period.startDate, lte: period.endDate } } },
      compensations: {
        where: {
          tenantId: period.tenantId,
          effectiveFrom: { lte: period.endDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: period.endDate } }],
        },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
      },
    },
  });
  const assignedDeductions = await tx.payrollDeduction.findMany({
    where: { tenantId: period.tenantId, payrollId: period.id },
    select: { employeeId: true, amount: true },
  });
  const approvedOvertime = await tx.overtimeRecord.findMany({
    where: { tenantId: period.tenantId, status: OvertimeStatus.APPROVED, date: { gte: period.startDate, lte: period.endDate } },
    select: { employeeId: true, hours: true, source: true, date: true, attendance: { select: { isRestDay: true, holidayType: true } } },
  });
  const deductionsByEmployee = new Map<string, { amount: Prisma.Decimal }[]>();
  for (const deduction of assignedDeductions) {
    const employeeDeductions = deductionsByEmployee.get(deduction.employeeId) ?? [];
    employeeDeductions.push({ amount: deduction.amount });
    deductionsByEmployee.set(deduction.employeeId, employeeDeductions);
  }
  const attendanceContext = new Map(
    employees.flatMap((employee) => employee.attendance.map((attendance) => [
      `${employee.id}:${attendance.date.toISOString().slice(0, 10)}`,
      { isRestDay: attendance.isRestDay, holidayType: attendance.holidayType },
    ] as const)),
  );
  const overtimeByEmployee = new Map<string, { hours: Prisma.Decimal; source: OvertimeSource; isRestDay: boolean; holidayType: PayrollDayType | null }[]>();
  for (const overtime of approvedOvertime) {
    const employeeOvertime = overtimeByEmployee.get(overtime.employeeId) ?? [];
    const day = overtime.attendance ?? attendanceContext.get(`${overtime.employeeId}:${overtime.date.toISOString().slice(0, 10)}`);
    employeeOvertime.push({ hours: overtime.hours, source: overtime.source, isRestDay: day?.isRestDay ?? false, holidayType: day?.holidayType ?? null });
    overtimeByEmployee.set(overtime.employeeId, employeeOvertime);
  }
  const activeIds = employees.map((employee) => employee.id);
  await tx.payslip.deleteMany({ where: { tenantId: period.tenantId, payrollId: period.id, ...(activeIds.length ? { employeeId: { notIn: activeIds } } : {}) } });

  for (const employee of employees) {
    const compensation = employee.compensations[0];
    const payrollEmployee = compensation ? {
      compensationBasis: compensation.compensationBasis,
      payFrequency: compensation.payFrequency,
      attendancePolicy: compensation.attendancePolicy,
      rate: compensation.rate,
      standardWorkDays: compensation.standardWorkDays,
      standardHoursPerDay: compensation.standardHoursPerDay,
      fixedAllowance: compensation.fixedAllowance,
      fixedDeduction: compensation.fixedDeduction,
    } : employee;

    const values = calculatePayslip(
      payrollEmployee,
      employee.attendance,
      deductionsByEmployee.get(employee.id) ?? [],
      overtimeByEmployee.get(employee.id) ?? [],
      calculationPolicy,
    );
    const payFrequency = compensation?.payFrequency ?? "SEMI_MONTHLY";
    const monthlyBasicSalary = resolveMonthlyBasicSalary({
      compensationBasis: compensation?.compensationBasis ?? (employee.salaryType === "DAILY" ? "DAILY" : "MONTHLY"),
      payFrequency,
      rate: compensation?.rate ?? employee.baseRate,
      standardWorkDays: compensation?.standardWorkDays ?? employee.standardWorkDays,
      standardHoursPerDay: compensation?.standardHoursPerDay ?? calculationPolicy.standardHoursPerDay,
    });
    const statutory = calculateStatutoryContributions({ monthlyBasicSalary, grossPay: values.grossPay, payFrequency, rules: statutoryRules });
    const compensationSnapshot = compensation ? {
      source: "EMPLOYEE_COMPENSATION",
      compensationId: compensation.id,
      resolvedForDate: period.endDate.toISOString(),
      effectiveFrom: compensation.effectiveFrom.toISOString(),
      effectiveTo: compensation.effectiveTo?.toISOString() ?? null,
      compensationBasis: compensation.compensationBasis,
      payFrequency: compensation.payFrequency,
      attendancePolicy: compensation.attendancePolicy,
      rate: compensation.rate.toString(),
      standardWorkDays: compensation.standardWorkDays,
      standardHoursPerDay: compensation.standardHoursPerDay.toString(),
      fixedAllowance: compensation.fixedAllowance.toString(),
      fixedDeduction: compensation.fixedDeduction.toString(),
    } : {
      source: "LEGACY_EMPLOYEE_PROFILE",
      resolvedForDate: period.endDate.toISOString(),
      salaryType: employee.salaryType,
      baseRate: employee.baseRate.toString(),
      standardWorkDays: employee.standardWorkDays,
      fixedAllowance: employee.fixedAllowance.toString(),
      fixedDeduction: employee.fixedDeduction.toString(),
    };
    const deduction = roundMoney(values.deduction + statutory.statutoryDeduction);
    const payslipValues = {
      ...values,
      deduction,
      netPay: roundMoney(Math.max(0, values.grossPay - deduction)),
      compensationId: compensation?.id ?? null,
      compensationSnapshot,
      statutoryRuleSetId: statutoryRuleSet.id,
      statutorySnapshot: jsonValue({
        ruleSet: {
          id: statutoryRuleSet.id,
          code: statutoryRuleSet.code,
          name: statutoryRuleSet.name,
          jurisdiction: statutoryRuleSet.jurisdiction,
          effectiveFrom: statutoryRuleSet.effectiveFrom,
          effectiveTo: statutoryRuleSet.effectiveTo,
          contentHash: statutoryRuleSet.contentHash,
          sourceSnapshot: statutoryRuleSet.sourceSnapshot,
          rules: statutoryRuleSet.rules,
        },
        calculation: statutory,
      }),
      sssEmployeeContribution: statutory.sssEmployeeContribution,
      sssEmployerContribution: statutory.sssEmployerContribution,
      employeeCompensationContribution: statutory.employeeCompensationContribution,
      philHealthEmployeeContribution: statutory.philHealthEmployeeContribution,
      philHealthEmployerContribution: statutory.philHealthEmployerContribution,
      pagIbigEmployeeContribution: statutory.pagIbigEmployeeContribution,
      pagIbigEmployerContribution: statutory.pagIbigEmployerContribution,
      withholdingTax: statutory.withholdingTax,
      statutoryDeduction: statutory.statutoryDeduction,
      employerContribution: statutory.employerContribution,
    };

    await tx.payslip.upsert({
      where: { payrollId_employeeId: { payrollId: period.id, employeeId: employee.id } },
      create: { tenantId: period.tenantId, payrollId: period.id, employeeId: employee.id, ...payslipValues },
      update: payslipValues,
    });
  }
}

/**
 * @requirement PAY-RUN-001 PAY-RUN-003 PAY-SEC-001
 * @status IMPLEMENTED
 * @description Creates immutable tenant-scoped revision evidence before a calculated payroll becomes finalized.
 */
async function createImmutablePayrollRevision(tx: Prisma.TransactionClient, input: { tenantId: string; payrollId: string; actorId: string }) {
  const period = await tx.payrollPeriod.findFirst({
    where: { id: input.payrollId, tenantId: input.tenantId },
    include: {
      payslips: { where: { tenantId: input.tenantId }, orderBy: { employeeId: "asc" } },
      deductions: { where: { tenantId: input.tenantId }, orderBy: { createdAt: "asc" } },
      statutoryRuleSet: true,
    },
  });
  if (!period) throw new Error("Payroll period not found.");
  if (period.status !== PayrollStatus.CALCULATED) throw new Error("Only calculated payroll can be finalized.");
  if (!period.payslips.length) throw new Error("Calculate at least one employee payslip before finalizing.");
  if (!period.statutoryRuleSet) throw new Error("Calculated payroll has no verified statutory rule-set evidence.");
  if (period.payslips.some((payslip) => payslip.statutoryRuleSetId !== period.statutoryRuleSetId || !payslip.statutorySnapshot)) {
    throw new Error("Every payslip must retain the statutory rule set used by this calculation before finalization.");
  }

  const latestRevision = await tx.payrollCalculationRevision.findFirst({
    where: { tenantId: input.tenantId, payrollId: period.id },
    include: { payslips: true },
    orderBy: { revisionNumber: "desc" },
  });
  const parentRevision = period.pendingParentRevisionId
    ? await tx.payrollCalculationRevision.findFirst({
      where: { id: period.pendingParentRevisionId, tenantId: input.tenantId, payrollId: period.id },
      include: { payslips: true },
    })
    : latestRevision;
  if (period.pendingParentRevisionId && !parentRevision) throw new Error("The correction source revision is outside the authenticated payroll scope.");

  const revisionType = period.pendingRevisionType
    ?? (latestRevision ? PayrollRevisionType.DELTA : PayrollRevisionType.INITIAL);
  const reason = revisionType === PayrollRevisionType.CORRECTION || revisionType === PayrollRevisionType.DELTA
    ? normalizePayrollCorrectionReason(period.pendingRevisionReason ?? "Calculated payroll finalized as a new immutable revision.")
    : period.pendingRevisionReason;
  const revisionNumber = (latestRevision?.revisionNumber ?? 0) + 1;
  const parentByEmployee = new Map((parentRevision?.payslips ?? []).map((item) => [item.employeeId, item]));
  const employeeIds = period.payslips.map((item) => item.employeeId);
  const [adjustments, overtimeRecords] = await Promise.all([
    tx.attendanceAdjustment.findMany({
      where: { tenantId: input.tenantId, attendance: { employeeId: { in: employeeIds }, date: { gte: period.startDate, lte: period.endDate } } },
      include: { attendance: true },
      orderBy: { createdAt: "asc" },
    }),
    tx.overtimeRecord.findMany({
      where: { tenantId: input.tenantId, employeeId: { in: employeeIds }, date: { gte: period.startDate, lte: period.endDate } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const totals = period.payslips.reduce((sum, slip) => ({
    grossPay: roundMoney(sum.grossPay + Number(slip.grossPay)),
    deduction: roundMoney(sum.deduction + Number(slip.deduction)),
    netPay: roundMoney(sum.netPay + Number(slip.netPay)),
  }), { grossPay: 0, deduction: 0, netPay: 0 });
  const parentTotals = parentRevision?.payslips.reduce((sum, slip) => ({
    grossPay: roundMoney(sum.grossPay + Number(slip.grossPay)),
    deduction: roundMoney(sum.deduction + Number(slip.deduction)),
    netPay: roundMoney(sum.netPay + Number(slip.netPay)),
  }), { grossPay: 0, deduction: 0, netPay: 0 }) ?? { grossPay: 0, deduction: 0, netPay: 0 };

  return tx.payrollCalculationRevision.create({
    data: {
      tenantId: input.tenantId,
      payrollId: period.id,
      revisionNumber,
      revisionType,
      lifecycleStatus: PayrollStatus.FINALIZED,
      parentRevisionId: parentRevision?.id ?? null,
      reason,
      periodSnapshot: jsonValue({
        payrollId: period.id,
        tenantId: period.tenantId,
        startDate: period.startDate,
        endDate: period.endDate,
        payDate: period.payDate,
        sourceStatus: period.status,
        finalizedStatus: PayrollStatus.FINALIZED,
        statutoryRuleSetId: period.statutoryRuleSetId,
      }),
      deductionSnapshot: jsonValue(period.deductions),
      adjustmentSnapshot: jsonValue(adjustments),
      overtimeSnapshot: jsonValue(overtimeRecords),
      statutoryRuleSetId: period.statutoryRuleSet.id,
      statutoryRuleSnapshot: jsonValue({
        id: period.statutoryRuleSet.id,
        code: period.statutoryRuleSet.code,
        name: period.statutoryRuleSet.name,
        jurisdiction: period.statutoryRuleSet.jurisdiction,
        effectiveFrom: period.statutoryRuleSet.effectiveFrom,
        effectiveTo: period.statutoryRuleSet.effectiveTo,
        contentHash: period.statutoryRuleSet.contentHash,
        sourceSnapshot: period.statutoryRuleSet.sourceSnapshot,
        rules: period.statutoryRuleSet.rules,
      }),
      totalsSnapshot: jsonValue(totals),
      deltaSnapshot: jsonValue({
        grossPay: roundMoney(totals.grossPay - parentTotals.grossPay),
        deduction: roundMoney(totals.deduction - parentTotals.deduction),
        netPay: roundMoney(totals.netPay - parentTotals.netPay),
      }),
      createdById: input.actorId,
      payslips: {
        create: period.payslips.map((slip) => {
          const parent = parentByEmployee.get(slip.employeeId);
          return {
            tenantId: input.tenantId,
            payslipId: slip.id,
            employeeId: slip.employeeId,
            snapshot: jsonValue(slip),
            grossPay: slip.grossPay,
            deduction: slip.deduction,
            netPay: slip.netPay,
            grossPayDelta: roundMoney(Number(slip.grossPay) - Number(parent?.grossPay ?? 0)),
            deductionDelta: roundMoney(Number(slip.deduction) - Number(parent?.deduction ?? 0)),
            netPayDelta: roundMoney(Number(slip.netPay) - Number(parent?.netPay ?? 0)),
          };
        }),
      },
    },
  });
}

/**
 * @requirement PAY-SEC-001 PAY-RUN-001 PAY-RUN-002 PAY-RUN-003
 * @status IMPLEMENTED
 */
export async function finalizePayrollAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollApprovalRoles);
  const id = String(formData.get("id") || "");
  const revision = await prisma.$transaction(async (tx) => {
    const createdRevision = await createImmutablePayrollRevision(tx as unknown as Prisma.TransactionClient, { tenantId: user.tenantId, payrollId: id, actorId: user.id });
    const transitioned = await tx.payrollPeriod.updateMany({
      where: { id, tenantId: user.tenantId, status: PayrollStatus.CALCULATED },
      data: {
        status: PayrollStatus.FINALIZED,
        pendingRevisionType: null,
        pendingRevisionReason: null,
        pendingParentRevisionId: null,
      },
    });
    if (transitioned.count !== 1) throw new Error("Payroll lifecycle changed while finalization was in progress.");
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        module: "PAYROLL",
        action: "FINALIZE_PAYROLL_REVISION",
        entityType: "PayrollCalculationRevision",
        entityId: createdRevision.id,
        metadata: { payrollId: id, revisionNumber: createdRevision.revisionNumber, revisionType: createdRevision.revisionType },
      },
    });
    return createdRevision;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidatePayrollPages();
  redirect(`/admin/payroll?section=approval&period=${id}&success=finalized&revision=${revision.revisionNumber}`);
}

/**
 * @requirement PAY-SEC-001 PAY-RUN-003
 * @status IMPLEMENTED
 * @description Starts a controlled correction from an immutable finalized revision. The original revision remains unchanged while working payslips return to CALCULATED.
 */
export async function returnPayrollToDraftAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollApprovalRoles);
  const id = String(formData.get("id") || "");
  const reason = normalizePayrollCorrectionReason(String(formData.get("reason") || ""));

  const archiveId = await prisma.$transaction(async (tx) => {
    const period = await tx.payrollPeriod.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        payslips: { include: { employee: true } },
        deductions: { include: { employee: true, deductionType: true, employeeLoan: true } },
      },
    });
    if (!period) throw new Error("Payroll period not found.");
    if (period.status !== PayrollStatus.FINALIZED) throw new Error("Only finalized, unpaid payroll can begin a correction. Paid payroll requires reversal evidence.");
    const sourceRevision = await tx.payrollCalculationRevision.findFirst({
      where: { tenantId: user.tenantId, payrollId: period.id },
      orderBy: { revisionNumber: "desc" },
    });
    if (!sourceRevision) throw new Error("Finalized payroll has no immutable source revision.");
    if (sourceRevision.revisionType === PayrollRevisionType.REVERSAL) throw new Error("Reversed payroll evidence cannot begin another correction.");

    const employeeIds = period.payslips.map((item) => item.employeeId);
    const adjustments = await tx.attendanceAdjustment.findMany({
      where: { tenantId: user.tenantId, attendance: { employeeId: { in: employeeIds }, date: { gte: period.startDate, lte: period.endDate } } },
      include: { attendance: true, requestedBy: { select: { id: true, name: true } }, reviewedBy: { select: { id: true, name: true } } },
    });
    const overtimeRecords = await tx.overtimeRecord.findMany({
      where: { tenantId: user.tenantId, employeeId: { in: employeeIds }, date: { gte: period.startDate, lte: period.endDate } },
      include: { employee: true, createdBy: { select: { id: true, name: true } }, reviewedBy: { select: { id: true, name: true } } },
    });

    const archive = await tx.payrollArchive.create({
      data: {
        tenantId: user.tenantId,
        originalPayrollId: period.id,
        status: period.status,
        startDate: period.startDate,
        endDate: period.endDate,
        payDate: period.payDate,
        periodSnapshot: jsonValue(period),
        employeeBreakdown: jsonValue(period.payslips.map((item) => ({ employee: item.employee, payslip: item }))),
        deductions: jsonValue(period.deductions),
        adjustments: jsonValue(adjustments),
        overtimeRecords: jsonValue(overtimeRecords),
        payslipData: jsonValue(period.payslips),
        deletedById: user.id,
        deletionReason: `[PRE_REOPEN_SNAPSHOT] ${reason}`,
      },
    });

    const transitioned = await tx.payrollPeriod.updateMany({
      where: { id, tenantId: user.tenantId, status: PayrollStatus.FINALIZED },
      data: {
        status: PayrollStatus.CALCULATED,
        pendingRevisionType: PayrollRevisionType.CORRECTION,
        pendingRevisionReason: reason,
        pendingParentRevisionId: sourceRevision.id,
      },
    });
    if (transitioned.count !== 1) throw new Error("Payroll lifecycle changed while the correction was being started.");
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        module: "PAYROLL",
        action: "BEGIN_PAYROLL_CORRECTION",
        entityType: "PayrollPeriod",
        entityId: id,
        metadata: { archiveId: archive.id, priorStatus: period.status, reason, sourceRevisionId: sourceRevision.id, sourceRevisionNumber: sourceRevision.revisionNumber },
      },
    });
    return archive.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidatePayrollPages();
  revalidatePath("/admin/payroll/archive");
  redirect(`/admin/payroll?section=approval&period=${id}&success=correction-started&snapshot=${archiveId}`);
}

/**
 * @requirement PAY-SEC-001 PAY-FIN-001 PAY-FIN-002
 * @status IMPLEMENTED
 * @description Post the immutable finalized revision to the Financial Engine through the durable outbox.
 */
export async function postPayrollToFinanceAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollApprovalRoles);
  const id = String(formData.get("id") || "");
  await requestPayrollFinancialPosting({ tenantId: user.tenantId, payrollId: id, actorId: user.id, eventType: PayrollPostingEventType.POST });
  revalidatePayrollPages();
  redirect(`/admin/payroll?section=approval&period=${id}&success=posted`);
}

/**
 * @requirement PAY-SEC-001 PAY-FIN-001 PAY-FIN-002 PAY-LOAN-001
 * @status IMPLEMENTED
 * @description Record net-pay disbursement only after accrual posting; loan repayments and PAID transition occur in the same idempotent processor.
 */
export async function markPayrollPaidAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollApprovalRoles);
  const id = String(formData.get("id") || "");
  await requestPayrollFinancialPosting({ tenantId: user.tenantId, payrollId: id, actorId: user.id, eventType: PayrollPostingEventType.PAYMENT });
  revalidatePayrollPages();
  redirect(`/admin/payroll?section=approval&period=${id}&success=paid`);
}

/**
 * @requirement PAY-SEC-001 PAY-FIN-001 PAY-FIN-002 PAY-FIN-003
 * @status IMPLEMENTED
 * @description Post the immutable reversal revision to the Financial Engine with the source posting as its audit reference.
 */
export async function postPayrollReversalToFinanceAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollApprovalRoles);
  const id = String(formData.get("id") || "");
  await requestPayrollFinancialPosting({ tenantId: user.tenantId, payrollId: id, actorId: user.id, eventType: PayrollPostingEventType.REVERSAL });
  revalidatePayrollPages();
  redirect(`/admin/payroll?section=approval&period=${id}&success=reversal-posted`);
}

/**
 * @requirement PAY-SEC-001 PAY-RUN-003
 * @status IMPLEMENTED
 * @description Records an immutable reversal revision without mutating or deleting the finalized/paid source evidence; the revision can then be posted through the idempotent Financial Engine outbox.
 */
export async function recordPayrollReversalAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollApprovalRoles);
  const id = String(formData.get("id") || "");
  const reason = normalizePayrollCorrectionReason(String(formData.get("reason") || ""));

  const reversal = await prisma.$transaction(async (tx) => {
    const period = await tx.payrollPeriod.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!period) throw new Error("Payroll period not found.");
    const reversibleStatuses: readonly PayrollStatus[] = [PayrollStatus.FINALIZED, PayrollStatus.POSTED, PayrollStatus.PAID];
    if (!reversibleStatuses.includes(period.status)) throw new Error("Only finalized, posted, or paid payroll evidence can be reversed.");

    const sourceRevision = await tx.payrollCalculationRevision.findFirst({
      where: { tenantId: user.tenantId, payrollId: id, revisionType: { not: PayrollRevisionType.REVERSAL } },
      include: { payslips: { orderBy: { employeeId: "asc" } } },
      orderBy: { revisionNumber: "desc" },
    });
    if (!sourceRevision) throw new Error("Payroll has no immutable calculation revision to reverse.");
    const existingReversal = await tx.payrollCalculationRevision.findFirst({
      where: { tenantId: user.tenantId, payrollId: id, reversedRevisionId: sourceRevision.id },
    });
    if (existingReversal) throw new Error(`Payroll revision ${sourceRevision.revisionNumber} already has reversal evidence.`);
    const maximum = await tx.payrollCalculationRevision.aggregate({ where: { tenantId: user.tenantId, payrollId: id }, _max: { revisionNumber: true } });
    const sourceTotals = sourceRevision.payslips.reduce((sum, slip) => ({
      grossPay: roundMoney(sum.grossPay + Number(slip.grossPay)),
      deduction: roundMoney(sum.deduction + Number(slip.deduction)),
      netPay: roundMoney(sum.netPay + Number(slip.netPay)),
    }), { grossPay: 0, deduction: 0, netPay: 0 });

    const created = await tx.payrollCalculationRevision.create({
      data: {
        tenantId: user.tenantId,
        payrollId: id,
        revisionNumber: (maximum._max.revisionNumber ?? 0) + 1,
        revisionType: PayrollRevisionType.REVERSAL,
        lifecycleStatus: period.status,
        parentRevisionId: sourceRevision.id,
        reversedRevisionId: sourceRevision.id,
        reason,
        periodSnapshot: jsonValue({ payrollId: id, tenantId: user.tenantId, lifecycleStatus: period.status, reversalOfRevision: sourceRevision.revisionNumber }),
        deductionSnapshot: jsonValue(sourceRevision.deductionSnapshot),
        adjustmentSnapshot: jsonValue(sourceRevision.adjustmentSnapshot),
        overtimeSnapshot: jsonValue(sourceRevision.overtimeSnapshot),
        statutoryRuleSetId: sourceRevision.statutoryRuleSetId,
        statutoryRuleSnapshot: sourceRevision.statutoryRuleSnapshot == null ? Prisma.JsonNull : jsonValue(sourceRevision.statutoryRuleSnapshot),
        totalsSnapshot: jsonValue({ grossPay: -sourceTotals.grossPay, deduction: -sourceTotals.deduction, netPay: -sourceTotals.netPay }),
        deltaSnapshot: jsonValue({ grossPay: -sourceTotals.grossPay, deduction: -sourceTotals.deduction, netPay: -sourceTotals.netPay }),
        createdById: user.id,
        payslips: {
          create: sourceRevision.payslips.map((slip) => ({
            tenantId: user.tenantId,
            payslipId: slip.payslipId,
            employeeId: slip.employeeId,
            snapshot: jsonValue({ reversalOfRevisionPayslipId: slip.id, sourceSnapshot: slip.snapshot }),
            grossPay: roundMoney(-Number(slip.grossPay)),
            deduction: roundMoney(-Number(slip.deduction)),
            netPay: roundMoney(-Number(slip.netPay)),
            grossPayDelta: roundMoney(-Number(slip.grossPay)),
            deductionDelta: roundMoney(-Number(slip.deduction)),
            netPayDelta: roundMoney(-Number(slip.netPay)),
          })),
        },
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        module: "PAYROLL",
        action: "RECORD_PAYROLL_REVERSAL",
        entityType: "PayrollCalculationRevision",
        entityId: created.id,
        reason,
        metadata: { payrollId: id, sourceRevisionId: sourceRevision.id, sourceRevisionNumber: sourceRevision.revisionNumber, reversalRevisionNumber: created.revisionNumber },
      },
    });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidatePayrollPages();
  redirect(`/admin/payroll?section=approval&period=${id}&success=reversal-recorded&revision=${reversal.revisionNumber}`);
}

/**
 * @requirement PAY-SEC-001 PAY-RUN-003
 * @status IMPLEMENTED
 * @description Destructive payroll deletion is restricted to DRAFT periods. Finalized and paid periods require a correction/reversal path and cannot be erased.
 */
export async function deletePayrollAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollManageRoles);
  const id = String(formData.get("id") || "");
  const confirmation = String(formData.get("confirmation") || "").trim().toUpperCase();
  const acknowledged = formData.get("acknowledged") === "on";
  const deletionReason = String(formData.get("deletionReason") || "").trim();
  if (confirmation !== "DELETE" || !acknowledged) throw new Error("Acknowledge the archive notice and type DELETE to remove this payroll period from the active list.");
  const period = await prisma.payrollPeriod.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      payslips: { include: { employee: true } },
      deductions: { include: { employee: true, deductionType: true, employeeLoan: true } },
    },
  });
  if (!period) throw new Error("Payroll period not found.");
  if (period.status !== PayrollStatus.DRAFT) throw new Error("Finalized and paid payroll periods cannot be deleted. Use the controlled correction/reversal workflow so historical payroll evidence is preserved.");
  const employeeIds = period.payslips.map((item) => item.employeeId);
  const [adjustments, overtimeRecords] = await Promise.all([
    prisma.attendanceAdjustment.findMany({
      where: { tenantId: user.tenantId, attendance: { employeeId: { in: employeeIds }, date: { gte: period.startDate, lte: period.endDate } } },
      include: { attendance: true, requestedBy: { select: { id: true, name: true } }, reviewedBy: { select: { id: true, name: true } } },
    }),
    prisma.overtimeRecord.findMany({
      where: { tenantId: user.tenantId, employeeId: { in: employeeIds }, date: { gte: period.startDate, lte: period.endDate } },
      include: { employee: true, createdBy: { select: { id: true, name: true } }, reviewedBy: { select: { id: true, name: true } } },
    }),
  ]);
  const snapshot = jsonValue(period);
  const archive = await prisma.$transaction(async (tx) => {
    const archived = await tx.payrollArchive.create({
      data: {
        tenantId: user.tenantId,
        originalPayrollId: period.id,
        status: period.status,
        startDate: period.startDate,
        endDate: period.endDate,
        payDate: period.payDate,
        periodSnapshot: snapshot,
        employeeBreakdown: jsonValue(period.payslips.map((item) => ({ employee: item.employee, payslip: item }))),
        deductions: jsonValue(period.deductions),
        adjustments: jsonValue(adjustments),
        overtimeRecords: jsonValue(overtimeRecords),
        payslipData: jsonValue(period.payslips),
        deletedById: user.id,
        deletionReason: deletionReason || null,
      },
    });
    await tx.auditLog.create({
      data: { tenantId: user.tenantId, actorId: user.id, module: "PAYROLL", action: "ARCHIVE_AND_DELETE_DRAFT_PAYROLL_PERIOD", entityType: "PayrollArchive", entityId: archived.id, metadata: { originalPayrollId: id, status: period.status, deletionReason: deletionReason || null } },
    });
    await tx.payrollDeduction.deleteMany({ where: { tenantId: user.tenantId, payrollId: id } });
    await tx.payslip.deleteMany({ where: { tenantId: user.tenantId, payrollId: id } });
    await tx.payrollPeriod.delete({ where: { id } });
    return archived;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidatePayrollPages();
  revalidatePath("/admin/payroll/archive");
  redirect(`/admin/payroll/archive?success=archived&archive=${archive.id}`);
}

/**
 * @requirement PAY-SEC-001 PAY-OT-001
 * @status IMPLEMENTED
 */
export async function saveOvertimeRecordAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollWriteRoles);
  const parsed = overtimeRecordSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid overtime record.");
  const date = new Date(`${parsed.data.date}T00:00:00.000Z`);
  const source = parsed.data.source as OvertimeSource;
  const managerAdjustment = source === OvertimeSource.PAYROLL_MANAGER_ADJUSTMENT;
  if (managerAdjustment) await requirePayrollAccess(payrollManageRoles);
  const status = managerAdjustment ? OvertimeStatus.APPROVED : parsed.data.status as OvertimeStatus;
  const employee = await prisma.employeeProfile.findFirst({ where: { id: parsed.data.employeeId, tenantId: user.tenantId } });
  if (!employee) throw new Error("Employee not found.");
  const attendance = await prisma.attendance.findFirst({ where: { tenantId: user.tenantId, employeeId: parsed.data.employeeId, date } });
  const record = await prisma.overtimeRecord.create({
    data: {
      tenantId: user.tenantId,
      employeeId: parsed.data.employeeId,
      attendanceId: attendance?.id ?? null,
      date,
      hours: parsed.data.hours,
      reason: parsed.data.reason,
      source,
      status,
      createdById: user.id,
      reviewedById: managerAdjustment ? user.id : null,
      reviewedAt: managerAdjustment ? new Date() : null,
    },
  });
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: managerAdjustment ? "MANUAL_OT_ADJUSTMENT" : "CREATE_OT_REQUEST", entityType: "OvertimeRecord", entityId: record.id, metadata: { employeeId: record.employeeId, date, hours: parsed.data.hours, source, status } });
  revalidatePayrollPages();
  redirect("/admin/payroll?section=overtime&success=saved");
}

/**
 * @requirement PAY-SEC-001 PAY-OT-001
 * @status IMPLEMENTED
 */
export async function reviewOvertimeRecordAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollManageRoles);
  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  if (decision !== OvertimeStatus.APPROVED && decision !== OvertimeStatus.REJECTED) throw new Error("Choose approve or reject.");
  const existing = await prisma.overtimeRecord.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) throw new Error("Overtime record not found.");
  if (existing.status !== OvertimeStatus.PENDING) throw new Error("Only pending overtime requests can be reviewed.");
  await prisma.overtimeRecord.update({ where: { id }, data: { status: decision as OvertimeStatus, reviewedById: user.id, reviewedAt: new Date() } });
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: `${decision}_OVERTIME_REQUEST`, entityType: "OvertimeRecord", entityId: id });
  revalidatePayrollPages();
  redirect("/admin/payroll?section=overtime&success=reviewed");
}

/**
 * @requirement PAY-SEC-001 PAY-LOAN-001
 * @status IMPLEMENTED
 */
export async function saveEmployeeLoanAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollWriteRoles);
  const parsed = employeeLoanSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid employee loan or cash advance.");
  const { id, employeeId, type, description, principalAmount, issuedDate, referenceNumber, remarks } = parsed.data;
  const issued = new Date(`${issuedDate}T00:00:00.000Z`);

  await prisma.$transaction(async (tx) => {
    const employee = await tx.employeeProfile.findFirst({ where: { id: employeeId, tenantId: user.tenantId } });
    if (!employee) throw new Error("Employee not found.");

    if (!id) {
      await tx.employeeLoan.create({
        data: {
          tenantId: user.tenantId,
          employeeId,
          type,
          description,
          principalAmount,
          amountPaid: 0,
          balance: principalAmount,
          issuedDate: issued,
          referenceNumber,
          remarks,
        },
      });
      return;
    }

    const existing = await tx.employeeLoan.findFirst({ where: { id, tenantId: user.tenantId }, include: { _count: { select: { payrollDeductions: true } } } });
    if (!existing) throw new Error("Employee loan or cash advance not found.");
    if (existing._count.payrollDeductions > 0 && employeeId !== existing.employeeId) throw new Error("This loan already has payroll deductions, so the employee cannot be changed.");
    if (existing.status === EmployeeLoanStatus.CANCELLED) throw new Error("Cancelled loans cannot be edited.");
    const amountPaid = Number(existing.amountPaid);
    if (principalAmount + 0.005 < amountPaid) throw new Error("Principal amount cannot be lower than the amount already paid.");
    const nextBalance = roundMoney(principalAmount - amountPaid);
    const fullyPaid = nextBalance <= 0;

    await tx.employeeLoan.update({
      where: { id },
      data: {
        employeeId,
        type,
        description,
        principalAmount,
        balance: fullyPaid ? 0 : nextBalance,
        issuedDate: issued,
        referenceNumber,
        remarks,
        status: fullyPaid ? EmployeeLoanStatus.PAID : EmployeeLoanStatus.OPEN,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: id ? "UPDATE_EMPLOYEE_LOAN" : "CREATE_EMPLOYEE_LOAN", entityType: "EmployeeLoan", entityId: id ?? null, metadata: { employeeId, type, principalAmount } });

  revalidatePayrollPages();
  redirect(`/admin/payroll?section=loans&success=saved&message=${encodeURIComponent("Employee loan or cash advance has been saved successfully.")}`);
}

/**
 * @requirement PAY-SEC-001 PAY-LOAN-001
 * @status IMPLEMENTED
 */
export async function cancelEmployeeLoanAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollManageRoles);
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Employee loan or cash advance not found.");

  await prisma.$transaction(async (tx) => {
    const loan = await tx.employeeLoan.findFirst({ where: { id, tenantId: user.tenantId }, include: { _count: { select: { payrollDeductions: true } } } });
    if (!loan) throw new Error("Employee loan or cash advance not found.");
    if (Number(loan.amountPaid) > 0 || loan._count.payrollDeductions > 0) throw new Error("Loans with repayments or payroll deductions cannot be cancelled. Keep them for audit trail.");
    await tx.employeeLoan.update({ where: { id }, data: { status: EmployeeLoanStatus.CANCELLED, balance: 0 } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: "CANCEL_EMPLOYEE_LOAN", entityType: "EmployeeLoan", entityId: id });

  revalidatePayrollPages();
  redirect(`/admin/payroll?section=loans&success=cancelled&message=${encodeURIComponent("Employee loan or cash advance has been cancelled.")}`);
}

/**
 * @requirement PAY-SEC-001 PAY-DED-001
 * @status IMPLEMENTED
 */
export async function savePayrollDeductionTypeAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollManageRoles);
  const parsed = payrollDeductionTypeSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    active: formData.get("active") === "on",
    applyToMonthly: formData.get("applyToMonthly") === "on",
    applyToDaily: formData.get("applyToDaily") === "on",
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid payroll deduction type.");
  const { id, ...data } = parsed.data;
  let record;
  if (id) {
    const existing = await prisma.payrollDeductionType.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) throw new Error("Payroll deduction type not found.");
    record = await prisma.payrollDeductionType.update({ where: { id }, data });
  } else {
    record = await prisma.payrollDeductionType.create({ data: { ...data, tenantId: user.tenantId } });
  }
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: id ? "UPDATE_DEDUCTION_TYPE" : "CREATE_DEDUCTION_TYPE", entityType: "PayrollDeductionType", entityId: record.id, metadata: { name: data.name, active: data.active } });
  revalidatePayrollPages();
  redirect(`/admin/payroll?section=settings&success=saved&message=${encodeURIComponent("Payroll deduction type saved successfully. Assign it to specific employees and payroll periods when needed.")}`);
}

/**
 * @requirement PAY-SEC-001 PAY-DED-001 PAY-LOAN-001
 * @status IMPLEMENTED
 */
export async function savePayrollDeductionAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollWriteRoles);
  const parsed = payrollDeductionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid payroll deduction.");
  const { payrollId, employeeId, deductionTypeId, employeeLoanId, amount, remarks } = parsed.data;

  await prisma.$transaction(async (tx) => {
    const [period, employee, deductionType] = await Promise.all([
      tx.payrollPeriod.findFirst({ where: { id: payrollId, tenantId: user.tenantId } }),
      tx.employeeProfile.findFirst({ where: { id: employeeId, tenantId: user.tenantId } }),
      tx.payrollDeductionType.findFirst({ where: { id: deductionTypeId, tenantId: user.tenantId } }),
    ]);
    if (!period) throw new Error("Payroll period not found.");
    if (!MUTABLE_PAYROLL_STATUSES.includes(period.status)) throw new Error("Finalized, posting, posted, and paid payroll periods cannot be changed directly.");
    if (!employee) throw new Error("Employee not found.");
    if (!deductionType) throw new Error("Deduction type not found.");
    if (!deductionType.active) throw new Error("Activate this deduction type before assigning it to an employee.");
    const appliesToEmployee = employee.salaryType === "MONTHLY" ? deductionType.applyToMonthly : deductionType.applyToDaily;
    if (!appliesToEmployee) throw new Error("This deduction type is not applicable to the selected employee salary type.");

    const existingDeduction = await tx.payrollDeduction.findFirst({
      where: { tenantId: user.tenantId, payrollId, employeeId, deductionTypeId },
    });

    if (employeeLoanId) {
      const loan = await tx.employeeLoan.findFirst({ where: { id: employeeLoanId, tenantId: user.tenantId } });
      if (!loan) throw new Error("Employee loan or cash advance not found.");
      if (loan.employeeId !== employeeId) throw new Error("The selected loan belongs to a different employee.");
      if (loan.status !== EmployeeLoanStatus.OPEN) throw new Error("Only open loans or cash advances can receive payroll repayments.");

      const reservedRepayments = await tx.payrollDeduction.findMany({
        where: {
          tenantId: user.tenantId,
          employeeLoanId,
          payroll: { status: { not: PayrollStatus.PAID } },
          ...(existingDeduction ? { NOT: { id: existingDeduction.id } } : {}),
        },
        select: { amount: true },
      });
      const reservedAmount = reservedRepayments.reduce((sum, item) => sum + Number(item.amount), 0);
      const availableBalance = roundMoney(Number(loan.balance) - reservedAmount);
      if (amount > availableBalance + 0.005) throw new Error(`Repayment cannot exceed the available loan balance of ${formatPeso(availableBalance)}.`);
    }

    await tx.payrollDeduction.upsert({
      where: { payrollId_employeeId_deductionTypeId: { payrollId, employeeId, deductionTypeId } },
      create: { tenantId: user.tenantId, payrollId, employeeId, deductionTypeId, employeeLoanId, amount, remarks },
      update: { employeeLoanId, amount, remarks },
    });
    const statutoryRuleSet = await statutoryRuleSetForPeriod(tx as unknown as Prisma.TransactionClient, period.statutoryRuleSetId);
    await refreshPeriodPayslips(tx as unknown as Prisma.TransactionClient, period, statutoryRuleSet);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: "SAVE_PAYROLL_DEDUCTION", entityType: "PayrollPeriod", entityId: payrollId, metadata: { employeeId, deductionTypeId, employeeLoanId, amount } });

  revalidatePayrollPages();
  redirect(`/admin/payroll?section=adjustments&period=${payrollId}&employee=${employeeId}&success=saved&message=${encodeURIComponent(employeeLoanId ? "Loan repayment deduction has been saved for this employee and cutoff period." : "Employee deduction has been saved for this cutoff period.")}`);
}

/**
 * @requirement PAY-SEC-001 PAY-DED-001
 * @status IMPLEMENTED
 */
export async function deletePayrollDeductionAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollWriteRoles);
  const id = String(formData.get("id") || "");
  const payrollId = String(formData.get("payrollId") || "");
  let employeeId = String(formData.get("employeeId") || "");
  if (!id || !payrollId) throw new Error("Payroll deduction not found.");

  await prisma.$transaction(async (tx) => {
    const period = await tx.payrollPeriod.findFirst({ where: { id: payrollId, tenantId: user.tenantId } });
    if (!period) throw new Error("Payroll period not found.");
    if (!MUTABLE_PAYROLL_STATUSES.includes(period.status)) throw new Error("Finalized, posting, posted, and paid payroll periods cannot be changed directly.");
    const deduction = await tx.payrollDeduction.findFirst({ where: { id, tenantId: user.tenantId }, select: { employeeId: true, payrollId: true } });
    if (!deduction || deduction.payrollId !== payrollId) throw new Error("Payroll deduction not found for this cutoff period.");
    employeeId = employeeId || deduction.employeeId;
    await tx.payrollDeduction.delete({ where: { id } });
    const statutoryRuleSet = await statutoryRuleSetForPeriod(tx as unknown as Prisma.TransactionClient, period.statutoryRuleSetId);
    await refreshPeriodPayslips(tx as unknown as Prisma.TransactionClient, period, statutoryRuleSet);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: "DELETE_PAYROLL_DEDUCTION", entityType: "PayrollDeduction", entityId: id, metadata: { payrollId } });

  revalidatePayrollPages();
  redirect(`/admin/payroll?section=adjustments&period=${payrollId}${employeeId ? `&employee=${employeeId}` : ""}&success=deleted&message=${encodeURIComponent("Employee deduction has been removed from this cutoff period.")}`);
}

/**
 * @requirement PAY-SEC-001 PAY-SEC-002
 * @status IMPLEMENTED
 */
export async function savePayrollAccessAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollManageRoles);
  const parsed = payrollAccessSchema.safeParse({ ...Object.fromEntries(formData.entries()), active: formData.get("active") === "on" });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid payroll access assignment.");
  const { userId, role, active } = parsed.data;
  const targetUser = await prisma.user.findFirst({ where: { id: userId, tenantId: user.tenantId } });
  if (!targetUser) throw new Error("Payroll access user not found in the authenticated tenant.");
  await prisma.payrollAccess.upsert({
    where: { userId_role: { userId, role } },
    create: { tenantId: user.tenantId, userId, role, active, grantedById: user.id },
    update: { tenantId: user.tenantId, active, grantedById: user.id },
  });
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: "SAVE_PAYROLL_ACCESS", entityType: "User", entityId: userId, metadata: { role, active } });
  revalidatePayrollPages();
  redirect(`/admin/payroll?section=settings&success=saved&message=${encodeURIComponent("Payroll access has been updated.")}`);
}

/**
 * @requirement PAY-SEC-001 PAY-SEC-002
 * @status IMPLEMENTED
 */
export async function deletePayrollAccessAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollManageRoles);
  const id = String(formData.get("id") || "");
  const access = await prisma.payrollAccess.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!access) throw new Error("Payroll access record not found.");
  if (access.userId === user.id && access.role === PayrollAccessRole.SYSTEM_ADMINISTRATOR) throw new Error("You cannot remove your own system payroll access.");
  await prisma.payrollAccess.delete({ where: { id } });
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: "DELETE_PAYROLL_ACCESS", entityType: "User", entityId: access.userId, metadata: { role: access.role } });
  revalidatePayrollPages();
  redirect(`/admin/payroll?section=settings&success=deleted&message=${encodeURIComponent("Payroll access has been removed.")}`);
}

/**
 * @requirement PAY-SEC-001 PAY-SHIFT-001
 * @status IMPLEMENTED
 */
export async function savePayrollCalendarDayAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollManageRoles);
  const parsed = payrollCalendarSchema.safeParse({ ...Object.fromEntries(formData.entries()), active: formData.get("active") === "on" });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid payroll calendar day.");
  const { id, date, ...data } = parsed.data;
  const targetDate = new Date(`${date}T00:00:00.000Z`);
  let record;
  if (id) {
    const existing = await prisma.payrollCalendarDay.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) throw new Error("Payroll calendar day not found.");
    record = await prisma.payrollCalendarDay.update({ where: { id }, data: { ...data, date: targetDate, createdById: user.id } });
  } else {
    record = await prisma.payrollCalendarDay.upsert({
      where: { tenantId_date: { tenantId: user.tenantId, date: targetDate } },
      create: { ...data, tenantId: user.tenantId, date: targetDate, createdById: user.id },
      update: { ...data, createdById: user.id },
    });
  }
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: id ? "UPDATE_CALENDAR_DAY" : "SAVE_CALENDAR_DAY", entityType: "PayrollCalendarDay", entityId: record.id, metadata: { date, type: data.type } });
  revalidatePayrollPages();
  revalidatePath("/admin/attendance");
  redirect(`/admin/payroll?section=calendar&success=saved&message=${encodeURIComponent("Payroll calendar day has been saved.")}`);
}

/**
 * @requirement PAY-SEC-001 PAY-SHIFT-001
 * @status IMPLEMENTED
 */
export async function deletePayrollCalendarDayAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollManageRoles);
  const id = String(formData.get("id") || "");
  const record = await prisma.payrollCalendarDay.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!record) throw new Error("Payroll calendar day not found.");
  await prisma.payrollCalendarDay.delete({ where: { id } });
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: "DELETE_CALENDAR_DAY", entityType: "PayrollCalendarDay", entityId: id, metadata: { date: record.date, type: record.type } });
  revalidatePayrollPages();
  revalidatePath("/admin/attendance");
  redirect(`/admin/payroll?section=calendar&success=deleted&message=${encodeURIComponent("Payroll calendar day has been deleted.")}`);
}

/**
 * @requirement PAY-SEC-001 PAY-SHIFT-001
 * @status IMPLEMENTED
 */
export async function saveEmployeeScheduleAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollManageRoles);
  const parsed = employeeScheduleRangeSchema.safeParse({ ...Object.fromEntries(formData.entries()), restDays: formData.getAll("restDays").map(String) });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid employee schedule.");
  const { effectiveFrom, effectiveTo, restDays = [], ...data } = parsed.data;
  const employee = await prisma.employeeProfile.findFirst({ where: { id: data.employeeId, tenantId: user.tenantId } });
  if (!employee) throw new Error("Employee not found.");
  const start = new Date(`${effectiveFrom}T00:00:00.000Z`);
  const end = effectiveTo ? new Date(`${effectiveTo}T00:00:00.000Z`) : null;
  const searchEnd = end ?? new Date("9999-12-31T00:00:00.000Z");
  const days = [0, 1, 2, 3, 4, 5, 6];
  const conflicts = await prisma.employeeSchedule.findMany({
    where: {
      tenantId: user.tenantId,
      employeeId: data.employeeId,
      dayOfWeek: { in: days },
      effectiveFrom: { lte: searchEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
    },
    include: { employee: true },
    take: 1,
  });
  if (conflicts.length) {
    throw new Error(`Schedule overlaps an existing assignment for ${conflicts[0].employee.name}. Delete or end the old schedule before creating a new one.`);
  }
  const restDaySet = new Set(restDays.map(Number));
  const records = await prisma.$transaction(days.map((dayOfWeek) => prisma.employeeSchedule.create({
    data: {
      ...data,
      tenantId: user.tenantId,
      dayOfWeek,
      restDay: restDaySet.has(dayOfWeek),
      effectiveFrom: start,
      effectiveTo: end,
      createdById: user.id,
    },
  })));
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: "CREATE_EMPLOYEE_SCHEDULE_RANGE", entityType: "EmployeeSchedule", entityId: records[0]?.id, metadata: { employeeId: data.employeeId, effectiveFrom, effectiveTo, restDays } });
  revalidatePayrollPages();
  revalidatePath("/admin/attendance");
  redirect(`/admin/payroll?section=calendar&success=saved&message=${encodeURIComponent("Employee schedule range has been saved.")}`);
}

/**
 * @requirement PAY-SEC-001 PAY-SHIFT-001
 * @status IMPLEMENTED
 */
export async function deleteEmployeeScheduleAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollManageRoles);
  const id = String(formData.get("id") || "");
  const record = await prisma.employeeSchedule.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!record) throw new Error("Employee schedule not found.");
  await prisma.employeeSchedule.delete({ where: { id } });
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: "DELETE_EMPLOYEE_SCHEDULE", entityType: "EmployeeSchedule", entityId: id, metadata: { employeeId: record.employeeId, dayOfWeek: record.dayOfWeek } });
  revalidatePayrollPages();
  revalidatePath("/admin/attendance");
  redirect(`/admin/payroll?section=calendar&success=deleted&message=${encodeURIComponent("Employee schedule has been deleted.")}`);
}

/**
 * @requirement PAY-REQ-001
 * @status IMPLEMENTED
 */
function revalidatePayrollPages() {
  revalidatePath("/admin/payroll");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/dashboard");
  revalidatePath("/employee/attendance");
}

function resolveMonthlyBasicSalary(input: {
  compensationBasis: "MONTHLY" | "DAILY" | "HOURLY" | "FIXED_PER_PERIOD";
  payFrequency: "SEMI_MONTHLY" | "MONTHLY";
  rate: number | string | { toString(): string };
  standardWorkDays: number;
  standardHoursPerDay: number | string | { toString(): string };
}) {
  const rate = Number(input.rate);
  const standardHoursPerDay = Number(input.standardHoursPerDay);
  if (input.compensationBasis === "MONTHLY") return roundMoney(rate);
  if (input.compensationBasis === "FIXED_PER_PERIOD") return roundMoney(rate * (input.payFrequency === "SEMI_MONTHLY" ? 2 : 1));
  if (input.compensationBasis === "DAILY") return roundMoney(rate * input.standardWorkDays);
  return roundMoney(rate * standardHoursPerDay * input.standardWorkDays);
}

async function statutoryRuleSetForPeriod(tx: Prisma.TransactionClient, statutoryRuleSetId: string | null) {
  if (!statutoryRuleSetId) throw new Error("Recalculate this payroll with a verified statutory rule set before changing deductions.");
  const statutoryRuleSet = await tx.payrollStatutoryRuleSet.findUnique({ where: { id: statutoryRuleSetId } });
  if (!statutoryRuleSet || !statutoryRuleSet.active) throw new Error("The payroll statutory rule set is unavailable or inactive.");
  parsePhilippineStatutoryRules(statutoryRuleSet.rules);
  return statutoryRuleSet;
}

/**
 * @requirement PAY-CALC-003 PAY-LOAN-001
 * @status IMPLEMENTED
 */
function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * @requirement PAY-LOAN-001
 * @status IMPLEMENTED
 */
function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

/**
 * @requirement PAY-RUN-003
 * @status IMPLEMENTED
 */
function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
