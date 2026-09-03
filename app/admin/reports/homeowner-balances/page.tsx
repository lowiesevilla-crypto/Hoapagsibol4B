import { Download, ReceiptText, TrendingUp, Users, WalletCards } from "lucide-react";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { requireUser } from "@/lib/auth";
import { getHomeownerBalanceReport } from "@/lib/services/homeowner-balance-report";
import { money } from "@/lib/utils";

export default async function HomeownerBalanceReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; status?: string }> }) {
  const user = await requireUser(Role.ADMIN);
  const filters = await searchParams;
  const report = await getHomeownerBalanceReport(user.tenantId, filters.from, filters.to, filters.status ?? "ACTIVE");
  const query = `from=${report.fromText}&to=${report.toText}&status=${report.status}`;
  const previewRows = report.rows.slice(0, 100);

  return <>
    <PageHeader
      eyebrow="Reports"
      title="Homeowner Monthly Dues Balance Report"
      description="Review tenant-scoped Monthly Dues billing, collections, payment evidence, outstanding balances, and board-level collection analytics."
      action={<a className="btn-primary" href={`/admin/reports/homeowner-balances/export?${query}`}><Download className="size-4" /> Download Excel workbook</a>}
    />

    <section className="card mb-6">
      <div className="mb-4">
        <h2 className="font-black text-slate-900">Report parameters</h2>
        <p className="text-sm text-slate-500">Active homeowners are selected by default. The downloaded workbook contains all homeowners matching this tenant and filter, including tenants above 5,000 homeowners.</p>
      </div>
      <form className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <div><label className="label">From</label><input className="field" name="from" type="date" defaultValue={report.fromText} required /></div>
        <div><label className="label">To</label><input className="field" name="to" type="date" defaultValue={report.toText} required /></div>
        <div><label className="label">Homeowner status</label><select className="field" name="status" defaultValue={report.status}><option value="ACTIVE">Active homeowners only</option><option value="INACTIVE">Inactive homeowners only</option><option value="ALL">Active and inactive</option></select></div>
        <button className="btn-primary w-full sm:w-auto">Generate report</button>
      </form>
    </section>

    <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard label="Homeowners" value={String(report.analytics.homeowners)} note="Matching report scope" icon={Users} />
      <StatCard label="Total billed" value={money(report.analytics.totalBill)} note="Monthly Dues in period" icon={ReceiptText} />
      <StatCard label="Total paid" value={money(report.analytics.totalPaid)} note="Recorded against Monthly Dues" icon={WalletCards} />
      <StatCard label="Current balance" value={money(report.analytics.currentBalance)} note="Outstanding Monthly Dues" icon={WalletCards} />
      <StatCard label="Collection rate" value={`${report.analytics.collectionRatePct.toFixed(2)}%`} note="Paid divided by billed" icon={TrendingUp} />
    </section>

    <section className="card mb-6">
      <div className="mb-4">
        <h2 className="font-black text-slate-900">Payment standing analytics</h2>
        <p className="text-sm text-slate-500">Quick collection status for HOA Board and administration review.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Full Paid" value={report.analytics.fullyPaidHomeowners} />
        <Metric label="Partial" value={report.analytics.partialHomeowners} />
        <Metric label="None Payment" value={report.analytics.nonePaymentHomeowners} />
        <Metric label="No Monthly Dues Bill" value={report.analytics.noBillHomeowners} />
      </div>
      <p className="mt-4 text-sm text-slate-600">The Excel workbook includes a second <strong>Summary &amp; Analytics</strong> sheet with executive summary, KPIs, payment standing, block-level collection analytics, top outstanding accounts, and board-review highlights.</p>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div><h2 className="font-black text-slate-900">Homeowner balance preview</h2><p className="text-sm text-slate-500">Payment remarks show official receipt number, payment date, amount, payment coverage, and Full Paid or Partial status per receipt/application. Accounts without a recorded payment show None Payment.</p></div>
        {report.rows.length > previewRows.length ? <p className="text-xs font-semibold text-slate-500">Previewing 100 of {report.rows.length}; workbook contains all rows.</p> : <p className="text-xs font-semibold text-slate-500">{report.rows.length} homeowner(s)</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1200px] w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Homeowner</th><th className="px-4 py-3">Block / Lot</th><th className="px-4 py-3 text-right">Monthly Due</th><th className="px-4 py-3 text-right">Total Bill</th><th className="px-4 py-3 text-right">Total Paid</th><th className="px-4 py-3 text-right">Current Balance</th><th className="px-4 py-3">Standing</th><th className="px-4 py-3">Remarks / Payment Details</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{previewRows.map((row) => <tr key={row.homeownerId} className="align-top"><td className="px-4 py-3"><p className="font-bold text-slate-900">{row.homeownerName}</p><p className="text-xs text-slate-500">{row.accountNumber}</p></td><td className="px-4 py-3">Block {row.block}, Lot {row.lot}</td><td className="px-4 py-3 text-right">{money(row.monthlyDuesAmount)}</td><td className="px-4 py-3 text-right">{money(row.totalBill)}</td><td className="px-4 py-3 text-right">{money(row.totalPaid)}</td><td className="px-4 py-3 text-right font-bold">{money(row.currentBalance)}</td><td className="px-4 py-3 font-semibold">{standingLabel(row.paymentStanding)}</td><td className="max-w-xl whitespace-pre-line px-4 py-3 text-xs leading-5 text-slate-600">{row.remarks}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  </>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-900">{value.toLocaleString("en-PH")}</p></div>;
}

function standingLabel(standing: "FULL_PAID" | "PARTIAL" | "NONE_PAYMENT" | "NO_BILL") {
  if (standing === "FULL_PAID") return "Full Paid";
  if (standing === "PARTIAL") return "Partial";
  if (standing === "NONE_PAYMENT") return "None Payment";
  return "No Monthly Dues Bill";
}
