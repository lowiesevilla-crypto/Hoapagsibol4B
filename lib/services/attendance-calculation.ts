import type { AttendanceStatus, EmployeeSchedule, PayrollCalendarDay } from "@prisma/client";
import { prisma } from "@/lib/db";

type AttendanceInput = {
  employeeId: string;
  date: Date;
  timeIn?: string | null;
  timeOut?: string | null;
  status: AttendanceStatus;
  overtimeHours?: number;
};

export async function deriveAttendanceMetrics(input: AttendanceInput) {
  const dayOfWeek = input.date.getUTCDay();
  const [schedule, calendarDay] = await Promise.all([
    prisma.employeeSchedule.findFirst({
      where: {
        employeeId: input.employeeId,
        dayOfWeek,
        effectiveFrom: { lte: input.date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.date } }],
      },
      orderBy: { effectiveFrom: "desc" },
    }),
    prisma.payrollCalendarDay.findUnique({ where: { date: input.date } }),
  ]);
  return calculateAttendanceMetrics(input, schedule, calendarDay);
}

export function calculateAttendanceMetrics(input: AttendanceInput, schedule?: EmployeeSchedule | null, calendarDay?: PayrollCalendarDay | null) {
  const totalHours = input.timeIn && input.timeOut ? hoursBetween(input.timeIn, input.timeOut) : 0;
  const scheduledHours = schedule && !schedule.restDay ? hoursBetween(schedule.shiftStart, schedule.shiftEnd) : 8;
  const lateMinutes = input.timeIn && schedule && !schedule.restDay ? Math.max(0, minutes(input.timeIn) - minutes(schedule.shiftStart)) : 0;
  const undertimeMinutes = input.timeOut && schedule && !schedule.restDay ? Math.max(0, minutes(schedule.shiftEnd) - minutes(input.timeOut)) : 0;
  const autoOvertime = Math.max(0, totalHours - scheduledHours);
  const overtimeHours = roundHours(Math.max(input.overtimeHours ?? 0, autoOvertime));
  const nightDifferentialHours = input.timeIn && input.timeOut ? nightHours(input.timeIn, input.timeOut) : 0;
  return {
    totalHours: roundHours(totalHours),
    lateMinutes,
    undertimeMinutes,
    overtimeHours,
    nightDifferentialHours,
    isRestDay: Boolean(schedule?.restDay) || calendarDay?.type === "NON_WORKING_DAY",
    holidayType: calendarDay?.active ? calendarDay.type : null,
  };
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function hoursBetween(start: string, end: string) {
  const startMinutes = minutes(start);
  let endMinutes = minutes(end);
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  return (endMinutes - startMinutes) / 60;
}

function nightHours(start: string, end: string) {
  const startMinutes = minutes(start);
  let endMinutes = minutes(end);
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  let overlap = 0;
  for (let cursor = startMinutes; cursor < endMinutes; cursor += 15) {
    const normalized = cursor % (24 * 60);
    if (normalized >= 22 * 60 || normalized < 6 * 60) overlap += 15;
  }
  return roundHours(overlap / 60);
}

function roundHours(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
