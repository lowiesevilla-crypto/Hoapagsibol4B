import Link from "next/link";
import { Clock3, FileCheck2, Hourglass3 } from "lucide-react";
import { OvertimeStatus, Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/ui";
import { submitEmployeeOvertimeRequestAction } from "@/lib/actions/employee-payroll";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shortDate } from "@/lib/utils";

export default async function EmployeeOvertimeRequestsPage() {
  const user = await requireUser(Role.EMPLOYEE);
  if (!user.employeeProfile) throw new Error("Employee profile not linked.");

  const requests = await prisma.overtimeRecord.findMany({
    where: {
      tenantId: user.tenantId,
      employeeId: user.employeeProfile.id,
      source: "APPROVED_REQUEST",
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  const pending = requests.filter((item) => item.status === OvertimeStatus.PENDING).length;
  const approvedHours = requests
    .filter((item) => item.status === OvertimeStatus.APPROVED)
    .reduce((sum, item) => sum + Number(item.hours), 0);

  return <>
    <PageHeader
      eyebrow="Employee self-service"
      title="Overtime requests"
      description="File overtime for Payroll review and track each request from submission to approval."
    />

    <nav className="mb-6 flex gap-2 overflow-x-auto pb-2">
      <Link className="btn-secondary shrink-0" href="/employee/attendance">Time</Link>
      <Link className="btn-primary shrink-0" href="/employee/requests/overtime">Overtime</Link>
      <Link className="btn-secondary shrink-0" href="/employee/payslips">Payslips</Link>
      <Link className="btn-secondary shrink-0" href="/employee/loans">Loans</Link>
    </nav>

    <section className="mb-6 grid gap-4 sm:grid-cols-3">
      <div className="card">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Requests filed</p>
        <p className="mt-2 text-3xl font-black text-ink">{requests.length}</p>
      </div>
      <div className="card">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Pending review</p>
        <p className="mt-2 text-3xl font-black text-amber-700">{pending}</p>
      </div>
      <div className="card">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Approved OT hours</p>
        <p className="mt-2 text-3xl font-black text-pine-700">{approvedHours.toFixed(2)}</p>
      </div>
    </section>

    <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <form action={submitEmployeeOvertimeRequestAction} className="card h-fit">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-pine-50 p-2 text-pine-700"><Clock3 className="size-5" /></div>
          <div>
            <h2 className="text-lg font-black">File overtime</h2>
            <p className="text-sm text-slate-500">Only approved requests are included in payroll computation.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4">
          <div>
            <label className="label" htmlFor="date">OT date</label>
            <input className="field" id="date" name="date" type="date" defaultValue={todayInManilaInput()} required />
          </div>
          <div>
            <label className="label" htmlFor="hours">OT hours</label>
            <input className="field" id="hours" name="hours" type="number" min="0.25" max="24" step="0.25" placeholder="2.00" required />
          </div>
          <div>
            <label className="label" htmlFor="reason">Reason / work performed</label>
            <textarea className="field min-h-28" id="reason" name="reason" maxLength={500} required />
          </div>
        </div>
        <SubmitButton className="mt-5 w-full">Submit overtime request</SubmitButton>
      </form>

      <section className="card">
        <div className="mb-4">
          <h2 className="text-lg font-black">Request history</h2>
          <p className="text-sm text-slate-500">Pending requests can still be reviewed by Payroll. Finalized or paid payroll dates require a controlled payroll adjustment.</p>
        </div>
        <div className="space-y-3 md:hidden">
          {requests.map((item) => <article key={item.id} className="rounded-2xl border border-slate-100 p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-black">{shortDate(item.date)}</p><p className="text-sm text-slate-500">{Number(item.hours).toFixed(2)} hours</p></div>
              <StatusBadge status={item.status} />
            </div>
            <p className="mt-3 text-sm text-slate-700">{item.reason}</p>
            <p className="mt-3 text-xs text-slate-500">Filed {shortDate(item.createdAt)}{item.reviewedAt ? ` · Reviewed ${shortDate(item.reviewedAt)}` : ""}</p>
          </article>)}
          {!requests.length && <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500"><Hourglass3 className="mx-auto mb-2 size-7 text-slate-300" />No overtime requests yet.</div>}
        </div>
        <div className="hidden table-wrap shadow-none md:block">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Hours</th><th>Reason</th><th>Status</th><th>Reviewed</th></tr></thead>
            <tbody>
              {requests.map((item) => <tr key={item.id}>
                <td className="font-bold">{shortDate(item.date)}</td>
                <td>{Number(item.hours).toFixed(2)}</td>
                <td>{item.reason}</td>
                <td><StatusBadge status={item.status} /></td>
                <td>{item.reviewedAt ? shortDate(item.reviewedAt) : "Pending"}</td>
              </tr>)}
              {!requests.length && <tr><td colSpan={5} className="py-12 text-center text-slate-500"><FileCheck2 className="mx-auto mb-2 size-7 text-slate-300" />No overtime requests yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  </>;
}

function todayInManilaInput() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
