import Link from "next/link";
import { AttendanceStatus, PayrollStatus, type Prisma } from "@prisma/client";
import { AttendanceDeleteForm } from "@/components/attendance-delete-form";
import { AttendanceNav } from "@/components/attendance-nav";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/ui";
import { prisma } from "@/lib/db";
import { hasPayrollRole, payrollManageRoles, requirePayrollAccess } from "@/lib/payroll-access";
import { shortDate } from "@/lib/utils";

type Params = { employee?: string; from?: string; to?: string; status?: string; payrollStatus?: string };

export default async function AttendanceHistoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { user, roles } = await requirePayrollAccess();
  const params = await searchParams;
  const where: Prisma.AttendanceWhereInput = { tenantId: user.tenantId };
  if (params.employee) where.employeeId = params.employee;
  if (params.status && params.status !== "ALL") where.status = params.status as AttendanceStatus;
  const date: Prisma.DateTimeFilter = {};
  if (params.from) date.gte = new Date(`${params.from}T00:00:00.000Z`);
  if (params.to) date.lte = new Date(`${params.to}T00:00:00.000Z`);
  if (Object.keys(date).length) where.date = date;
  const [employees, rawRecords, periods] = await Promise.all([
    prisma.employeeProfile.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: "asc" } }),
    prisma.attendance.findMany({ where, include: { employee: true }, orderBy: [{ date: "desc" }, { employee: { name: "asc" } }], take: 500 }),
    prisma.payrollPeriod.findMany({ where: { tenantId: user.tenantId }, include: { payslips: { where: { tenantId: user.tenantId }, select: { employeeId: true } } }, orderBy: { endDate: "desc" } }),
  ]);
  const records = params.payrollStatus && params.payrollStatus !== "ALL" ? rawRecords.filter((item) => payrollStatusFor(item, periods) === params.payrollStatus) : rawRecords;
  const canDeletePaid = hasPayrollRole(roles, payrollManageRoles);
  return <>
    <PageHeader eyebrow="Attendance" title="Employee attendance history" description="Search, review, edit unlocked records, or audit-delete paid records with confirmation." action={<Link className="btn-primary" href="/admin/attendance/add">Add record</Link>} />
    <AttendanceNav current="/admin/attendance/history" />
    <form className="card mb-6" method="get">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div><label className="label">Employee</label><select className="field" name="employee" defaultValue={params.employee ?? ""}><option value="">All employees</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} - {employee.employeeNumber}</option>)}</select></div>
        <div><label className="label">From</label><input className="field" name="from" type="date" defaultValue={params.from ?? ""} /></div>
        <div><label className="label">To</label><input className="field" name="to" type="date" defaultValue={params.to ?? ""} /></div>
        <div><label className="label">Attendance status</label><select className="field" name="status" defaultValue={params.status ?? "ALL"}><option value="ALL">All</option>{Object.values(AttendanceStatus).map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></div>
        <div><label className="label">Payroll status</label><select className="field" name="payrollStatus" defaultValue={params.payrollStatus ?? "ALL"}><option value="ALL">All</option><option value="NOT_INCLUDED">Not included</option><option value="DRAFT">Draft</option><option value="CALCULATED">Calculated</option><option value="FINALIZED">Finalized</option><option value="POSTING">Posting</option><option value="POSTED">Posted</option><option value="POST_FAILED">Post failed</option><option value="PAID">Paid</option></select></div>
      </div>
      <div className="mt-4 flex gap-2"><SubmitButton>Apply filters</SubmitButton><Link className="btn-secondary" href="/admin/attendance/history">Clear</Link></div>
    </form>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Employee</th><th>Status</th><th>Payroll</th><th>Time</th><th>Total</th><th>Late / undertime</th><th>Remarks</th><th>Actions</th></tr></thead><tbody>{records.map((record) => {
      const payrollStatus = payrollStatusFor(record, periods);
      const locked = !["NOT_INCLUDED", PayrollStatus.DRAFT, PayrollStatus.CALCULATED].includes(payrollStatus);
      return <tr key={record.id}><td className="font-bold">{shortDate(record.date)}</td><td><p className="font-bold">{record.employee.name}</p><p className="text-xs text-slate-400">{record.employee.employeeNumber}</p></td><td><StatusBadge status={record.status} /></td><td><StatusBadge status={payrollStatus} /></td><td>{record.timeIn || "-"} - {record.timeOut || "-"}</td><td>{String(record.totalHours)} hrs</td><td>{record.lateMinutes}m / {record.undertimeMinutes}m</td><td className="max-w-xs whitespace-pre-line">{record.remarks || "-"}</td><td><div className="flex flex-col items-end gap-2">{locked ? <Link className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/admin/attendance/edit/${record.id}`}>View</Link> : <Link className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/admin/attendance/edit/${record.id}`}>Edit</Link>}{(!locked || canDeletePaid) && <AttendanceDeleteForm id={record.id} paid={locked} />}</div></td></tr>;
    })}{!records.length && <tr><td colSpan={9} className="py-12 text-center text-slate-500">No attendance records match these filters.</td></tr>}</tbody></table></div>
  </>;
}

type Period = Prisma.PayrollPeriodGetPayload<{ include: { payslips: { select: { employeeId: true } } } }>;
function payrollStatusFor(record: { employeeId: string; date: Date }, periods: Period[]) {
  return periods.find((period) => period.startDate <= record.date && period.endDate >= record.date && period.payslips.some((slip) => slip.employeeId === record.employeeId))?.status ?? "NOT_INCLUDED";
}
