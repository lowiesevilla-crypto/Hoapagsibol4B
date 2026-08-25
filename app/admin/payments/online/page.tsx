import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PaymentsNav } from "@/components/payments-nav";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import {
  getTenantPayMongoOnlineReport,
  type PayMongoOnlineReportQuery,
} from "@/lib/services/paymongo-online-report";
import { money, shortDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const toneClass = {
  success: "bg-emerald-100 text-emerald-800",
  info: "bg-blue-100 text-blue-800",
  warning: "bg-amber-100 text-amber-900",
  danger: "bg-rose-100 text-rose-800",
  default: "bg-slate-100 text-slate-700",
};

function reportHref(query: PayMongoOnlineReportQuery, page: number) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.finance && query.finance !== "ALL") params.set("finance", query.finance);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.pageSize) params.set("pageSize", query.pageSize);
  params.set("page", String(page));
  return `/admin/payments/online?${params.toString()}`;
}

export default async function OnlinePaymentStatusPage({ searchParams }: { searchParams: Promise<PayMongoOnlineReportQuery> }) {
  const admin = await requirePermission(Permission.PAYMENTS_MANAGE);
  const query = await searchParams;
  const report = await getTenantPayMongoOnlineReport({ tenantId: admin.tenantId, query });
  const firstRow = report.total ? ((report.page - 1) * report.pageSize) + 1 : 0;
  const lastRow = report.total ? Math.min(report.page * report.pageSize, report.total) : 0;

  return <>
    <PageHeader
      eyebrow="Payments · PayMongo"
      title="Online payment status"
      description="Search and review tenant-scoped PayMongo checkout state, HOAHub finance reconciliation, and settlement evidence. Results are server-paginated for large payment histories."
    />
    <PaymentsNav />

    <section className="card mb-6 border-blue-100 bg-blue-50/50">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><p className="text-xs font-black uppercase tracking-wider text-slate-500">Tracked attempts</p><p className="mt-1 text-2xl font-black text-ink">{report.summary.tracked}</p></div>
        <div><p className="text-xs font-black uppercase tracking-wider text-slate-500">Reconciled</p><p className="mt-1 text-2xl font-black text-emerald-700">{report.summary.reconciled}</p></div>
        <div><p className="text-xs font-black uppercase tracking-wider text-slate-500">Open / not posted</p><p className="mt-1 text-2xl font-black text-amber-700">{report.summary.open}</p></div>
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-600">The list reconciles only the current result page against PayMongo instead of loading an unbounded transaction history. Settlement detail remains read-only and tenant-scoped.</p>
    </section>

    <form action="/admin/payments/online" className="card mb-6 grid gap-3 lg:grid-cols-[minmax(16rem,2fr)_minmax(12rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_8rem_auto]">
      <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
        Search
        <input className="field normal-case tracking-normal" type="search" name="q" defaultValue={query.q || ""} placeholder="Homeowner, block, lot, reference or request ID" />
      </label>
      <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
        Finance status
        <select className="field normal-case tracking-normal" name="finance" defaultValue={query.finance || "ALL"}>
          <option value="ALL">All statuses</option>
          <option value="RECONCILED">Posted & reconciled</option>
          <option value="NOT_POSTED">Not posted</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
        From
        <input className="field normal-case tracking-normal" type="date" name="from" defaultValue={query.from || ""} />
      </label>
      <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
        To
        <input className="field normal-case tracking-normal" type="date" name="to" defaultValue={query.to || ""} />
      </label>
      <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
        Rows
        <select className="field normal-case tracking-normal" name="pageSize" defaultValue={query.pageSize || "25"}>
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
      </label>
      <div className="flex items-end gap-2">
        <button className="btn-primary min-h-11 whitespace-nowrap" type="submit">Search / Filter</button>
        <Link className="btn-secondary min-h-11 whitespace-nowrap" href="/admin/payments/online">Clear</Link>
      </div>
    </form>

    <section className="card p-0 overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-black text-ink">PayMongo payment report</h2><p className="text-xs text-slate-500">Showing {firstRow}-{lastRow} of {report.total} matching attempt(s).</p></div>
        <p className="text-xs font-bold text-slate-500">Page {report.page} of {report.totalPages}</p>
      </div>

      {report.items.length === 0 ? <div className="px-6 py-14 text-center"><p className="font-black text-ink">No online payments match these filters.</p><p className="mt-1 text-sm text-slate-500">Clear the filters or change the date/status criteria.</p></div> : <div className="max-h-[70vh] overflow-auto">
        <table className="data-table min-w-[1050px]">
          <thead className="sticky top-0 z-10 bg-white shadow-sm"><tr><th>Homeowner</th><th>Reference</th><th className="text-right">Amount</th><th>Gateway status</th><th>Finance</th><th>Created</th><th>Settlement</th></tr></thead>
          <tbody>{report.items.map((payment) => <tr key={payment.requestId} className="odd:bg-white even:bg-slate-50/60">
            <td><p className="font-bold text-ink">{payment.homeownerName}</p><p className="text-xs text-slate-500">{payment.property}</p></td>
            <td><p className="max-w-64 break-all font-mono text-xs">{payment.referenceNumber}</p><p className="mt-1 max-w-64 break-all font-mono text-[10px] text-slate-400">{payment.requestId}</p></td>
            <td className="text-right font-black tabular-nums">{money(payment.amount)}</td>
            <td><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black ${toneClass[payment.tone]}`}>{payment.label}</span></td>
            <td><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black ${payment.financeStatus === "RECONCILED" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{payment.financeStatus === "RECONCILED" ? "Posted & reconciled" : "Not posted"}</span></td>
            <td className="whitespace-nowrap">{shortDate(new Date(payment.createdAt))}</td>
            <td><Link className="btn-secondary min-h-9 whitespace-nowrap px-3 py-1.5" href={`/admin/payments/online/${encodeURIComponent(payment.requestId)}`}>Trace settlement</Link></td>
          </tr>)}</tbody>
        </table>
      </div>}

      <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold text-slate-500">Maximum 100 rows per page to keep large tenant histories responsive.</p>
        <div className="flex items-center gap-2">
          {report.page > 1 ? <Link className="btn-secondary min-h-9 px-3 py-1.5" href={reportHref(query, report.page - 1)}>Previous</Link> : <span className="btn-secondary min-h-9 cursor-not-allowed px-3 py-1.5 opacity-50">Previous</span>}
          <span className="px-2 text-sm font-black text-ink">{report.page} / {report.totalPages}</span>
          {report.page < report.totalPages ? <Link className="btn-secondary min-h-9 px-3 py-1.5" href={reportHref(query, report.page + 1)}>Next</Link> : <span className="btn-secondary min-h-9 cursor-not-allowed px-3 py-1.5 opacity-50">Next</span>}
        </div>
      </div>
    </section>
  </>;
}
