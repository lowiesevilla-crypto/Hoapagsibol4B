import { Download, ReceiptText, Search as SearchIcon, TrendingUp, Users, WalletCards } from "lucide-react";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { requireUser } from "@/lib/auth";
import { filterHomeownerBalanceRows, paginateHomeownerBalanceRows } from "@/lib/homeowner-balance-preview";
import { getHomeownerBalanceReport } from "@/lib/services/homeowner-balance-report";
import { money } from "@/lib/utils";

type HomeownerBalanceSearchParams = {
  from?: string;
  to?: string;
  status?: string;
  search?: string;
  page?: string;
};

export default async function HomeownerBalanceReportPage({ searchParams }: { searchParams: Promise<HomeownerBalanceSearchParams> }) {
  const user = await requireUser(Role.ADMIN);
  const filters = await searchParams;
  const report = await getHomeownerBalanceReport(user.tenantId, filters.from, filters.to, filters.status ?? "ACTIVE");
  const exportQuery = new URLSearchParams({ from: report.fromText, to: report.toText, status: report.status });
  const search = (filters.search ?? "").trim();

  // Search the complete tenant-scoped report rows first, then paginate the matches.
  // This ensures a homeowner on page 2+ can still be found by a wildcard/partial search.
  const filteredRows = filterHomeownerBalanceRows(report.rows, search);
  const preview = paginateHomeownerBalanceRows(filteredRows, filters.page);
  const previewRows = preview.rows;

  const previewQuery = new URLSearchParams({ from: report.fromText, to: report.toText, status: report.status });
  if (search) previewQuery.set("search", search);
  const clearSearchQuery = new URLSearchParams({ from: report.fromText, to: report.toText, status: report.status });
  const pageHref = (page: number) => {
    const query = new URLSearchParams(previewQuery);
    query.set("page", String(page));
    return `/admin/reports/homeowner-balances?${query.toString()}`;
  };
  const pageNumbers = paginationWindow(preview.page, preview.totalPages);

  return <>
    <PageHeader
      eyebrow="Reports"
      title="Homeowner Monthly Dues Balance Report"
      description="Review tenant-scoped Monthly Dues billing, collections, payment evidence, outstanding balances, and board-level collection analytics."
      action={<a className="btn-primary" href={`/admin/reports/homeowner-balances/export?${exportQuery.toString()}`}><Download className="size-4" /> Download Excel workbook</a>}
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
        {search ? <input type="hidden" name="search" value={search} /> : null}
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
      <div className="border-b border-slate-200 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="font-black text-slate-900">Homeowner balance preview</h2><p className="text-sm text-slate-500">Payment remarks show official receipt number, payment date, amount, payment coverage, and Full Paid or Partial status per receipt/application. Accounts without a recorded payment show None Payment.</p></div>
          <p className="text-xs font-semibold text-slate-500">{report.rows.length.toLocaleString("en-PH")} homeowner(s) in current tenant/status scope</p>
        </div>

        <form action="/admin/reports/homeowner-balances" method="get" className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
          <input type="hidden" name="from" value={report.fromText} />
          <input type="hidden" name="to" value={report.toText} />
          <input type="hidden" name="status" value={report.status} />
          <div className="relative min-w-0 flex-1">
            <SearchIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Search homeowners by name, block, or lot"
              autoComplete="off"
              className="field pl-9"
              defaultValue={search}
              name="search"
              placeholder="Search name, Block 12, Lot 5, or Block 12 Lot 5"
              type="search"
            />
          </div>
          <button className="btn-primary lg:w-auto" type="submit"><SearchIcon className="size-4" /> Search</button>
          {search ? <a className="btn-secondary lg:w-auto" href={`/admin/reports/homeowner-balances?${clearSearchQuery.toString()}`}>Clear search</a> : null}
        </form>
        <p className="mt-2 text-xs text-slate-500">Wildcard/partial search scans every homeowner in the authenticated tenant matching the selected status before pagination. Search by homeowner name, account number, block, lot, or a combination such as “Block 12 Lot 5”.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1200px] w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Homeowner</th><th className="px-4 py-3">Block / Lot</th><th className="px-4 py-3 text-right">Monthly Due</th><th className="px-4 py-3 text-right">Total Bill</th><th className="px-4 py-3 text-right">Total Paid</th><th className="px-4 py-3 text-right">Current Balance</th><th className="px-4 py-3">Standing</th><th className="px-4 py-3">Remarks / Payment Details</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {previewRows.map((row) => <tr key={row.homeownerId} className="align-top"><td className="px-4 py-3"><p className="font-bold text-slate-900">{row.homeownerName}</p><p className="text-xs text-slate-500">{row.accountNumber}</p></td><td className="px-4 py-3">Block {row.block}, Lot {row.lot}</td><td className="px-4 py-3 text-right">{money(row.monthlyDuesAmount)}</td><td className="px-4 py-3 text-right">{money(row.totalBill)}</td><td className="px-4 py-3 text-right">{money(row.totalPaid)}</td><td className="px-4 py-3 text-right font-bold">{money(row.currentBalance)}</td><td className="px-4 py-3 font-semibold">{standingLabel(row.paymentStanding)}</td><td className="max-w-xl whitespace-pre-line px-4 py-3 text-xs leading-5 text-slate-600">{row.remarks}</td></tr>)}
            {previewRows.length === 0 ? <tr><td className="px-4 py-10 text-center text-sm font-semibold text-slate-500" colSpan={8}>No homeowner matched “{search}” in the current tenant/status scope.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <p className="text-xs font-semibold text-slate-500">
          {preview.totalRows === 0 ? "0 matching homeowners" : `Showing ${preview.startIndex.toLocaleString("en-PH")}–${preview.endIndex.toLocaleString("en-PH")} of ${preview.totalRows.toLocaleString("en-PH")} matching homeowner(s)`}
          {search ? ` for “${search}”` : ""}. Search is applied to all {report.rows.length.toLocaleString("en-PH")} homeowner(s) in the current tenant/status scope.
        </p>
        {preview.totalRows > 0 && preview.totalPages > 1 ? <nav aria-label="Homeowner balance preview pagination" className="flex flex-wrap items-center gap-1">
          {preview.page > 1 ? <a className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50" href={pageHref(preview.page - 1)}>Previous</a> : <span aria-disabled="true" className="rounded-lg border border-slate-100 px-3 py-2 text-xs font-bold text-slate-300">Previous</span>}
          {pageNumbers.map((pageNumber) => pageNumber === preview.page
            ? <span aria-current="page" className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white" key={pageNumber}>{pageNumber}</span>
            : <a className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50" href={pageHref(pageNumber)} key={pageNumber}>{pageNumber}</a>)}
          {preview.page < preview.totalPages ? <a className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50" href={pageHref(preview.page + 1)}>Next</a> : <span aria-disabled="true" className="rounded-lg border border-slate-100 px-3 py-2 text-xs font-bold text-slate-300">Next</span>}
        </nav> : null}
      </div>
    </section>
  </>;
}

function paginationWindow(currentPage: number, totalPages: number) {
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
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
