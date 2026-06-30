import Link from "next/link";
import { AttendanceStatus } from "@prisma/client";
import { AttendanceNav } from "@/components/attendance-nav";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/ui";
import { saveAttendanceAction } from "@/lib/actions/attendance";
import { prisma } from "@/lib/db";
import { payrollWriteRoles, requirePayrollAccess } from "@/lib/payroll-access";
import { inputDate } from "@/lib/utils";

export default async function AddAttendancePage() {
  await requirePayrollAccess(payrollWriteRoles);
  const employees = await prisma.employeeProfile.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } });
  return <>
    <PageHeader eyebrow="Attendance" title="Add attendance record" description="Create one employee attendance record. Duplicate employee/date entries are blocked." />
    <AttendanceNav current="/admin/attendance/add" />
    <form action={saveAttendanceAction} className="card mx-auto max-w-4xl">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label">Employee</label><select className="field" name="employeeId" required defaultValue=""><option value="" disabled>Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} - {employee.employeeNumber}</option>)}</select></div>
        <div><label className="label">Date</label><input className="field" name="date" type="date" defaultValue={inputDate(new Date())} required /></div>
        <div><label className="label">Attendance status</label><select className="field" name="status" defaultValue="PRESENT">{Object.values(AttendanceStatus).map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></div>
        <div><label className="label">Time in</label><input className="field" name="timeIn" type="time" defaultValue="08:00" /></div>
        <div><label className="label">Time out</label><input className="field" name="timeOut" type="time" defaultValue="17:00" /></div>
        <input type="hidden" name="overtimeHours" value="0" />
        <div className="sm:col-span-2"><label className="label">Remarks</label><textarea className="field min-h-28" name="remarks" maxLength={500} /></div>
      </div>
      <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">Overtime is approved separately. Attendance hours alone never add OT pay.</p>
      <div className="mt-5 flex flex-wrap gap-2"><SubmitButton>Add attendance</SubmitButton><Link className="btn-secondary" href="/admin/attendance/history">Cancel</Link></div>
    </form>
  </>;
}
