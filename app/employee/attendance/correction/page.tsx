import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/ui";
import { requestAttendanceCorrectionAction } from "@/lib/actions/attendance";
import { requireUser } from "@/lib/auth";

export default async function AttendanceCorrectionRequestPage() {
  const user = await requireUser();
  if (!user.employeeProfile) throw new Error("Employee profile not linked.");
  return <>
    <PageHeader eyebrow="Employee attendance" title="Attendance correction request" description="Submit corrected times and a clear reason. Payroll staff will review the request." />
    <nav className="mb-6 flex gap-2 overflow-x-auto pb-2"><Link className="btn-secondary shrink-0" href="/employee/attendance">Clock in / out</Link><Link className="btn-primary shrink-0" href="/employee/attendance/correction">Request correction</Link><Link className="btn-secondary shrink-0" href="/employee/attendance/history">My history</Link></nav>
    <form action={requestAttendanceCorrectionAction} className="card mx-auto max-w-2xl">
      <div className="grid gap-4"><div><label className="label">Attendance date</label><input className="field" name="date" type="date" required /></div><div className="grid gap-4 sm:grid-cols-2"><div><label className="label">Correct time in</label><input className="field" name="correctTimeIn" type="time" required /></div><div><label className="label">Correct time out</label><input className="field" name="correctTimeOut" type="time" required /></div></div><div><label className="label">Reason / remarks</label><textarea className="field min-h-32" name="remarks" required maxLength={500} /></div></div>
      <div className="mt-5 flex gap-2"><SubmitButton>Submit request</SubmitButton><Link className="btn-secondary" href="/employee/attendance">Cancel</Link></div>
    </form>
  </>;
}
