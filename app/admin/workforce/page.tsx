import Link from "next/link";
import { AttendanceStatus, PayrollStatus } from "@prisma/client";
import { CalendarCheck2, ClipboardCheck, CreditCard, UsersRound } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceCard } from "@/components/ui/workspace-card";
import { prisma } from "@/lib/db";
import { requirePayrollAccess } from "@/lib/payroll-access";

const presentStatuses = new Set<AttendanceStatus>([
  AttendanceStatus.PRESENT,
  AttendanceStatus.HALF_DAY,
  AttendanceStatus.HOLIDAY,
  AttendanceStatus.PAID_LEAVE,
]);

export default async function WorkforceHubPage() {
  const { user } = await requirePayrollAccess();
  const tenantId = user.tenantId;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [activeEmployees, todayAttendance, pendingCorrections, draftPayrolls, finalizedPayrolls, latestPeriods] = await Promise.all([
    prisma.employeeProfile.count({ where: { tenantId, status: "ACTIVE" } }),
    prisma.attendance.findMany({ where: { tenantId, date: today }, select: { status: true } }),
    prisma.attendanceAdjustment.count({ where: { tenantId, status: "PENDING" } }),
    prisma.payrollPeriod.count({ where: { tenantId, status: { in: [PayrollStatus.DRAFT, PayrollStatus.CALCULATED] } } }),
    prisma.payrollPeriod.count({ where: { tenantId, status: PayrollStatus.FINALIZED } }),
    prisma.payrollPeriod.findMany({ where: { tenantId }, take: 5, orderBy: [{ payDate: "desc" }, { createdAt: "desc" }], select: { id: true, status: true, startDate: true, endDate: true, payDate: true, _count: { select: { payslips: true } } } }),
  ]);
  const presentToday = todayAttendance.filter((item) => presentStatuses.has(item.status)).length;
  const payrollAttention = draftPayrolls + finalizedPayrolls + pendingCorrections;

  return <div className="space-y-5">
    <PageHeader eyebrow="Philippine Workforce Operations" title="HRIS & Payroll Command Center" description="A protected tenant workspace for employee operations, attendance readiness, corrections, and payroll processing. Salary and payroll authority remain governed by existing payroll access roles." context={<><StatusBadge tone="ai">Payroll protected</StatusBadge><StatusBadge tone={payrollAttention ? "warning" : "success"}>{payrollAttention ? `${payrollAttention} item${payrollAttention === 1 ? "" : "s"} need review` : "Payroll queues clear"}</StatusBadge></>} actions={<><Link className="btn-secondary" href="/admin/employees">Employees</Link><Link className="btn-secondary" href="/admin/attendance">Attendance</Link><Link className="btn-primary" href="/admin/payroll">Open Payroll</Link></>} />

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Active employees" value={activeEmployees} note="Tenant workforce records" icon={UsersRound} tone="blue" href="/admin/employees" />
      <MetricCard label="Recorded today" value={todayAttendance.length} note={`${presentToday} present / paid status`} icon={CalendarCheck2} tone="green" href="/admin/attendance" />
      <MetricCard label="Pending corrections" value={pendingCorrections} note="Attendance adjustments awaiting review" icon={ClipboardCheck} tone={pendingCorrections ? "amber" : "green"} href="/admin/attendance/corrections/approval" />
      <MetricCard label="Payroll periods open" value={draftPayrolls + finalizedPayrolls} note={`${draftPayrolls} draft · ${finalizedPayrolls} finalized`} icon={CreditCard} tone={draftPayrolls + finalizedPayrolls ? "violet" : "green"} href="/admin/payroll" />
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
      <WorkspaceCard title="Payroll readiness" description="Recent payroll periods and their authoritative processing state.">
        <div className="divide-y divide-slate-100">
          {latestPeriods.map((period) => <Link key={period.id} href={`/admin/payroll?period=${period.id}`} className="grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_150px_100px] sm:items-center"><div><p className="font-black text-slate-900">Payroll {period.startDate.toLocaleDateString("en-PH")} – {period.endDate.toLocaleDateString("en-PH")}</p><p className="mt-1 text-xs text-slate-500">Pay date {period.payDate.toLocaleDateString("en-PH")}</p></div><StatusBadge tone={period.status === PayrollStatus.PAID ? "success" : period.status === PayrollStatus.FINALIZED ? "info" : "warning"}>{period.status}</StatusBadge><p className="text-right text-sm font-black text-pine-700">{period._count.payslips} payslips →</p></Link>)}
          {!latestPeriods.length ? <p className="py-10 text-center text-sm text-slate-500">No payroll periods recorded.</p> : null}
        </div>
      </WorkspaceCard>

      <WorkspaceCard title="Workforce actions" description="Direct entry to existing protected HRIS and payroll workflows.">
        <div className="grid gap-2"><Action href="/admin/employees" title="Employee data management" note="Profiles, schedules and employment records" /><Action href="/admin/attendance" title="Time & attendance" note="Daily records, corrections and payroll review" /><Action href="/admin/leave" title="Leave management" note="Protected leave types, requests, balances and approvals" /><Action href="/admin/payroll" title="Payroll processing" note="Periods, deductions, OT, loans, approval and payslips" /><Action href="/admin/attendance/corrections/approval" title="Correction approvals" note={`${pendingCorrections} request${pendingCorrections === 1 ? "" : "s"} pending`} /></div>
      </WorkspaceCard>
    </section>
  </div>;
}

function Action({ href, title, note }: { href: string; title: string; note: string }) { return <Link href={href} className="group rounded-2xl border border-slate-100 bg-surface-subtle p-4 transition hover:border-pine-100 hover:bg-white"><p className="font-black text-slate-900 group-hover:text-pine-700">{title} →</p><p className="mt-1 text-xs leading-5 text-slate-500">{note}</p></Link>; }
