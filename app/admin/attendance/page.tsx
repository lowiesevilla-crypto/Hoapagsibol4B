import Link from "next/link";
import { CalendarCheck2, CircleDollarSign, ClipboardList, Users } from "lucide-react";
import { AttendanceNav } from "@/components/attendance-nav";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { prisma } from "@/lib/db";
import { requirePayrollAccess } from "@/lib/payroll-access";

export default async function AttendanceDashboardPage() {
  await requirePayrollAccess();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [activeEmployees, todayRecords, pendingCorrections, paidPeriods] = await Promise.all([
    prisma.employeeProfile.count({ where: { status: "ACTIVE" } }),
    prisma.attendance.findMany({ where: { date: today }, select: { status: true } }),
    prisma.attendanceAdjustment.count({ where: { status: "PENDING" } }),
    prisma.payrollPeriod.count({ where: { status: "PAID" } }),
  ]);
  const present = todayRecords.filter((item) => ["PRESENT", "HALF_DAY", "HOLIDAY", "PAID_LEAVE"].includes(item.status)).length;

  return <>
    <PageHeader eyebrow="Confidential payroll" title="Attendance dashboard" description="Review today’s attendance, correction workload, and payroll-lock context from one controlled workspace." action={<Link className="btn-primary" href="/admin/attendance/add">Add attendance record</Link>} />
    <AttendanceNav current="/admin/attendance" />

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-black text-slate-900">Today at a glance</h2>
          <p className="text-sm text-slate-500">Operational counts only. Attendance and payroll authority remain unchanged.</p>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payroll-protected workspace</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active employees" value={String(activeEmployees)} icon={Users} />
        <StatCard label="Recorded today" value={String(todayRecords.length)} icon={ClipboardList} />
        <StatCard label="Present today" value={String(present)} icon={CalendarCheck2} />
        <StatCard label="Pending corrections" value={String(pendingCorrections)} icon={CircleDollarSign} />
      </div>
    </section>

    <section className="mt-6">
      <div className="mb-3">
        <h2 className="font-black text-slate-900">Attendance operations</h2>
        <p className="text-sm text-slate-500">Use the existing controlled workflows for history, corrections, and payroll review.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ActionCard title="Attendance history" body="Filter records by employee, date, attendance status, or payroll status. Paid records stay read-only." href="/admin/attendance/history" label="Open history" />
        <ActionCard title="Correction approvals" body="Review employee correction requests on the dedicated approval screen without changing payroll authority." href="/admin/attendance/corrections/approval" label={`${pendingCorrections} awaiting review`} />
        <ActionCard title="Payroll manager review" body={`Review attendance before computation. ${paidPeriods} paid payroll period(s) currently lock matching records.`} href="/admin/attendance/review" label="Review for payroll" />
      </div>
    </section>
  </>;
}

function ActionCard({ title, body, href, label }: { title: string; body: string; href: string; label: string }) {
  return <article className="card flex h-full flex-col"><h3 className="text-lg font-black">{title}</h3><p className="mt-2 flex-1 text-sm leading-6 text-slate-500">{body}</p><Link className="btn-secondary mt-5 inline-flex self-start" href={href}>{label}</Link></article>;
}
