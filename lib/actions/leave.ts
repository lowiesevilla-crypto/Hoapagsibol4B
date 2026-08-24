"use server";

import {
  AttendanceStatus,
  LeaveBalanceTransactionType,
  LeaveDayCountingMethod,
  LeavePayrollTreatment,
  LeaveRequestStatus,
  PayrollStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { leaveApprovalRoles, leaveConfigurationRoles, requirePayrollAccess } from "@/lib/payroll-access";
import {
  assertLeaveEligibility,
  availableLeaveDays,
  calculateLeaveDates,
  leaveRequestDateEvidence,
  leaveTypeEvidence,
  resolvedLeaveTypeEvidence,
} from "@/lib/services/leave";

const leaveTypeSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9_-]+$/, "Code can use letters, numbers, underscores and hyphens only."),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional(),
  payrollTreatment: z.nativeEnum(LeavePayrollTreatment),
  annualEntitlementDays: optionalNumber(0, 366),
  eligibilityServiceMonths: z.coerce.number().int().min(0).max(600),
  maximumDaysPerRequest: optionalNumber(0.01, 366),
  dayCountingMethod: z.nativeEnum(LeaveDayCountingMethod),
});

const employeeLeaveRequestSchema = z.object({
  leaveTypeId: z.string().min(1),
  startDate: z.string().date(),
  endDate: z.string().date(),
  reason: z.string().trim().min(3).max(500),
  evidenceReference: z.string().trim().max(500).optional(),
});

const leaveBalanceAdjustmentSchema = z.object({
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2200),
  days: z.coerce.number().finite().min(-366).max(366).refine((value) => Math.abs(value) >= 0.01, "Adjustment cannot be zero."),
  reason: z.string().trim().min(10).max(500),
});

/**
 * @requirement PAY-EMP-005 PAY-SEC-001
 * @status IMPLEMENTED
 * @description Create or update a tenant-defined leave type while refusing all mutation of protected statutory formulas.
 */
