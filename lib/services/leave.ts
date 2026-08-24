import { LeaveDayCountingMethod, LeavePayrollTreatment, type Prisma } from "@prisma/client";

type DateLike = Date | string;
type ScheduleEvidence = Readonly<{ dayOfWeek: number; restDay: boolean; effectiveFrom: DateLike; effectiveTo: DateLike | null }>;
type CalendarEvidence = Readonly<{ date: DateLike; type: string }>;

const NON_WORKING_TYPES = new Set(["REGULAR_HOLIDAY", "SPECIAL_NON_WORKING_HOLIDAY", "HOA_DECLARED_HOLIDAY", "NON_WORKING_DAY"]);

/**
 * @requirement PAY-EMP-005 PAY-ATT-001
 * @status IMPLEMENTED
 * @description Resolve immutable requested-day and payroll-attendance dates using the employee schedule and tenant calendar.
 */
export function calculateLeaveDates(input: {
  startDate: Date;
  endDate: Date;
  dayCountingMethod: LeaveDayCountingMethod | "WORKING_DAYS" | "CALENDAR_DAYS";
  schedules: readonly ScheduleEvidence[];
  calendarDays: readonly CalendarEvidence[];
}) {
  const allDates = enumerateUtcDates(input.startDate, input.endDate);
  const nonWorking = new Set(input.calendarDays.filter((item) => NON_WORKING_TYPES.has(item.type)).map((item) => dateKey(item.date)));
  const attendanceDates = allDates.filter((date) => {
    if (nonWorking.has(dateKey(date))) return false;
    const matches = input.schedules
      .filter((schedule) => schedule.dayOfWeek === date.getUTCDay() && new Date(schedule.effectiveFrom) <= date && (!schedule.effectiveTo || new Date(schedule.effectiveTo) >= date))
      .sort((left, right) => new Date(right.effectiveFrom).getTime() - new Date(left.effectiveFrom).getTime());
    if (matches[0]) return !matches[0].restDay;
    return date.getUTCDay() !== 0;
  });
  const requestedDates = input.dayCountingMethod === "CALENDAR_DAYS" ? allDates : attendanceDates;
  if (!requestedDates.length) throw new Error("The selected range contains no leave days under the employee schedule and tenant calendar.");
  return {
    requestedDays: requestedDates.length,
    requestedDates: requestedDates.map(dateKey),
    attendanceDates: attendanceDates.map(dateKey),
  };
}

/** @requirement PAY-EMP-005 @status IMPLEMENTED */
export function assertLeaveEligibility(input: { hireDate: Date; leaveStartDate: Date; eligibilityServiceMonths: number }) {
  const eligibleAt = new Date(input.hireDate);
  eligibleAt.setUTCMonth(eligibleAt.getUTCMonth() + input.eligibilityServiceMonths);
  if (input.leaveStartDate < eligibleAt) {
    throw new Error(`This leave type requires ${input.eligibilityServiceMonths} completed month(s) of service.`);
  }
}

/** @requirement PAY-EMP-005 @status IMPLEMENTED */
export function availableLeaveDays(balance: { entitlementDays: unknown; carriedForwardDays: unknown; adjustmentDays: unknown; usedDays: unknown }) {
  return roundDays(Number(balance.entitlementDays) + Number(balance.carriedForwardDays) + Number(balance.adjustmentDays) - Number(balance.usedDays));
}

/** @requirement PAY-EMP-005 @status IMPLEMENTED */
export function leaveTypeEvidence(type: {
  id: string;
  code: string;
  name: string;
  payrollTreatment: LeavePayrollTreatment | string;
  requiresBalance: boolean;
  annualEntitlementDays: unknown;
  eligibilityServiceMonths: number;
  maximumDaysPerRequest: unknown;
  dayCountingMethod: LeaveDayCountingMethod | string;
  statutoryProtected: boolean;
  statutoryAuthority: string | null;
  sourceSnapshot: Prisma.JsonValue | null;
}, dates: { requestedDays: number; requestedDates: string[]; attendanceDates: string[] }): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify({
    leaveTypeId: type.id,
    code: type.code,
    name: type.name,
    payrollTreatment: type.payrollTreatment,
    requiresBalance: type.requiresBalance,
    annualEntitlementDays: type.annualEntitlementDays == null ? null : Number(type.annualEntitlementDays),
    eligibilityServiceMonths: type.eligibilityServiceMonths,
    maximumDaysPerRequest: type.maximumDaysPerRequest == null ? null : Number(type.maximumDaysPerRequest),
    dayCountingMethod: type.dayCountingMethod,
    statutoryProtected: type.statutoryProtected,
    statutoryAuthority: type.statutoryAuthority,
    sourceSnapshot: type.sourceSnapshot,
    request: dates,
  })) as Prisma.InputJsonValue;
}

/** @requirement PAY-EMP-005 PAY-ATT-001 @status IMPLEMENTED */
export function leaveRequestDateEvidence(snapshot: Prisma.JsonValue) {
  const root = asRecord(snapshot);
  const request = asRecord(root.request);
  const attendanceDates = stringArray(request.attendanceDates);
  const requestedDates = stringArray(request.requestedDates);
  if (!requestedDates.length) throw new Error("Leave request is missing immutable date evidence.");
  return { requestedDates, attendanceDates };
}

/** @requirement PAY-EMP-005 PAY-ATT-001 @status IMPLEMENTED */
export function resolvedLeaveTypeEvidence(snapshot: Prisma.JsonValue) {
  const root = asRecord(snapshot);
  const payrollTreatment = root.payrollTreatment;
  const dayCountingMethod = root.dayCountingMethod;
  if (typeof root.leaveTypeId !== "string" || typeof root.name !== "string") throw new Error("Leave request is missing immutable type evidence.");
  if (!Object.values(LeavePayrollTreatment).includes(payrollTreatment as LeavePayrollTreatment)) throw new Error("Leave request has invalid payroll treatment evidence.");
  if (!Object.values(LeaveDayCountingMethod).includes(dayCountingMethod as LeaveDayCountingMethod)) throw new Error("Leave request has invalid day-counting evidence.");
  const annualEntitlementDays = root.annualEntitlementDays == null ? null : Number(root.annualEntitlementDays);
  if (annualEntitlementDays != null && (!Number.isFinite(annualEntitlementDays) || annualEntitlementDays < 0)) throw new Error("Leave request has invalid entitlement evidence.");
  return {
    id: root.leaveTypeId,
    name: root.name,
    payrollTreatment: payrollTreatment as LeavePayrollTreatment,
    requiresBalance: root.requiresBalance === true,
    annualEntitlementDays,
    dayCountingMethod: dayCountingMethod as LeaveDayCountingMethod,
  };
}

function enumerateUtcDates(start: Date, end: Date) {
  if (start > end) throw new Error("Leave start date must be on or before the end date.");
  const maximumEnd = new Date(start);
  maximumEnd.setUTCDate(maximumEnd.getUTCDate() + 365);
  if (end > maximumEnd) throw new Error("A leave request cannot span more than 366 calendar days.");
  const dates: Date[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) dates.push(new Date(cursor));
  return dates;
}

function dateKey(value: DateLike) {
  return new Date(value).toISOString().slice(0, 10);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item)) ? value as string[] : [];
}

function roundDays(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
