import Link from "next/link";
import { CheckCircle2, Clock3, LockKeyhole, TimerReset } from "lucide-react";
import { PayrollStatus, Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/ui";
import { employeeClockInAction, employeeClockOutAction } from "@/lib/actions/attendance";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shortDate } from "@/lib/utils";

export default async function EmployeeAttendancePage() {
  const user = await requireUser(Role.EMPLOYEE);
  if (!user.employeeProfile) throw new Error("Employee profile not linked.");

  const today = todayInManila();
  const dayOfWeek = today.getUTCDay();
  const [employee, record, schedule, lockedPeriod] = await Promise.all([
    prisma.employeeProfile.findFirstOrThrow({ where: { id: user.employeeProfile.id, tenantId: user.tenantId } }),
    prisma.attendance.findFirst({ where: { tenantId: user.tenantId, employeeId: user.employeeProfile.id, date: today } }),
    prisma.employeeSchedule.findFirst({
      where: {
        tenantId: user.tenantId,
        employeeId: user.employeeProfile.id,
        dayOfWeek,
        effectiveFrom: { lte: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
      },
      orderBy: { effectiveFrom: "desc" },
    }),
    prisma.payrollPeriod.findFirst({
      where: {
        tenantId: user.tenantId,
        status: { in: [PayrollStatus.FINALIZED, PayrollStatus.PAID] },
        startDate: { lte: today },
        endDate: { gte: today },
        payslips: { some: { employeeId: user.employeeProfile.id } },
      },
      select: { status: true, payDate: true },
    }),
  ]);

  const isLocked = Boolean(lockedPeriod);
  const shiftLabel = schedule
    ? schedule.restDay
      ? "Rest day"
      : `${schedule.shiftStart} - ${schedule.shiftEnd}`
    : "No assigned shift";

  return <>
    <PageHeader
      eyebrow="Employee self-service"
      title="Time"
      description={`Welcome ${employee.name}. Use your phone to record Time In and Time Out using the server time.`}
    />

    <nav className="mb-6 flex gap-2 overflow-x-auto pb-2">
      <Link className="btn-primary shrink-0" href="/employee/attendance">Time</Link>
      <Link className="btn-secondary shrink-0" href="/employee/attendance/history">Timelogs</Link>
      <Link className="btn-secondary shrink-0" href="/employee/requests/overtime">Overtime</Link>
      <Link className="btn-secondary shrink-0" href="/employee/payslips">Payslips</Link>
      <Link className="btn-secondary shrink-0" href="/employee/loans">Loans</Link>
    </nav>

    {isLocked && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <LockKeyhole className="mt-0.5 size-5 shrink-0" />
      <div><p className="font-black">This date is payroll locked.</p><p>Payroll is {lockedPeriod?.status.toLowerCase()} for this cutoff. Direct timelog changes are disabled; Payroll must use a controlled adjustment.</p></div>
    </div>}

    <section className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
      <div className="card overflow-hidden p-0">
        <div className="bg-slate-950 p-6 text-white sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">Today · {shortDate(today)}</p>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-3xl font-black sm:text-4xl">{record?.timeIn ? (record.timeOut ? "Shift complete" : "Clocked in") : "Ready to clock in"}</p>
              <p className="mt-2 text-sm text-slate-300">Assigned shift: <span className="font-bold text-white">{shiftLabel}</span></p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-300">Attendance status</p>
              <p className="mt-1 font-black">{record?.status.replaceAll("_", " ") ?? "NOT STARTED"}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
          <Info label="Time in" value={record?.timeIn ?? "-"} />
          <Info label="Time out" value={record?.timeOut ?? "-"} />
          <Info label="Total hours" value={record ? `${record.totalHours} hrs` : "-"} />
        </div>

        <div className="border-t border-slate-100 p-5 sm:p-6">
          {!record?.timeIn && !isLocked && <form action={employeeClockInAction}>
            <label className="label" htmlFor="timeInRemarks">Time In remarks <span className="font-normal text-slate-400">(optional)</span></label>
            <input className="field" id="timeInRemarks" name="timeInRemarks" maxLength={500} placeholder="Example: On-site duty" />
            <SubmitButton className="mt-4 w-full min-h-14 text-base">Time In now</SubmitButton>
            <p className="mt-2 text-center text-xs text-slate-500">HOAHub uses server-authoritative Asia/Manila time.</p>
          </form>}

          {record?.timeIn && !record.timeOut && !isLocked && <form action={employeeClockOutAction}>
            <label className="label" htmlFor="timeOutRemarks">Time Out remarks <span className="font-normal text-slate-400">(optional)</span></label>
            <input className="field" id="timeOutRemarks" name="timeOutRemarks" maxLength={500} placeholder="Example: Completed assigned work" />
            <SubmitButton className="btn-secondary mt-4 w-full min-h-14 text-base">Time Out now</SubmitButton>
            <p className="mt-2 text-center text-xs text-slate-500">Your total hours are recalculated automatically.</p>
          </form>}

          {record?.timeIn && record.timeOut && <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900"><CheckCircle2 className="mt-0.5 size-5 shrink-0" /><div><p className="font-black">Today&apos;s timelog is complete.</p><p className="text-sm">If something is wrong and the cutoff is still open, request a correction from Timelogs.</p></div></div>}

          {isLocked && <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-slate-700"><LockKeyhole className="mt-0.5 size-5 shrink-0" /><div><p className="font-black">Clock actions are locked.</p><p className="text-sm">This day is already part of finalized or paid payroll.</p></div></div>}
        </div>
      </div>

      <div className="space-y-5">
        <section className="card">
          <div className="flex items-start gap-3"><TimerReset className="mt-0.5 size-5 text-pine-700" /><div><h2 className="font-black">Need to correct a timelog?</h2><p className="mt-1 text-sm text-slate-500">Open Timelogs, select a date, and submit corrected Time In/Time Out. The original record remains preserved in the audit trail.</p><Link className="btn-secondary mt-4" href="/employee/attendance/history">Open my timelogs</Link></div></div>
        </section>
        <section className="card">
          <div className="flex items-start gap-3"><Clock3 className="mt-0.5 size-5 text-pine-700" /><div><h2 className="font-black">Overtime</h2><p className="mt-1 text-sm text-slate-500">File OT separately. Only approved overtime is included when payroll is calculated.</p><Link className="btn-secondary mt-4" href="/employee/requests/overtime">File overtime</Link></div></div>
        </section>
      </div>
    </section>
  </>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-ink">{value}</p></div>;
}

function todayInManila() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
}
