import Link from "next/link";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/ui";
import { requestAttendanceCorrectionAction } from "@/lib/actions/attendance";
import { requireUser } from "@/lib/auth";

export default async function AttendanceCorrectionRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; timeIn?: string; timeOut?: string }>;
}) {
  const user = await requireUser(Role.EMPLOYEE);
  if (!user.employeeProfile) throw new Error("Employee profile not linked.");
  const params = await searchParams;

  return <>
    <PageHeader eyebrow="Employee attendance" title="Correct a timelog" description="Submit corrected Time In and Time Out while the cutoff is still open. The original timelog is retained for audit and Payroll must approve the request." />
    <nav className="mb-6 flex gap-2 overflow-x-auto pb-2">
      <Link className="btn-secondary shrink-0" href="/employee/attendance">Time</Link>
      <Link className="btn-secondary shrink-0" href="/employee/attendance/history">Timelogs</Link>
      <Link className="btn-primary shrink-0" href="/employee/attendance/correction">Correction</Link>
      <Link className="btn-secondary shrink-0" href="/employee/requests/overtime">Overtime</Link>
    </nav>
    <form action={requestAttendanceCorrectionAction} className="card mx-auto max-w-2xl">
      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
        This request does not overwrite your original punch immediately. Payroll reviews the correction, and finalized or paid payroll dates cannot be changed directly.
      </div>
      <div className="mt-5 grid gap-4">
        <div><label className="label" htmlFor="date">Attendance date</label><input className="field" id="date" name="date" type="date" defaultValue={params.date || ""} required /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="correctTimeIn">Correct Time In</label><input className="field" id="correctTimeIn" name="correctTimeIn" type="time" defaultValue={params.timeIn || ""} required /></div>
          <div><label className="label" htmlFor="correctTimeOut">Correct Time Out</label><input className="field" id="correctTimeOut" name="correctTimeOut" type="time" defaultValue={params.timeOut || ""} required /></div>
        </div>
        <div><label className="label" htmlFor="remarks">Reason / remarks</label><textarea className="field min-h-32" id="remarks" name="remarks" required maxLength={500} placeholder="Explain what is incorrect and why the timelog should be changed." /></div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2"><SubmitButton>Submit correction request</SubmitButton><Link className="btn-secondary" href="/employee/attendance/history">Cancel</Link></div>
    </form>
  </>;
}
