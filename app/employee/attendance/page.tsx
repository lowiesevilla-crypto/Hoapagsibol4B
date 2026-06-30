import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/ui";
import { employeeClockInAction, employeeClockOutAction } from "@/lib/actions/attendance";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shortDate } from "@/lib/utils";

export default async function EmployeeAttendancePage() {
  const user = await requireUser();
  if (!user.employeeProfile) throw new Error("Employee profile not linked.");
  const today = todayInManila();
  const [employee, record] = await Promise.all([prisma.employeeProfile.findUniqueOrThrow({ where: { id: user.employeeProfile.id } }), prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: user.employeeProfile.id, date: today } } })]);
  return <>
    <PageHeader eyebrow="Employee self-service" title="Attendance dashboard" description={`Welcome ${employee.name}. Clock in and out, then use the separate pages for corrections or history.`} />
    <nav className="mb-6 flex gap-2 overflow-x-auto pb-2"><Link className="btn-primary shrink-0" href="/employee/attendance">Clock in / out</Link><Link className="btn-secondary shrink-0" href="/employee/attendance/correction">Request correction</Link><Link className="btn-secondary shrink-0" href="/employee/attendance/history">My history</Link></nav>
    <section className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <div className="card"><h2 className="text-lg font-black">Today — {shortDate(today)}</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><Info label="Status" value={record?.status.replaceAll("_", " ") ?? "Not clocked in"} /><Info label="Time in" value={record?.timeIn ?? "-"} /><Info label="Time out" value={record?.timeOut ?? "-"} /><Info label="Total" value={record ? `${record.totalHours} hrs` : "-"} /></div></div>
      <div className="card"><h2 className="text-lg font-black">Clock actions</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><form action={employeeClockInAction}><label className="label">Time in remarks</label><input className="field" name="timeInRemarks" maxLength={500} /><SubmitButton className="btn-primary mt-3 w-full">Time in</SubmitButton></form><form action={employeeClockOutAction}><label className="label">Time out remarks</label><input className="field" name="timeOutRemarks" maxLength={500} /><SubmitButton className="btn-secondary mt-3 w-full">Time out</SubmitButton></form></div></div>
    </section>
  </>;
}
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 font-bold">{value}</p></div>; }
function todayInManila() { const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`); }
