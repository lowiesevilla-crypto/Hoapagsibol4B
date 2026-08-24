"use server";

import { OvertimeSource, OvertimeStatus, PayrollStatus, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const employeeOvertimeRequestSchema = z.object({
  date: z.string().date("Choose a valid overtime date."),
  hours: z.coerce.number().finite().positive("OT hours must be greater than zero.").max(24, "OT hours cannot exceed 24 hours."),
  reason: z.string().trim().min(3, "Enter a short reason for the overtime request.").max(500),
});

/**
 * @requirement PAY-EMP-003 PAY-OT-001
 * @status IMPLEMENTED
 */
export async function submitEmployeeOvertimeRequestAction(formData: FormData) {
  const user = await requireUser(Role.EMPLOYEE);
  if (!user.employeeProfile) throw new Error("Employee profile not linked to this login.");

  const parsed = employeeOvertimeRequestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid overtime request.");

  const employeeId = user.employeeProfile.id;
  const date = new Date(`${parsed.data.date}T00:00:00.000Z`);

  await prisma.$transaction(async (tx) => {
    const employee = await tx.employeeProfile.findFirst({
      where: { id: employeeId, tenantId: user.tenantId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!employee) throw new Error("Your employee profile is not active for payroll.");

    const lockedPeriod = await tx.payrollPeriod.findFirst({
      where: {
        tenantId: user.tenantId,
        status: { in: [PayrollStatus.FINALIZED, PayrollStatus.POSTING, PayrollStatus.POSTED, PayrollStatus.POST_FAILED, PayrollStatus.PAID] },
        startDate: { lte: date },
        endDate: { gte: date },
        payslips: { some: { employeeId } },
      },
      select: { status: true, payDate: true },
    });
    if (lockedPeriod) {
      throw new Error(`This date is already included in ${lockedPeriod.status.toLowerCase()} payroll. Contact Payroll for a controlled adjustment.`);
    }

    const duplicate = await tx.overtimeRecord.findFirst({
      where: {
        tenantId: user.tenantId,
        employeeId,
        date,
        source: OvertimeSource.APPROVED_REQUEST,
        status: { in: [OvertimeStatus.PENDING, OvertimeStatus.APPROVED] },
      },
      select: { id: true, status: true },
    });
    if (duplicate) throw new Error(`An overtime request for this date is already ${duplicate.status.toLowerCase()}.`);

    const attendance = await tx.attendance.findFirst({
      where: { tenantId: user.tenantId, employeeId, date },
      select: { id: true },
    });

    await tx.overtimeRecord.create({
      data: {
        tenantId: user.tenantId,
        employeeId,
        attendanceId: attendance?.id ?? null,
        date,
        hours: parsed.data.hours,
        reason: parsed.data.reason,
        source: OvertimeSource.APPROVED_REQUEST,
        status: OvertimeStatus.PENDING,
        createdById: user.id,
      },
    });
  });

  await writeAuditLog({
    actorId: user.id,
    module: "PAYROLL",
    action: "EMPLOYEE_SUBMIT_OT_REQUEST",
    entityType: "OvertimeRecord",
    metadata: { employeeId, date: parsed.data.date, hours: parsed.data.hours },
  });

  revalidatePath("/employee/requests/overtime");
  revalidatePath("/admin/payroll");
  redirect("/employee/requests/overtime?success=requested&message=Overtime%20request%20submitted%20for%20payroll%20review.");
}
