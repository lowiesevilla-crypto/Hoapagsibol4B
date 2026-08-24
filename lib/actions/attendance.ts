"use server";

import { AttendanceAdjustmentStatus, AttendanceStatus, NotificationChannel, NotificationStatus, NotificationType, PayrollDayType, PayrollStatus, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { payrollWriteRoles, requirePayrollAccess } from "@/lib/payroll-access";
import { deriveAttendanceMetrics } from "@/lib/services/attendance-calculation";
import { attendanceAdjustmentReviewSchema, attendanceCorrectionRequestSchema, attendanceSchema, employeeClockSchema } from "@/lib/validation";

/**
 * @requirement PAY-ATT-002 PAY-SEC-001
 * @status IMPLEMENTED
 */
export async function saveAttendanceAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollWriteRoles);
  const parsed = attendanceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid attendance record.");

  const { id, date, timeIn, timeOut, remarks, adjustmentReason, ...data } = parsed.data;
  const targetDate = new Date(`${date}T00:00:00.000Z`);
  const employee = await prisma.employeeProfile.findFirst({ where: { id: data.employeeId, tenantId: user.tenantId }, select: { id: true } });
  if (!employee) throw new Error("Employee not found in the authenticated tenant.");

  const metrics = await deriveAttendanceMetrics({ tenantId: user.tenantId, employeeId: data.employeeId, date: targetDate, timeIn: timeIn || null, timeOut: timeOut || null, status: data.status, overtimeHours: data.overtimeHours });
  const values = { ...data, ...metrics, date: targetDate, timeIn: timeIn || null, timeOut: timeOut || null, remarks: remarks || null };

  if (id) {
    const existing = await prisma.attendance.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) throw new Error("Attendance record not found.");
    await assertAttendanceEditable(existing.employeeId, existing.date, user.tenantId);

    const duplicate = await prisma.attendance.findFirst({ where: { tenantId: user.tenantId, employeeId: data.employeeId, date: targetDate, id: { not: id } } });
    if (duplicate) throw new Error("An attendance record already exists for this employee and date.");
    if (!adjustmentReason) throw new Error("Enter a correction reason for attendance adjustments.");

    await prisma.attendance.update({ where: { id }, data: values });
    await prisma.attendanceAdjustment.create({
      data: {
        tenantId: user.tenantId,
        attendanceId: id,
        originalData: attendanceSnapshot(existing),
        adjustedData: attendanceSnapshot(values),
        reason: adjustmentReason,
        status: AttendanceAdjustmentStatus.APPROVED,
        requestedById: user.id,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });
    await writeAuditLog({ actorId: user.id, module: "ATTENDANCE", action: "ADJUST_ATTENDANCE", entityType: "Attendance", entityId: id, metadata: { reason: adjustmentReason } });
  } else {
    const duplicate = await prisma.attendance.findFirst({ where: { tenantId: user.tenantId, employeeId: data.employeeId, date: targetDate } });
    if (duplicate) throw new Error("Attendance already exists for this employee and date. Use Edit to update the existing record.");
    const record = await prisma.attendance.create({ data: { tenantId: user.tenantId, ...values } });
    await writeAuditLog({ actorId: user.id, module: "ATTENDANCE", action: "CREATE_ATTENDANCE", entityType: "Attendance", entityId: record.id, metadata: { employeeId: data.employeeId, date } });
  }

  revalidateAttendancePages();
  revalidatePath("/admin/payroll");
  redirect(id ? "/admin/attendance/history?success=updated" : "/admin/attendance/add?success=saved");
}

/**
 * @requirement PAY-ATT-002 PAY-RUN-003 PAY-SEC-001
 * @status IMPLEMENTED
 */
export async function deleteAttendanceAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollWriteRoles);
  const id = String(formData.get("id") || "");
  const record = await prisma.attendance.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!record) throw new Error("Attendance record not found.");

  const lockedPeriod = await prisma.payrollPeriod.findFirst({
    where: {
      tenantId: user.tenantId,
      status: { in: [PayrollStatus.FINALIZED, PayrollStatus.POSTING, PayrollStatus.POSTED, PayrollStatus.POST_FAILED, PayrollStatus.PAID] },
      startDate: { lte: record.date },
      endDate: { gte: record.date },
      payslips: { some: { employeeId: record.employeeId } },
    },
    select: { id: true, status: true, startDate: true, endDate: true, payDate: true },
  });
  if (lockedPeriod) {
    throw new Error(`This attendance record is already included in ${lockedPeriod.status.toLowerCase()} payroll and cannot be deleted. Use a controlled payroll adjustment instead.`);
  }

  const snapshot = attendanceSnapshot(record);
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        module: "ATTENDANCE",
        action: "DELETE_ATTENDANCE",
        entityType: "Attendance",
        entityId: id,
        metadata: { record: snapshot },
      },
    });
    await tx.attendance.delete({ where: { id } });
  });

  revalidateAttendancePages();
  revalidatePath("/admin/payroll");
  redirect("/admin/attendance/history?success=deleted");
}

