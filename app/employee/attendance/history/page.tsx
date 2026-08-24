import Link from "next/link";
import { LockKeyhole, PencilLine } from "lucide-react";
import { PayrollStatus, Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inputDate, shortDate } from "@/lib/utils";

export default async function EmployeeAttendanceHistoryPage() {
  const user = await requireUser(Role.EMPLOYEE);
  if (!user.employeeProfile) throw new Error("Employee profile not linked.");

  const employeeId = user.employeeProfile.id;
  const [records, requests, lockedPeriods] = await Promise.all([
    prisma.attendance.findMany({ where: { tenantId: user.tenantId, employeeId }, orderBy: { date: "desc" }, take: 180 }),
    prisma.attendanceAdjustment.findMany({ where: { tenantId: user.tenantId, attendance: { employeeId } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.payrollPeriod.findMany({
      where: {
        tenantId: user.tenantId,
        status: { in: [PayrollStatus.FINALIZED, PayrollStatus.PAID] },
        payslips: { some: { employeeId } },
      },
      select: { startDate: true, endDate: true, status: true, payDate: true },
      orderBy: { endDate: "desc" },
    }),
  ]);

  const isLocked = (date: Date) => lockedPeriods.some((period) => date >= period.startDate && date <= period.endDate);

  return <>
    <PageHeader eyebrow="Employee attendance" title="My timelogs" description="Review Time In/Time Out, hours worked, and correction status. Open cutoff dates can still be corrected; finalized or paid payroll dates are locked." />
    <nav className="mb-6 flex gap-2 overflow-x-auto pb-2">
      <Link className="btn-secondary shrink-0" href="/employee/attendance">Time</Link>
      <Link className="btn-primary shrink-0" href="/employee/attendance/history">Timelogs</Link>
      <Link className="btn-secondary shrink-0" href="/employee/requests/overtime">Overtime</Link>
      <Link className="btn-secondary shrink-0" href="/employee/payslips">Payslips</Link>
      <Link className="btn-secondary shrink-0" href="/employee/loans">Loans</Link>
    </nav>

    <section className="card mb-6">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-lg font-black">Attendance records</h2><p className="text-sm text-slate-500">Up to the latest 180 records.</p></div>
        <Link className="btn-secondary" href="/employee/attendance/correction">Request correction</Link>
      </div>

      <div className="space-y-3 md:hidden">
        {records.map((record) => {
          const locked = isLocked(record.date);
          const correctionHref = `/employee/attendance/correction?date=${inputDate(record.date)}&timeIn=${encodeURIComponent(record.timeIn || "")}&timeOut=${encodeURIComponent(record.timeOut || "")}`;
          return <article key={record.id} className="rounded-2xl border border-slate-100 p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-black">{shortDate(record.date)}</p><p className="mt-1 text-sm text-slate-500">{record.timeIn || "-"} - {record.timeOut || "-"} · {String(record.totalHours)} hrs</p></div>
              <StatusBadge status={record.status} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">Late</p><p className="font-bold">{record.lateMinutes} min</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">Undertime</p><p className="font-bold">{record.undertimeMinutes} min</p></div></div>
            {record.remarks && <p className="mt-3 text-sm text-slate-600">{record.remarks}</p>}
            <div className="mt-3">
              {locked
                ? <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600"><LockKeyhole className="size-3.5" /> Payroll locked</span>
                : <Link className="btn-secondary min-h-9 px-3 py-1.5" href={correctionHref}><PencilLine className="size-4" /> Correct timelog</Link>}
            </div>
          </article>;
        })}
        {!records.length && <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">No attendance records yet.</div>}
      </div>

      <div className="hidden table-wrap shadow-none md:block">
        <table className="data-table">
          <thead><tr><th>Date</th><th>Status</th><th>Time</th><th>Total</th><th>Late / undertime</th><th>Remarks</th><th></th></tr></thead>
          <tbody>
            {records.map((record) => {
              const locked = isLocked(record.date);
              const correctionHref = `/employee/attendance/correction?date=${inputDate(record.date)}&timeIn=${encodeURIComponent(record.timeIn || "")}&timeOut=${encodeURIComponent(record.timeOut || "")}`;
              return <tr key={record.id}>
                <td className="font-bold">{shortDate(record.date)}</td>
                <td><StatusBadge status={record.status} /></td>
                <td>{record.timeIn || "-"} - {record.timeOut || "-"}</td>
                <td>{String(record.totalHours)} hrs</td>
                <td>{record.lateMinutes}m / {record.undertimeMinutes}m</td>
                <td>{record.remarks || "-"}</td>
                <td>{locked ? <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500"><LockKeyhole className="size-3.5" /> Locked</span> : <Link className="btn-secondary min-h-8 px-3 py-1" href={correctionHref}>Correct</Link>}</td>
              </tr>;
            })}
            {!records.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">No attendance records yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    <section className="card">
      <h2 className="text-lg font-black">Correction request history</h2>
      <p className="mt-1 text-sm text-slate-500">Requests preserve the original timelog and require Payroll review before the effective attendance is changed.</p>
      <div className="mt-4 table-wrap shadow-none"><table className="data-table"><thead><tr><th>Requested</th><th>Attendance date</th><th>Reason</th><th>Status</th><th>Reviewed</th></tr></thead><tbody>{requests.map((item) => <tr key={item.id}><td>{shortDate(item.createdAt)}</td><td>{shortDate((item.originalData as Record<string, string>).date || item.createdAt)}</td><td>{item.reason}</td><td><StatusBadge status={item.status} /></td><td>{item.reviewedAt ? shortDate(item.reviewedAt) : "Pending"}</td></tr>)}{!requests.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">No correction requests yet.</td></tr>}</tbody></table></div>
    </section>
  </>;
}
