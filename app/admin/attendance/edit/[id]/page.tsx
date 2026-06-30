import Link from "next/link";
import { AttendanceStatus, PayrollStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { AttendanceDeleteForm } from "@/components/attendance-delete-form";
import { AttendanceNav } from "@/components/attendance-nav";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/ui";
import { saveAttendanceAction } from "@/lib/actions/attendance";
import { prisma } from "@/lib/db";
import { hasPayrollRole, payrollManageRoles, payrollWriteRoles, requirePayrollAccess } from "@/lib/payroll-access";
import { inputDate, shortDate } from "@/lib/utils";

export default async function EditAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { roles } = await requirePayrollAccess(payrollWriteRoles);
  const { id } = await params;
  const [record, employees] = await Promise.all([
    prisma.attendance.findUnique({ where: { id }, include: { employee: true } }),
    prisma.employeeProfile.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
  ]);
  if (!record) notFound();
  const paidPeriod = await prisma.payrollPeriod.findFirst({ where: { status: PayrollStatus.PAID, startDate: { lte: record.date }, endDate: { gte: record.date }, payslips: { some: { employeeId: record.employeeId } } } });
  const paid = Boolean(paidPeriod);
  const canDeletePaid = hasPayrollRole(roles, payrollManageRoles);
  return <>
    <PageHeader eyebrow="Attendance" title={paid ? "View paid attendance" : "Edit attendance record"} description={`${record.employee.name} - ${shortDate(record.date)}`} />
    <AttendanceNav current="/admin/attendance/history" />
    {paid ? <section className="card mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">Paid record — read only</h2><p className="text-sm text-slate-500">Frontend and backend editing are disabled because this record belongs to a paid payroll period.</p></div><StatusBadge status="PAID" /></div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><ReadValue label="Employee" value={`${record.employee.name} - ${record.employee.employeeNumber}`} /><ReadValue label="Date" value={shortDate(record.date)} /><ReadValue label="Status" value={record.status.replaceAll("_", " ")} /><ReadValue label="Time in" value={record.timeIn || "-"} /><ReadValue label="Time out" value={record.timeOut || "-"} /><ReadValue label="Total hours" value={`${record.totalHours} hrs`} /><ReadValue label="Remarks" value={record.remarks || "-"} /></dl>
      <div className="mt-5 flex flex-col items-start gap-3"><Link className="btn-secondary" href="/admin/attendance/history">Back to history</Link>{canDeletePaid && <AttendanceDeleteForm id={record.id} paid />}</div>
    </section> : <form action={saveAttendanceAction} className="card mx-auto max-w-4xl">
      <input type="hidden" name="id" value={record.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label">Employee</label><select className="field" name="employeeId" defaultValue={record.employeeId} required>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} - {employee.employeeNumber}</option>)}</select></div>
        <div><label className="label">Date</label><input className="field" name="date" type="date" defaultValue={inputDate(record.date)} required /></div>
        <div><label className="label">Status</label><select className="field" name="status" defaultValue={record.status}>{Object.values(AttendanceStatus).map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></div>
        <div><label className="label">Time in</label><input className="field" name="timeIn" type="time" defaultValue={record.timeIn ?? ""} /></div>
        <div><label className="label">Time out</label><input className="field" name="timeOut" type="time" defaultValue={record.timeOut ?? ""} /></div>
        <input type="hidden" name="overtimeHours" value={String(record.overtimeHours)} />
        <div><label className="label">Late minutes (calculated)</label><input className="field" value={record.lateMinutes} readOnly /></div>
        <div><label className="label">Undertime minutes (calculated)</label><input className="field" value={record.undertimeMinutes} readOnly /></div>
        <div className="sm:col-span-2"><label className="label">Remarks</label><textarea className="field min-h-24" name="remarks" defaultValue={record.remarks ?? ""} /></div>
        <div className="sm:col-span-2"><label className="label">Correction reason</label><input className="field" name="adjustmentReason" required maxLength={500} placeholder="Required audit reason for this edit" /></div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2"><SubmitButton>Save attendance update</SubmitButton><Link className="btn-secondary" href="/admin/attendance/history">Cancel</Link></div>
    </form>}
  </>;
}

function ReadValue({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-slate-50 p-4"><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 font-bold">{value}</dd></div>; }
