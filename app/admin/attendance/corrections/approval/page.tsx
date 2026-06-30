import { AttendanceAdjustmentStatus, PayrollStatus } from "@prisma/client";
import { AttendanceNav } from "@/components/attendance-nav";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/ui";
import { bulkReviewAttendanceAdjustmentsAction } from "@/lib/actions/attendance";
import { prisma } from "@/lib/db";
import { payrollWriteRoles, requirePayrollAccess } from "@/lib/payroll-access";
import { shortDate } from "@/lib/utils";

export default async function AttendanceCorrectionApprovalPage() {
  await requirePayrollAccess(payrollWriteRoles);
  const [requests, paidPeriods] = await Promise.all([
    prisma.attendanceAdjustment.findMany({ include: { attendance: { include: { employee: true } }, requestedBy: true, reviewedBy: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.payrollPeriod.findMany({ where: { status: PayrollStatus.PAID }, include: { payslips: { select: { employeeId: true } } } }),
  ]);
  const hasPendingRequests = requests.some((item) => item.status === AttendanceAdjustmentStatus.PENDING);
  return <>
    <PageHeader eyebrow="Attendance" title="Attendance correction approval" description="Approve or reject employee correction requests. Paid attendance remains locked." />
    <AttendanceNav current="/admin/attendance/corrections/approval" />
    <form action={bulkReviewAttendanceAdjustmentsAction} className="card">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-lg font-black">Correction requests</h2><p className="text-sm text-slate-500">Select only pending, unlocked requests.</p></div><div className="flex flex-wrap gap-2"><select className="field w-auto" name="decision" disabled={!hasPendingRequests}><option value="APPROVED">Approve selected</option><option value="REJECTED">Reject selected</option></select><input className="field" name="reviewRemarks" placeholder="Review note (optional)" disabled={!hasPendingRequests} />{hasPendingRequests ? <SubmitButton>Apply review</SubmitButton> : <button className="btn-primary" type="button" disabled>No requests to review</button>}</div></div>
      <div className="table-wrap shadow-none"><table className="data-table"><thead><tr><th></th><th>Employee</th><th>Attendance date</th><th>Current time</th><th>Requested time</th><th>Reason</th><th>Status</th><th>Requested by</th></tr></thead><tbody>{requests.map((item) => {
        const adjusted = item.adjustedData as Record<string, unknown>;
        const locked = paidPeriods.some((period) => period.startDate <= item.attendance.date && period.endDate >= item.attendance.date && period.payslips.some((slip) => slip.employeeId === item.attendance.employeeId));
        return <tr key={item.id}><td>{item.status === AttendanceAdjustmentStatus.PENDING && !locked && <input type="checkbox" name="ids" value={item.id} />}</td><td><p className="font-bold">{item.attendance.employee.name}</p><p className="text-xs text-slate-400">{item.attendance.employee.employeeNumber}</p></td><td>{shortDate(item.attendance.date)}</td><td>{item.attendance.timeIn || "-"} - {item.attendance.timeOut || "-"}</td><td>{String(adjusted.timeIn || "-")} - {String(adjusted.timeOut || "-")}</td><td className="max-w-xs whitespace-pre-line">{item.reason}</td><td><StatusBadge status={locked ? "PAID" : item.status} /></td><td>{item.requestedBy?.name ?? "Employee"}<p className="text-xs text-slate-400">{shortDate(item.createdAt)}</p></td></tr>;
      })}{!requests.length && <tr><td colSpan={8} className="py-12 text-center text-slate-500">No correction requests yet.</td></tr>}</tbody></table></div>
    </form>
  </>;
}