/**
 * @requirement PAY-EMP-002 PAY-ATT-001 PAY-SEC-001
 * @status IMPLEMENTED
 */
export async function employeeClockInAction(formData: FormData) {
  const user = await requireUser(Role.EMPLOYEE);
  if (!user.employeeProfile) throw new Error("Employee profile not linked to this login.");
  const parsed = employeeClockSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid clock-in details.");

  const date = todayInManila();
  const timeIn = timeInManila();
  const existing = await prisma.attendance.findFirst({ where: { tenantId: user.tenantId, employeeId: user.employeeProfile.id, date } });
  if (existing) await assertAttendanceEditable(existing.employeeId, existing.date, user.tenantId);
  if (existing?.timeIn) throw new Error("You have already completed your Time In for today.");

  const remarks = mergeClockRemark(existing?.remarks ?? null, "Time In Remarks", parsed.data.timeInRemarks || parsed.data.remarks);
  const metrics = await deriveAttendanceMetrics({ tenantId: user.tenantId, employeeId: user.employeeProfile.id, date, timeIn, timeOut: existing?.timeOut ?? null, status: AttendanceStatus.PRESENT, overtimeHours: Number(existing?.overtimeHours ?? 0) });

  let record;
  if (existing) {
    record = await prisma.attendance.update({ where: { id: existing.id }, data: { timeIn, status: AttendanceStatus.PRESENT, remarks, ...metrics } });
  } else {
    record = await prisma.attendance.create({
      data: { tenantId: user.tenantId, employeeId: user.employeeProfile.id, date, timeIn, status: AttendanceStatus.PRESENT, remarks, ...metrics },
    });
  }

  await writeAuditLog({ actorId: user.id, module: "ATTENDANCE", action: "EMPLOYEE_CLOCK_IN", entityType: "Attendance", entityId: record.id, metadata: { timeIn } });
  revalidatePath("/employee/attendance");
  revalidatePath("/employee/attendance/history");
  redirect("/employee/attendance?success=clocked-in");
}

/**
 * @requirement PAY-EMP-002 PAY-ATT-001 PAY-SEC-001
 * @status IMPLEMENTED
 */
export async function employeeClockOutAction(formData: FormData) {
  const user = await requireUser(Role.EMPLOYEE);
  if (!user.employeeProfile) throw new Error("Employee profile not linked to this login.");
  const parsed = employeeClockSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid clock-out details.");

  const date = todayInManila();
  const existing = await prisma.attendance.findFirst({ where: { tenantId: user.tenantId, employeeId: user.employeeProfile.id, date } });
  if (!existing?.timeIn) throw new Error("Clock in first before clocking out.");
  if (existing.timeOut) throw new Error("You have already completed your Time Out for today.");
  await assertAttendanceEditable(existing.employeeId, existing.date, user.tenantId);

  const timeOut = timeInManila();
  const remarks = mergeClockRemark(existing.remarks, "Time Out Remarks", parsed.data.timeOutRemarks || parsed.data.remarks);
  const metrics = await deriveAttendanceMetrics({ tenantId: user.tenantId, employeeId: user.employeeProfile.id, date, timeIn: existing.timeIn, timeOut, status: existing.status, overtimeHours: Number(existing.overtimeHours) });
  const record = await prisma.attendance.update({ where: { id: existing.id }, data: { timeOut, remarks, ...metrics } });

  await writeAuditLog({ actorId: user.id, module: "ATTENDANCE", action: "EMPLOYEE_CLOCK_OUT", entityType: "Attendance", entityId: record.id, metadata: { timeOut, totalHours: metrics.totalHours } });
  revalidatePath("/employee/attendance");
  revalidatePath("/employee/attendance/history");
  redirect("/employee/attendance?success=clocked-out");
}

/**
 * @requirement PAY-EMP-002 PAY-ATT-002 PAY-SEC-001
 * @status IMPLEMENTED
 */
