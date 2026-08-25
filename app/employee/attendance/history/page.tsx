import { StandardTable } from "@/components/standard-table";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shortDate } from "@/lib/utils";

export default async function EmployeeAttendanceHistoryPage() {
  const user = await requireUser();
  if (!user.employeeProfile) throw new Error("Employee profile not linked.");
  const [records, requests] = await Promise.all([
    prisma.attendance.findMany({ where: { employeeId: user.employeeProfile.id }, orderBy: { date: "desc" }, take: 180 }),
    prisma.attendanceAdjustment.findMany({ where: { attendance: { employeeId: user.employeeProfile.id } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return <>
    <PageHeader eyebrow="Employee attendance" title="My attendance history" description="Your attendance records and correction request status in one read-only history view." />
    <nav className="mb-6 flex gap-2 overflow-x-auto pb-2"><Link className="btn-secondary shrink-0" href="/employee/attendance">Clock in / out</Link><Link className="btn-secondary shrink-0" href="/employee/attendance/correction">Request correction</Link><Link className="btn-primary shrink-0" href="/employee/attendance/history">My history</Link></nav>
    <section className="card mb-6"><h2 className="text-lg font-black">Attendance records</h2><StandardTable><div className="mt-4 table-wrap shadow-none"><table className="data-table"><thead><tr><th>Date</th><th>Status</th><th>Time</th><th>Total</th><th>Late / undertime</th><th>Remarks</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td>{shortDate(record.date)}</td><td><StatusBadge status={record.status} /></td><td>{record.timeIn || "-"} - {record.timeOut || "-"}</td><td>{String(record.totalHours)} hrs</td><td>{record.lateMinutes}m / {record.undertimeMinutes}m</td><td>{record.remarks || "-"}</td></tr>)}</tbody></table></div></StandardTable></section>
    <section className="card"><h2 className="text-lg font-black">Correction request history</h2><StandardTable><div className="mt-4 table-wrap shadow-none"><table className="data-table"><thead><tr><th>Requested</th><th>Attendance date</th><th>Reason</th><th>Status</th><th>Reviewed</th></tr></thead><tbody>{requests.map((item) => <tr key={item.id}><td>{shortDate(item.createdAt)}</td><td>{shortDate((item.originalData as Record<string, string>).date || item.createdAt)}</td><td>{item.reason}</td><td><StatusBadge status={item.status} /></td><td>{item.reviewedAt ? shortDate(item.reviewedAt) : "Pending"}</td></tr>)}{!requests.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">No correction requests yet.</td></tr>}</tbody></table></div></StandardTable></section>
  </>;
}
