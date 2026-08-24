import Link from "next/link";
import { CalendarCheck2, Clock3, ShieldCheck } from "lucide-react";
import { LeaveRequestStatus, Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { cancelEmployeeLeaveRequestAction, submitEmployeeLeaveRequestAction } from "@/lib/actions/leave";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { availableLeaveDays } from "@/lib/services/leave";
import { shortDate } from "@/lib/utils";

export default async function EmployeeLeavePage() {
  const user = await requireUser(Role.EMPLOYEE);
  if (!user.employeeProfile) throw new Error("Employee profile not linked.");
  const employeeId = user.employeeProfile.id;
  const year = new Date().getUTCFullYear();
  const [leaveTypes, balances, requests] = await Promise.all([
    prisma.leaveType.findMany({ where: { tenantId: user.tenantId, active: true }, orderBy: [{ statutoryProtected: "desc" }, { name: "asc" }] }),
    prisma.employeeLeaveBalance.findMany({ where: { tenantId: user.tenantId, employeeId, year }, include: { leaveType: true }, orderBy: { leaveType: { name: "asc" } } }),
    prisma.leaveRequest.findMany({ where: { tenantId: user.tenantId, employeeId }, include: { leaveType: true, reviewedBy: true }, orderBy: [{ createdAt: "desc" }], take: 100 }),
  ]);
  const balanceByType = new Map(balances.map((balance) => [balance.leaveTypeId, balance]));
  const pendingByType = requests.filter((request) => request.status === LeaveRequestStatus.PENDING && request.startDate.getUTCFullYear() === year).reduce((map, request) => map.set(request.leaveTypeId, (map.get(request.leaveTypeId) ?? 0) + Number(request.requestedDays)), new Map<string, number>());

  return <>
    <PageHeader eyebrow="Employee self-service" title="Leave requests" description="File leave using your tenant’s active leave types, see protected statutory rules, and track approval status and balances." />
    <nav className="mb-6 flex gap-2 overflow-x-auto pb-2"><Link className="btn-secondary shrink-0" href="/employee/attendance">Time</Link><Link className="btn-secondary shrink-0" href="/employee/requests/overtime">Overtime</Link><Link className="btn-primary shrink-0" href="/employee/leave">Leave</Link><Link className="btn-secondary shrink-0" href="/employee/payslips">Payslips</Link><Link className="btn-secondary shrink-0" href="/employee/loans">Loans</Link></nav>

    <section className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
      <div className="card h-fit">
        <h2 className="text-lg font-black">File a leave request</h2>
        <p className="mt-1 text-sm text-slate-500">Payroll/HR will validate eligibility and evidence before approval.</p>
        <form action={submitEmployeeLeaveRequestAction} className="mt-5 space-y-4">
          <div><label className="label">Leave type</label><select className="field" name="leaveTypeId" required defaultValue=""><option value="" disabled>Select leave type</option>{leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name}{type.statutoryProtected ? " · protected" : ""}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="label">Start date</label><input className="field" type="date" name="startDate" required /></div><div><label className="label">End date</label><input className="field" type="date" name="endDate" required /></div></div>
          <div><label className="label">Reason</label><textarea className="field min-h-24" name="reason" minLength={3} maxLength={500} required /></div>
          <div><label className="label">Evidence reference (optional)</label><input className="field" name="evidenceReference" maxLength={500} placeholder="Document/certificate reference; do not enter unnecessary sensitive detail" /></div>
          <button className="btn-primary w-full">Submit leave request</button>
        </form>
      </div>

      <div className="space-y-6">
        <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {leaveTypes.filter((type) => type.requiresBalance).map((type) => {
            const balance = balanceByType.get(type.id);
            const entitlement = balance ? availableLeaveDays({ ...balance, usedDays: 0 }) : Number(type.annualEntitlementDays ?? 0);
            const used = Number(balance?.usedDays ?? 0);
            const pending = pendingByType.get(type.id) ?? 0;
            const available = Math.max(0, entitlement - used - pending);
            return <article key={type.id} className="card"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-slate-500">{year} balance</p><h2 className="mt-1 font-black">{type.name}</h2></div>{type.statutoryProtected ? <ShieldCheck className="size-5 text-pine-600" /> : <CalendarCheck2 className="size-5 text-slate-400" />}</div><p className="mt-4 text-3xl font-black text-pine-700">{available.toFixed(2)}</p><p className="text-xs text-slate-500">days available · {used.toFixed(2)} used · {pending.toFixed(2)} pending</p></article>;
          })}
          {!leaveTypes.some((type) => type.requiresBalance) && <div className="card text-sm text-slate-500">No annual balance-based leave is currently configured.</div>}
        </section>

        <section className="card">
          <h2 className="text-lg font-black">My leave requests</h2>
          <div className="mt-4 space-y-3">
            {requests.map((request) => <article key={request.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{request.leaveType.name}</h3>{request.leaveType.statutoryProtected && <span className="rounded-full bg-pine-100 px-2 py-1 text-[10px] font-black uppercase text-pine-700">Statutory protected</span>}</div><p className="mt-1 text-sm text-slate-600">{shortDate(request.startDate)} – {shortDate(request.endDate)} · {Number(request.requestedDays).toFixed(2)} day(s)</p><p className="mt-2 text-sm text-slate-500">{request.reason}</p></div><StatusBadge status={request.status} /></div>
              {request.reviewRemarks && <p className="mt-3 rounded-xl bg-white p-3 text-xs text-slate-600">Review remarks: {request.reviewRemarks}</p>}
              {request.status === LeaveRequestStatus.PENDING && <form action={cancelEmployeeLeaveRequestAction} className="mt-3"><input type="hidden" name="id" value={request.id} /><button className="btn-secondary text-xs">Cancel pending request</button></form>}
            </article>)}
            {!requests.length && <div className="py-12 text-center text-slate-500"><Clock3 className="mx-auto mb-3 size-8 text-slate-300" /><p>No leave requests yet.</p></div>}
          </div>
        </section>
      </div>
    </section>
  </>;
}