export async function requestAttendanceCorrectionAction(formData: FormData) {
  const user = await requireUser(Role.EMPLOYEE);
  if (!user.employeeProfile) throw new Error("Employee profile not linked to this login.");
  const parsed = attendanceCorrectionRequestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid correction request.");

  const targetDate = new Date(`${parsed.data.date}T00:00:00.000Z`);
  const attendance = await prisma.attendance.findFirst({ where: { tenantId: user.tenantId, employeeId: user.employeeProfile.id, date: targetDate } });
  if (!attendance) throw new Error("No attendance record was found for the selected date. Contact payroll if a missing day needs to be encoded.");
  await assertAttendanceEditable(attendance.employeeId, attendance.date, user.tenantId);

  const existingPending = await prisma.attendanceAdjustment.findFirst({
    where: { tenantId: user.tenantId, attendanceId: attendance.id, status: AttendanceAdjustmentStatus.PENDING },
    select: { id: true },
  });
  if (existingPending) throw new Error("A correction request for this timelog is already pending Payroll review.");

  const status = parsed.data.correctTimeIn && parsed.data.correctTimeOut ? AttendanceStatus.PRESENT : attendance.status;
  const metrics = await deriveAttendanceMetrics({ tenantId: user.tenantId, employeeId: attendance.employeeId, date: targetDate, timeIn: parsed.data.correctTimeIn, timeOut: parsed.data.correctTimeOut, status, overtimeHours: Number(attendance.overtimeHours) });
  const adjustedData = { ...attendanceSnapshot(attendance), ...metrics, status, date: targetDate, timeIn: parsed.data.correctTimeIn, timeOut: parsed.data.correctTimeOut, remarks: parsed.data.remarks };

  await prisma.attendanceAdjustment.create({
    data: {
      tenantId: user.tenantId,
      attendanceId: attendance.id,
      originalData: attendanceSnapshot(attendance),
      adjustedData: attendanceSnapshot(adjustedData),
      reason: parsed.data.remarks,
      status: AttendanceAdjustmentStatus.PENDING,
      requestedById: user.id,
    },
  });

  await writeAuditLog({ actorId: user.id, module: "ATTENDANCE", action: "REQUEST_ATTENDANCE_CORRECTION", entityType: "Attendance", entityId: attendance.id, metadata: { date: parsed.data.date, correctTimeIn: parsed.data.correctTimeIn, correctTimeOut: parsed.data.correctTimeOut } });
  revalidatePath("/employee/attendance");
  revalidatePath("/employee/attendance/history");
  revalidateAttendancePages();
  redirect("/employee/attendance/history?success=requested");
}

/**
 * @requirement PAY-ATT-002 PAY-SEC-001
 * @status IMPLEMENTED
 */
export async function reviewAttendanceAdjustmentAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollWriteRoles);
  const parsed = attendanceAdjustmentReviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid review details.");
  const adjustment = await applyAttendanceAdjustmentReview(parsed.data.id, parsed.data.decision, user.id, user.tenantId, parsed.data.reviewRemarks);
  await writeAuditLog({ actorId: user.id, module: "ATTENDANCE", action: `${parsed.data.decision}_ATTENDANCE_ADJUSTMENT`, entityType: "AttendanceAdjustment", entityId: adjustment.id, metadata: { reviewRemarks: parsed.data.reviewRemarks } });
  revalidateAttendancePages();
  revalidatePath("/employee/attendance");
  revalidatePath("/employee/attendance/history");
  redirect("/admin/attendance/corrections/approval?success=reviewed");
}

/**
 * @requirement PAY-ATT-002 PAY-SEC-001
 * @status IMPLEMENTED
 */
export async function bulkReviewAttendanceAdjustmentsAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollWriteRoles);
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const decision = String(formData.get("decision") || "");
  const reviewRemarks = String(formData.get("reviewRemarks") || "").trim() || undefined;
  if (!ids.length) redirect("/admin/attendance/corrections/approval?error=Select%20at%20least%20one%20correction%20request.");
  if (decision !== "APPROVED" && decision !== "REJECTED") redirect("/admin/attendance/corrections/approval?error=Choose%20whether%20to%20approve%20or%20reject%20the%20selected%20requests.");

  for (const id of ids) {
    const adjustment = await applyAttendanceAdjustmentReview(id, decision, user.id, user.tenantId, reviewRemarks);
    await writeAuditLog({ actorId: user.id, module: "ATTENDANCE", action: `BULK_${decision}_ATTENDANCE_ADJUSTMENT`, entityType: "AttendanceAdjustment", entityId: adjustment.id, metadata: { reviewRemarks } });
  }

  revalidateAttendancePages();
  revalidatePath("/employee/attendance");
  revalidatePath("/employee/attendance/history");
  revalidatePath("/admin/payroll");
  redirect(`/admin/attendance/corrections/approval?success=reviewed&message=${encodeURIComponent(`${ids.length} correction request${ids.length === 1 ? "" : "s"} reviewed.`)}`);
}

function attendanceSnapshot(record: unknown) {
  return JSON.parse(JSON.stringify(record));
}

