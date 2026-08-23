"use server";

import { EmployeeLoanStatus, OvertimeSource, OvertimeStatus, PayrollAccessRole, PayrollStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { payrollApprovalRoles, payrollManageRoles, payrollWriteRoles, requirePayrollAccess } from "@/lib/payroll-access";
import { calculatePayslip } from "@/lib/services/payroll";
import { employeeLoanSchema, employeeScheduleRangeSchema, overtimeRecordSchema, payrollAccessSchema, payrollCalendarSchema, payrollDeductionSchema, payrollDeductionTypeSchema, payrollPeriodSchema } from "@/lib/validation";

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
  if (period.status === PayrollStatus.PAID) throw new Error("Paid payroll periods are locked and cannot be recalculated.");
  if (period.status === PayrollStatus.FINALIZED) throw new Error("Return this payroll period to draft before recalculating.");
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
    const existing = await tx.payrollPeriod.findUnique({ where: { tenantId_startDate_endDate: { tenantId: actor.tenantId, startDate: input.startDate, endDate: input.endDate } } });
    if (existing?.status === PayrollStatus.PAID) throw new Error("Paid payroll periods are locked and cannot be recalculated.");
    if (existing?.status === PayrollStatus.FINALIZED) throw new Error("Return this payroll period to draft before recalculating.");
    const period = existing
      ? await tx.payrollPeriod.update({ where: { id: existing.id }, data: { payDate: input.payDate } })
      : await tx.payrollPeriod.create({ data: { ...input, tenantId: actor.tenantId } });
    await refreshPeriodPayslips(tx as unknown as Prisma.TransactionClient, period);
    return period.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/**
 * @requirement PAY-SEC-001 PAY-CALC-001 PAY-ATT-001 PAY-OT-001
 * @status IMPLEMENTED
 */
async function refreshPeriodPayslips(tx: Prisma.TransactionClient, period: { id: string; tenantId: string; startDate: Date; endDate: Date }) {
  const employees = await tx.employeeProfile.findMany({
    where: { tenantId: period.tenantId, status: "ACTIVE", hireDate: { lte: period.endDate } },
    include: { attendance: { where: { tenantId: period.tenantId, date: { gte: period.startDate, lte: period.endDate } } } },
  });
  const assignedDeductions = await tx.payrollDeduction.findMany({
    where: { tenantId: period.tenantId, payrollId: period.id },
    select: { employeeId: true, amount: true },
  });
  const approvedOvertime = await tx.overtimeRecord.findMany({
    where: { tenantId: period.tenantId, status: OvertimeStatus.APPROVED, date: { gte: period.startDate, lte: period.endDate } },
    select: { employeeId: true, hours: true, source: true },
  });
  const deductionsByEmployee = new Map<string, { amount: Prisma.Decimal }[]>();
  for (const deduction of assignedDeductions) {
    const employeeDeductions = deductionsByEmployee.get(deduction.employeeId) ?? [];
    employeeDeductions.push({ amount: deduction.amount });
    deductionsByEmployee.set(deduction.employeeId, employeeDeductions);
  }
  const overtimeByEmployee = new Map<string, { hours: Prisma.Decimal; source: OvertimeSource }[]>();
  for (const overtime of approvedOvertime) {
    const employeeOvertime = overtimeByEmployee.get(overtime.employeeId) ?? [];
    employeeOvertime.push({ hours: overtime.hours, source: overtime.source });
    overtimeByEmployee.set(overtime.employeeId, employeeOvertime);
  }
  const activeIds = employees.map((employee) => employee.id);
  await tx.payslip.deleteMany({ where: { tenantId: period.tenantId, payrollId: period.id, ...(activeIds.length ? { employeeId: { notIn: activeIds } } : {}) } });
  for (const employee of employees) {
    const values = calculatePayslip(employee, employee.attendance, deductionsByEmployee.get(employee.id) ?? [], overtimeByEmployee.get(employee.id) ?? []);
    await tx.payslip.upsert({
      where: { payrollId_employeeId: { payrollId: period.id, employeeId: employee.id } },
      create: { tenantId: period.tenantId, payrollId: period.id, employeeId: employee.id, ...values },
      update: values,
    });
  }
}

/**
 * @requirement PAY-SEC-001 PAY-RUN-002
 * @status IMPLEMENTED
 */
export async function finalizePayrollAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollApprovalRoles);
  const id = String(formData.get("id") || "");
  const period = await prisma.payrollPeriod.findFirst({ where: { id, tenantId: user.tenantId }, include: { _count: { select: { payslips: true } } } });
  if (!period || !period._count.payslips) throw new Error("Calculate at least one employee payslip before finalizing.");
  if (period.status !== PayrollStatus.DRAFT) throw new Error("Payroll is already finalized.");
  await prisma.payrollPeriod.update({ where: { id }, data: { status: PayrollStatus.FINALIZED } });
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: "FINALIZE_PAYROLL", entityType: "PayrollPeriod", entityId: id });
  revalidatePayrollPages();
  redirect(`/admin/payroll?section=approval&period=${id}&success=finalized`);
}

