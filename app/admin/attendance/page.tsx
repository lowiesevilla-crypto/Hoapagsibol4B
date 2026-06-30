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
    <PageHeader eyebrow="Confidential payroll" title="Attendance dashboard" description="A focused overview of today’s attendance, pending corrections, and payroll locks." action={<Link className="btn-primary" href="/admin/attendance/add">Add attendance record</Link>} />
    <AttendanceNav current="/admin/attendance" />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Active employees" value={String(activeEmployees)} icon={Users} />
      <StatCard label="Recorded today" value={String(todayRecords.length)} icon={ClipboardList} />
      <StatCard label="Present today" value={String(present)} icon={CalendarCheck2} />
      <StatCard label="Pending corrections" value={String(pendingCorrections)} icon={CircleDollarSign} />
    </section>
    <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <ActionCard title="Attendance history" body="Filter records by employee, date, attendance status, or payroll status. Paid records stay read-only." href="/admin/attendance/history" label="Open history" />
      <ActionCard title="Correction approvals" body="Review employee correction requests on a dedicated approval screen." href="/admin/attendance/corrections/approval" label={`${pendingCorrections} awaiting review`} />
      <ActionCard title="Payroll manager review" body={`Review attendance before computation. ${paidPeriods} paid payroll period(s) currently lock matching records.`} href="/admin/attendance/review" label="Review for payroll" />
    </section>
  </>;
}

function ActionCard({ title, body, href, label }: { title: string; body: string; href: string; label: string }) {
  return <article className="card"><h2 className="text-lg font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{body}</p><Link className="btn-secondary mt-5" href={href}>{label}</Link></article>;
}