async function applyAttendanceAdjustmentReview(id: string, decision: "APPROVED" | "REJECTED", reviewedById: string, tenantId: string, reviewRemarks?: string) {
  return prisma.$transaction(async (tx) => {
    const adjustment = await tx.attendanceAdjustment.findFirst({
      where: { id, tenantId },
      include: { attendance: { include: { employee: { include: { user: true } } } } },
    });
    if (!adjustment) throw new Error("Attendance correction request not found.");
    if (adjustment.attendance.tenantId !== tenantId || adjustment.attendance.employee.tenantId !== tenantId) throw new Error("Attendance correction request is outside the authenticated tenant.");
    if (adjustment.status !== AttendanceAdjustmentStatus.PENDING) throw new Error("This correction request has already been reviewed.");

    const locked = await tx.payrollPeriod.findFirst({
      where: {
        tenantId,
        status: { in: [PayrollStatus.FINALIZED, PayrollStatus.POSTING, PayrollStatus.POSTED, PayrollStatus.POST_FAILED, PayrollStatus.PAID] },
        startDate: { lte: adjustment.attendance.date },
        endDate: { gte: adjustment.attendance.date },
        payslips: { some: { employeeId: adjustment.attendance.employeeId } },
      },
      select: { id: true, status: true },
    });
    if (locked) throw new Error(`This attendance record is already included in ${locked.status.toLowerCase()} payroll and cannot be changed directly.`);

    if (decision === AttendanceAdjustmentStatus.APPROVED) {
      const adjusted = adjustedAttendanceValues(adjustment.adjustedData);
      await tx.attendance.update({ where: { id: adjustment.attendanceId }, data: adjusted });
    }

    const reviewed = await tx.attendanceAdjustment.update({
      where: { id },
      data: { status: decision, reviewedById, reviewedAt: new Date() },
    });

    if (adjustment.attendance.employee.userId) {
      await tx.notificationLog.create({
        data: {
          tenantId,
          recipientId: adjustment.attendance.employee.userId,
          type: NotificationType.ANNOUNCEMENT,
          channel: NotificationChannel.EMAIL,
          subject: `Attendance correction ${decision.toLowerCase()}`,
          message: `Your attendance correction for ${adjustment.attendance.date.toISOString().slice(0, 10)} was ${decision.toLowerCase()}.${reviewRemarks ? `\n\nRemarks: ${reviewRemarks}` : ""}`,
          status: NotificationStatus.SKIPPED,
        },
      });
    }
    return reviewed;
  });
}

function adjustedAttendanceValues(value: unknown) {
  const data = value as Record<string, unknown>;
  return {
    timeIn: asNullableString(data.timeIn),
    timeOut: asNullableString(data.timeOut),
    totalHours: Number(data.totalHours ?? 0),
    lateMinutes: Number(data.lateMinutes ?? 0),
    undertimeMinutes: Number(data.undertimeMinutes ?? 0),
    status: String(data.status || AttendanceStatus.PRESENT) as AttendanceStatus,
    overtimeHours: Number(data.overtimeHours ?? 0),
    nightDifferentialHours: Number(data.nightDifferentialHours ?? 0),
    isRestDay: Boolean(data.isRestDay),
    holidayType: asPayrollDayType(data.holidayType),
    remarks: asNullableString(data.remarks),
  };
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asPayrollDayType(value: unknown) {
  return typeof value === "string" && Object.values(PayrollDayType).includes(value as PayrollDayType) ? value as PayrollDayType : null;
}

async function assertAttendanceEditable(employeeId: string, date: Date, tenantId: string) {
  const locked = await prisma.payrollPeriod.findFirst({
    where: {
      tenantId,
      status: { in: [PayrollStatus.FINALIZED, PayrollStatus.POSTING, PayrollStatus.POSTED, PayrollStatus.POST_FAILED, PayrollStatus.PAID] },
      startDate: { lte: date },
      endDate: { gte: date },
      payslips: { some: { employeeId } },
    },
    select: { status: true, payDate: true },
  });
  if (locked) throw new Error(`This attendance record is already included in ${locked.status.toLowerCase()} payroll. Use an authorized payroll adjustment process instead.`);
}

function mergeClockRemark(existing: string | null, label: "Time In Remarks" | "Time Out Remarks", value?: string) {
  const remark = value?.trim();
  if (!remark) return existing || null;
  const lines = (existing || "").split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith(`${label}:`));
  lines.push(`${label}: ${remark}`);
  return lines.join("\n");
}

function todayInManila() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const text = `${values.year}-${values.month}-${values.day}`;
  return new Date(`${text}T00:00:00.000Z`);
}

function timeInManila() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

function revalidateAttendancePages() {
  revalidatePath("/admin/attendance");
  revalidatePath("/admin/attendance/add");
  revalidatePath("/admin/attendance/edit");
  revalidatePath("/admin/attendance/history");
  revalidatePath("/admin/attendance/corrections/approval");
  revalidatePath("/admin/attendance/review");
  revalidatePath("/employee/attendance");
  revalidatePath("/employee/attendance/history");
  revalidatePath("/employee/attendance/correction");
}
