import Link from "next/link";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return <>
    <nav aria-label="Report views" className="mb-6 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="px-2 pb-2 text-xs font-black uppercase tracking-wider text-slate-400">Reports</p>
      <div className="flex flex-wrap gap-2">
        <Link className="btn-secondary" href="/admin/reports">HOA Financial Report</Link>
        <Link className="btn-secondary" href="/admin/reports/homeowner-balances">Homeowner Monthly Dues Balance Report</Link>
        <Link className="btn-secondary" href="/admin/reports/transactions">Transaction History Report</Link>
      </div>
    </nav>
    {children}
  </>;
}
