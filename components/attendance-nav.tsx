import Link from "next/link";

const links = [
  ["/admin/attendance", "Dashboard"],
  ["/admin/attendance/add", "Add record"],
  ["/admin/attendance/history", "Attendance history"],
  ["/admin/attendance/corrections/approval", "Correction approvals"],
  ["/admin/attendance/review", "Payroll review"],
] as const;

export function AttendanceNav({ current }: { current: string }) {
  return <nav className="mb-6 flex max-w-full gap-2 overflow-x-auto pb-2" aria-label="Attendance sections">
    {links.map(([href, label]) => <Link key={href} href={href} className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-bold ${current === href ? "border-pine-500 bg-pine-50 text-pine-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</Link>)}
  </nav>;
}