export async function saveLeaveTypeAction(formData: FormData) {
  const { user } = await requirePayrollAccess(leaveConfigurationRoles);
  const parsed = leaveTypeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid leave type.");
  const requiresBalance = formData.get("requiresBalance") === "on";
  if (requiresBalance && parsed.data.annualEntitlementDays == null) throw new Error("Balanced leave requires an annual entitlement.");
  const code = parsed.data.code.toUpperCase();
  const values = {
    code,
    name: parsed.data.name,
    description: parsed.data.description || null,
    payrollTreatment: parsed.data.payrollTreatment,
    requiresBalance,
    annualEntitlementDays: requiresBalance ? parsed.data.annualEntitlementDays : null,
    eligibilityServiceMonths: parsed.data.eligibilityServiceMonths,
    maximumDaysPerRequest: parsed.data.maximumDaysPerRequest ?? null,
    dayCountingMethod: parsed.data.dayCountingMethod,
    active: formData.get("active") === "on",
  };

  const id = await prisma.$transaction(async (tx) => {
    const duplicate = await tx.leaveType.findFirst({ where: { tenantId: user.tenantId, code, ...(parsed.data.id ? { id: { not: parsed.data.id } } : {}) } });
    if (duplicate) throw new Error("A leave type with this code already exists.");
    if (parsed.data.id) {
      const existing = await tx.leaveType.findFirst({ where: { id: parsed.data.id, tenantId: user.tenantId } });
      if (!existing) throw new Error("Leave type not found.");
      if (existing.statutoryProtected) throw new Error("Statutory leave formulas are protected and cannot be changed by tenant configuration.");
      return (await tx.leaveType.update({ where: { id: existing.id }, data: values })).id;
    }
    return (await tx.leaveType.create({ data: { tenantId: user.tenantId, ...values, statutoryProtected: false } })).id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await prisma.auditLog.create({ data: { tenantId: user.tenantId, actorId: user.id, module: "PAYROLL", action: parsed.data.id ? "UPDATE_LEAVE_TYPE" : "CREATE_LEAVE_TYPE", entityType: "LeaveType", entityId: id, metadata: { code } } });
  revalidateLeavePages();
  redirect("/admin/leave?success=type-saved");
}

/** @requirement PAY-EMP-005 PAY-SEC-001 @status IMPLEMENTED */
export async function deactivateLeaveTypeAction(formData: FormData) {
  const { user } = await requirePayrollAccess(leaveConfigurationRoles);
  const id = String(formData.get("id") || "");
  const existing = await prisma.leaveType.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) throw new Error("Leave type not found.");
  if (existing.statutoryProtected) throw new Error("Protected statutory leave types cannot be deactivated by tenant administrators.");
  await prisma.leaveType.update({ where: { id }, data: { active: false } });
  await prisma.auditLog.create({ data: { tenantId: user.tenantId, actorId: user.id, module: "PAYROLL", action: "DEACTIVATE_LEAVE_TYPE", entityType: "LeaveType", entityId: id } });
  revalidateLeavePages();
  redirect("/admin/leave?success=type-deactivated");
}

/**
 * @requirement PAY-EMP-005 PAY-SEC-001
 * @status IMPLEMENTED
 * @description Owner-scoped employee leave submission with immutable formula/date evidence, overlap prevention, payroll locks, and balance reservation checks.
 */
export async function submitEmployeeLeaveRequestAction(formData: FormData) {
  const user = await requireUser(Role.EMPLOYEE);
  if (!user.employeeProfile) throw new Error("Employee profile not linked to this login.");
  const parsed = employeeLeaveRequestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid leave request.");
  const startDate = utcDate(parsed.data.startDate);
  const endDate = utcDate(parsed.data.endDate);

  const request = await prisma.$transaction(async (tx) => {
    const employee = await tx.employeeProfile.findFirst({ where: { id: user.employeeProfile!.id, tenantId: user.tenantId, status: "ACTIVE" } });
    if (!employee) throw new Error("Your employee profile is not active.");
    const leaveType = await tx.leaveType.findFirst({ where: { id: parsed.data.leaveTypeId, tenantId: user.tenantId, active: true } });
    if (!leaveType) throw new Error("The selected leave type is not available.");
    assertLeaveEligibility({ hireDate: employee.hireDate, leaveStartDate: startDate, eligibilityServiceMonths: leaveType.eligibilityServiceMonths });
    if (leaveType.requiresBalance && startDate.getUTCFullYear() !== endDate.getUTCFullYear()) throw new Error("Balanced leave requests must stay within one calendar year.");

    const [schedules, calendarDays, overlapping, lockedPayroll] = await Promise.all([
      tx.employeeSchedule.findMany({ where: { tenantId: user.tenantId, employeeId: employee.id, effectiveFrom: { lte: endDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: startDate } }] } }),
      tx.payrollCalendarDay.findMany({ where: { tenantId: user.tenantId, active: true, date: { gte: startDate, lte: endDate } } }),
      tx.leaveRequest.findFirst({ where: { tenantId: user.tenantId, employeeId: employee.id, status: { in: [LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED] }, startDate: { lte: endDate }, endDate: { gte: startDate } } }),
      tx.payrollPeriod.findFirst({ where: { tenantId: user.tenantId, status: { in: lockedPayrollStatuses }, startDate: { lte: endDate }, endDate: { gte: startDate }, payslips: { some: { employeeId: employee.id } } } }),
    ]);
    if (overlapping) throw new Error("A pending or approved leave request already overlaps this date range.");
    if (lockedPayroll) throw new Error(`This date range overlaps ${lockedPayroll.status.toLowerCase()} payroll and requires a controlled payroll correction.`);

    const dates = calculateLeaveDates({ startDate, endDate, dayCountingMethod: leaveType.dayCountingMethod, schedules, calendarDays });
    if (leaveType.maximumDaysPerRequest != null && dates.requestedDays > Number(leaveType.maximumDaysPerRequest)) throw new Error(`This leave type allows at most ${Number(leaveType.maximumDaysPerRequest)} day(s) per request.`);
    if (leaveType.requiresBalance) {
      const balance = await ensureLeaveBalance(tx as unknown as Prisma.TransactionClient, user.tenantId, employee.id, leaveType, startDate.getUTCFullYear(), user.id);
      const pending = await tx.leaveRequest.aggregate({
        where: { tenantId: user.tenantId, employeeId: employee.id, leaveTypeId: leaveType.id, status: LeaveRequestStatus.PENDING, startDate: { gte: new Date(`${startDate.getUTCFullYear()}-01-01T00:00:00.000Z`) }, endDate: { lte: new Date(`${startDate.getUTCFullYear()}-12-31T00:00:00.000Z`) } },
        _sum: { requestedDays: true },
      });
      const unreserved = roundDays(availableLeaveDays(balance) - Number(pending._sum.requestedDays ?? 0));
      if (dates.requestedDays > unreserved) throw new Error(`Insufficient leave balance. ${unreserved} day(s) remain after pending requests.`);
    }
    const created = await tx.leaveRequest.create({
      data: {
        tenantId: user.tenantId,
        employeeId: employee.id,
        leaveTypeId: leaveType.id,
        startDate,
        endDate,
        requestedDays: dates.requestedDays,
        reason: parsed.data.reason,
        evidenceReference: parsed.data.evidenceReference || null,
        leaveTypeSnapshot: leaveTypeEvidence(leaveType, dates),
      },
    });
    await tx.auditLog.create({ data: { tenantId: user.tenantId, actorId: user.id, module: "PAYROLL", action: "EMPLOYEE_SUBMIT_LEAVE_REQUEST", entityType: "LeaveRequest", entityId: created.id, metadata: { employeeId: employee.id, leaveTypeId: leaveType.id, startDate: parsed.data.startDate, endDate: parsed.data.endDate, requestedDays: dates.requestedDays } } });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateLeavePages();
  redirect(`/employee/leave?success=requested&request=${request.id}`);
}

/** @requirement PAY-EMP-005 PAY-SEC-001 @status IMPLEMENTED */
export async function cancelEmployeeLeaveRequestAction(formData: FormData) {
  const user = await requireUser(Role.EMPLOYEE);
  if (!user.employeeProfile) throw new Error("Employee profile not linked to this login.");
  const id = String(formData.get("id") || "");
  const changed = await prisma.leaveRequest.updateMany({ where: { id, tenantId: user.tenantId, employeeId: user.employeeProfile.id, status: LeaveRequestStatus.PENDING }, data: { status: LeaveRequestStatus.CANCELLED } });
  if (changed.count !== 1) throw new Error("Only your own pending leave request can be cancelled.");
  await prisma.auditLog.create({ data: { tenantId: user.tenantId, actorId: user.id, module: "PAYROLL", action: "EMPLOYEE_CANCEL_LEAVE_REQUEST", entityType: "LeaveRequest", entityId: id } });
  revalidateLeavePages();
  redirect("/employee/leave?success=cancelled");
}

/**
 * @requirement PAY-EMP-005 PAY-ATT-001 PAY-SEC-001
 * @status IMPLEMENTED
 * @description Approve or reject tenant-scoped leave; approval atomically consumes balance and creates linked paid/unpaid attendance outside locked payroll.
 */
export async function reviewLeaveRequestAction(formData: FormData) {
  const { user } = await requirePayrollAccess(leaveApprovalRoles);
  const id = String(formData.get("id") || "");
  const decision = z.nativeEnum(LeaveRequestStatus).parse(String(formData.get("decision") || ""));
  if (decision !== LeaveRequestStatus.APPROVED && decision !== LeaveRequestStatus.REJECTED) throw new Error("Choose approve or reject.");
  const remarks = String(formData.get("reviewRemarks") || "").trim();
  if (decision === LeaveRequestStatus.REJECTED && remarks.length < 3) throw new Error("Enter a rejection reason.");
  if (remarks.length > 500) throw new Error("Review remarks cannot exceed 500 characters.");

  await prisma.$transaction(async (tx) => {
    const request = await tx.leaveRequest.findFirst({ where: { id, tenantId: user.tenantId }, include: { employee: true, leaveType: true } });
    if (!request || request.status !== LeaveRequestStatus.PENDING) throw new Error("Pending leave request not found.");
    if (decision === LeaveRequestStatus.REJECTED) {
      await tx.leaveRequest.update({ where: { id }, data: { status: decision, reviewedById: user.id, reviewedAt: new Date(), reviewRemarks: remarks } });
      await tx.auditLog.create({ data: { tenantId: user.tenantId, actorId: user.id, module: "PAYROLL", action: "REJECT_LEAVE_REQUEST", entityType: "LeaveRequest", entityId: id, reason: remarks } });
      return;
    }

    const lockedPayroll = await tx.payrollPeriod.findFirst({ where: { tenantId: user.tenantId, status: { in: lockedPayrollStatuses }, startDate: { lte: request.endDate }, endDate: { gte: request.startDate }, payslips: { some: { employeeId: request.employeeId } } } });
    if (lockedPayroll) throw new Error(`This leave overlaps ${lockedPayroll.status.toLowerCase()} payroll and cannot be approved directly.`);
    const evidence = leaveRequestDateEvidence(request.leaveTypeSnapshot);
    const typeEvidence = resolvedLeaveTypeEvidence(request.leaveTypeSnapshot);
    const attendanceDates = evidence.attendanceDates.map(utcDate);
    if (typeEvidence.payrollTreatment !== LeavePayrollTreatment.TRACK_ONLY && attendanceDates.length) {
      const conflict = await tx.attendance.findFirst({ where: { tenantId: user.tenantId, employeeId: request.employeeId, date: { in: attendanceDates } } });
      if (conflict) throw new Error(`Attendance already exists on ${conflict.date.toISOString().slice(0, 10)}. Resolve it before approving leave.`);
    }
    if (typeEvidence.requiresBalance) {
      const balance = await ensureLeaveBalance(tx as unknown as Prisma.TransactionClient, user.tenantId, request.employeeId, typeEvidence, request.startDate.getUTCFullYear(), user.id);
      if (Number(request.requestedDays) > availableLeaveDays(balance)) throw new Error(`Insufficient leave balance. Only ${availableLeaveDays(balance)} day(s) remain.`);
      await tx.employeeLeaveBalance.update({ where: { id: balance.id }, data: { usedDays: { increment: request.requestedDays } } });
      await tx.leaveBalanceTransaction.create({ data: { tenantId: user.tenantId, balanceId: balance.id, leaveRequestId: request.id, type: LeaveBalanceTransactionType.USAGE, days: request.requestedDays, reason: `Approved ${typeEvidence.name}`, actorId: user.id } });
    }
    if (typeEvidence.payrollTreatment !== LeavePayrollTreatment.TRACK_ONLY && attendanceDates.length) {
      const status = typeEvidence.payrollTreatment === LeavePayrollTreatment.PAID_LEAVE ? AttendanceStatus.PAID_LEAVE : AttendanceStatus.UNPAID_LEAVE;
      await tx.attendance.createMany({ data: attendanceDates.map((date) => ({ tenantId: user.tenantId, employeeId: request.employeeId, date, status, leaveRequestId: request.id, remarks: `${typeEvidence.name} · approved leave request ${request.id}` })) });
    }
    await tx.leaveRequest.update({ where: { id }, data: { status: decision, reviewedById: user.id, reviewedAt: new Date(), reviewRemarks: remarks || null } });
    await tx.auditLog.create({ data: { tenantId: user.tenantId, actorId: user.id, module: "PAYROLL", action: "APPROVE_LEAVE_REQUEST", entityType: "LeaveRequest", entityId: id, metadata: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, requestedDays: Number(request.requestedDays), payrollTreatment: typeEvidence.payrollTreatment } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateLeavePages();
  redirect(`/admin/leave?success=${decision.toLowerCase()}`);
}

/** @requirement PAY-EMP-005 PAY-SEC-001 @status IMPLEMENTED */
export async function adjustEmployeeLeaveBalanceAction(formData: FormData) {
  const { user } = await requirePayrollAccess(leaveConfigurationRoles);
  const parsed = leaveBalanceAdjustmentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid leave balance adjustment.");
  await prisma.$transaction(async (tx) => {
    const [employee, leaveType] = await Promise.all([
      tx.employeeProfile.findFirst({ where: { id: parsed.data.employeeId, tenantId: user.tenantId } }),
      tx.leaveType.findFirst({ where: { id: parsed.data.leaveTypeId, tenantId: user.tenantId } }),
    ]);
    if (!employee || !leaveType) throw new Error("Employee or leave type not found in the authenticated tenant.");
    if (!leaveType.requiresBalance) throw new Error("This leave type does not use an annual balance.");
    const balance = await ensureLeaveBalance(tx as unknown as Prisma.TransactionClient, user.tenantId, employee.id, leaveType, parsed.data.year, user.id);
    if (roundDays(availableLeaveDays(balance) + parsed.data.days) < 0) throw new Error("Adjustment would make the available leave balance negative.");
    await tx.employeeLeaveBalance.update({ where: { id: balance.id }, data: { adjustmentDays: { increment: parsed.data.days } } });
    await tx.leaveBalanceTransaction.create({ data: { tenantId: user.tenantId, balanceId: balance.id, type: LeaveBalanceTransactionType.ADJUSTMENT, days: parsed.data.days, reason: parsed.data.reason, actorId: user.id } });
    await tx.auditLog.create({ data: { tenantId: user.tenantId, actorId: user.id, module: "PAYROLL", action: "ADJUST_LEAVE_BALANCE", entityType: "EmployeeLeaveBalance", entityId: balance.id, reason: parsed.data.reason, metadata: { employeeId: employee.id, leaveTypeId: leaveType.id, year: parsed.data.year, days: parsed.data.days } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidateLeavePages();
  redirect("/admin/leave?success=balance-adjusted");
}

async function ensureLeaveBalance(
  tx: Prisma.TransactionClient,
  tenantId: string,
  employeeId: string,
  leaveType: { id: string; name: string; requiresBalance: boolean; annualEntitlementDays: unknown },
  year: number,
  actorId: string,
) {
  const existing = await tx.employeeLeaveBalance.findFirst({ where: { tenantId, employeeId, leaveTypeId: leaveType.id, year } });
  if (existing) return existing;
  if (!leaveType.requiresBalance || leaveType.annualEntitlementDays == null) throw new Error(`${leaveType.name} has no valid annual entitlement formula.`);
  const balance = await tx.employeeLeaveBalance.create({ data: { tenantId, employeeId, leaveTypeId: leaveType.id, year, entitlementDays: Number(leaveType.annualEntitlementDays) } });
  await tx.leaveBalanceTransaction.create({ data: { tenantId, balanceId: balance.id, type: LeaveBalanceTransactionType.ENTITLEMENT, days: Number(leaveType.annualEntitlementDays), reason: `${year} annual entitlement`, actorId } });
  return balance;
}

const lockedPayrollStatuses: PayrollStatus[] = [PayrollStatus.FINALIZED, PayrollStatus.POSTING, PayrollStatus.POSTED, PayrollStatus.POST_FAILED, PayrollStatus.PAID];

function optionalNumber(minimum: number, maximum: number) {
  return z.preprocess((value) => value === "" || value == null ? undefined : value, z.coerce.number().finite().min(minimum).max(maximum).optional());
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function roundDays(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function revalidateLeavePages() {
  revalidatePath("/admin/leave");
  revalidatePath("/admin/attendance");
  revalidatePath("/admin/payroll");
  revalidatePath("/employee/leave");
  revalidatePath("/employee/attendance");
}
