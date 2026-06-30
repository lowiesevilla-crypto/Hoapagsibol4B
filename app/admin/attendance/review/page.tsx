import Link from "next/link";
import { AttendanceNav } from "@/components/attendance-nav";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { requirePayrollAccess } from "@/lib/payroll-access";
import { shortDate } from "@/lib/utils";

export default async function PayrollAttendanceReviewPage() {
  await requirePayrollAccess();
  const [recent, pending] = await Promise.all([
    prisma.attendance.findMany({ include: { employee: true }, orderBy: [{ date: "desc" }, { employee: { name: "asc" } }], take: 100 }),
    prisma.attendanceAdjustment.count({ where: { status: "PENDING" } }),
  ]);
  return <>
    <PageHeader eyebrow="Payroll review" title="Payroll manager attendance review" description="Review calculated hours and exceptions before creating or recalculating payroll." action={<Link className="btn-primary" href="/admin/payroll/computation">Continue to payroll computation</Link>} />
    <AttendanceNav current="/admin/attendance/review" />
    {pending > 0 && <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>{pending} correction request(s) are pending.</strong> Resolve them before payroll computation. <Link className="font-black underline" href="/admin/attendance/corrections/approval">Open approvals</Link></div>}
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Employee</th><th>Status</th><th>Time</th><th>Total</th><th>Late</th><th>Undertime</th><th>Attendance OT</th><th></th></tr></thead><tbody>{recent.map((record) => <tr key={record.id}><td>{shortDate(record.date)}</td><td className="font-bold">{record.employee.name}</td><td><StatusBadge status={record.status} /></td><td>{record.timeIn || "-"} - {record.timeOut || "-"}</td><td>{String(record.totalHours)} hrs</td><td>{record.lateMinutes}m</td><td>{record.undertimeMinutes}m</td><td>{String(record.overtimeHours)} hrs <p className="text-xs text-slate-400">Not payable until approved</p></td><td><Link className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/admin/attendance/edit/${record.id}`}>Review</Link></td></tr>)}</tbody></table></div>
  </>;
}