/**
 * @requirement PAY-SEC-001 PAY-RUN-003
 * @status IMPLEMENTED
 * @description Existing controlled reopen path; full immutable revision model remains IN_PROGRESS under PAY-RUN-003.
 */
export async function returnPayrollToDraftAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollApprovalRoles);
  const id = String(formData.get("id") || "");
  const period = await prisma.payrollPeriod.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!period) throw new Error("Payroll period not found.");
  if (period.status === PayrollStatus.PAID) throw new Error("Paid payroll periods are locked and cannot be returned to draft.");
  if (period.status === PayrollStatus.DRAFT) throw new Error("Payroll period is already in draft.");
  await prisma.payrollPeriod.update({ where: { id }, data: { status: PayrollStatus.DRAFT } });
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: "RETURN_PAYROLL_TO_DRAFT", entityType: "PayrollPeriod", entityId: id });
  revalidatePayrollPages();
  redirect(`/admin/payroll?section=approval&period=${id}&success=reopened`);
}

/**
 * @requirement PAY-SEC-001 PAY-LOAN-001
 * @status IMPLEMENTED
 */
export async function markPayrollPaidAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollApprovalRoles);
  const id = String(formData.get("id") || "");
  await prisma.$transaction(async (tx) => {
    const period = await tx.payrollPeriod.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { deductions: { where: { tenantId: user.tenantId, employeeLoanId: { not: null } }, include: { employeeLoan: true } } },
    });
    if (!period || period.status !== PayrollStatus.FINALIZED) throw new Error("Only finalized payroll can be marked paid.");

    for (const deduction of period.deductions) {
      if (!deduction.employeeLoan) continue;
      if (deduction.employeeLoan.tenantId !== user.tenantId) throw new Error("Employee loan is outside the authenticated tenant.");
      const amount = Number(deduction.amount);
      const currentBalance = Number(deduction.employeeLoan.balance);
      if (deduction.employeeLoan.status !== EmployeeLoanStatus.OPEN) throw new Error(`Loan ${deduction.employeeLoan.description} is not open for repayment.`);
      if (amount > currentBalance + 0.005) throw new Error(`Deduction for ${deduction.employeeLoan.description} is greater than the remaining loan balance.`);
      const nextPaid = roundMoney(Number(deduction.employeeLoan.amountPaid) + amount);
      const nextBalance = roundMoney(Math.max(0, currentBalance - amount));
      const fullyPaid = nextBalance <= 0;
      await tx.employeeLoan.update({
        where: { id: deduction.employeeLoan.id },
        data: {
          amountPaid: nextPaid,
          balance: fullyPaid ? 0 : nextBalance,
          status: fullyPaid ? EmployeeLoanStatus.PAID : EmployeeLoanStatus.OPEN,
        },
      });
    }

    await tx.payrollPeriod.update({ where: { id }, data: { status: PayrollStatus.PAID } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: "MARK_PAYROLL_PAID", entityType: "PayrollPeriod", entityId: id });
  revalidatePayrollPages();
  redirect(`/admin/payroll?section=approval&period=${id}&success=paid`);
}

/**
 * @requirement PAY-SEC-001 PAY-RUN-003
 * @status IN_PROGRESS
 * @description Tenant-safe archive/delete behavior exists; immutable finalized correction/reversal replacement remains pending.
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
      data: { tenantId: user.tenantId, actorId: user.id, module: "PAYROLL", action: "ARCHIVE_AND_DELETE_PAYROLL_PERIOD", entityType: "PayrollArchive", entityId: archived.id, metadata: { originalPayrollId: id, status: period.status, deletionReason: deletionReason || null } },
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
    if (period.status === PayrollStatus.PAID) throw new Error("Paid payroll periods are locked and cannot be changed.");
    if (period.status === PayrollStatus.FINALIZED) throw new Error("Return this payroll period to draft before changing employee deductions.");
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
          payroll: { status: { in: [PayrollStatus.DRAFT, PayrollStatus.FINALIZED] } },
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
    await refreshPeriodPayslips(tx as unknown as Prisma.TransactionClient, period);
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
    if (period.status === PayrollStatus.PAID) throw new Error("Paid payroll periods are locked and cannot be changed.");
    if (period.status === PayrollStatus.FINALIZED) throw new Error("Return this payroll period to draft before changing employee deductions.");
    const deduction = await tx.payrollDeduction.findFirst({ where: { id, tenantId: user.tenantId }, select: { employeeId: true, payrollId: true } });
    if (!deduction || deduction.payrollId !== payrollId) throw new Error("Payroll deduction not found for this cutoff period.");
    employeeId = employeeId || deduction.employeeId;
    await tx.payrollDeduction.delete({ where: { id } });
    await refreshPeriodPayslips(tx as unknown as Prisma.TransactionClient, period);
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
