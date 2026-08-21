import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { reconcileRecentTenantPayMongoPayments } from "@/lib/services/homeowner-paymongo-reconciliation";
import { formatCurrency, shortDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const toneClass = {
  success: "bg-emerald-100 text-emerald-800",
  info: "bg-blue-100 text-blue-800",
  warning: "bg-amber-100 text-amber-900",
  danger: "bg-rose-100 text-rose-800",
  default: "bg-slate-100 text-slate-700",
};

export default async function OnlinePaymentStatusPage() {
  const admin = await requirePermission(Permission.PAYMENTS_MANAGE);
  const payments = await reconcileRecentTenantPayMongoPayments({ tenantId: admin.tenantId, limit: 30 });

  return <>
    <PageHeader
      eyebrow="Payments · PayMongo"
      title="Online payment status"
      description="Server-verified PayMongo checkout state and HOAHub finance reconciliation. Paid transactions are posted automatically through the normal receipt and ledger workflow; browser redirects never post money."
    />

    <section className="card mb-6 border-blue-100 bg-blue-50/50">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><p className="text-xs font-black uppercase tracking-wider text-slate-500">Tracked attempts</p><p className="mt-1 text-2xl font-black text-ink">{payments.length}</p></div>
        <div><p className="text-xs font-black uppercase tracking-wider text-slate-500">Reconciled</p><p className="mt-1 text-2xl font-black text-emerald-700">{payments.filter((row) => row.financeStatus === "RECONCILED").length}</p></div>
        <div><p className="text-xs font-black uppercase tracking-wider text-slate-500">Open / not posted</p><p className="mt-1 text-2xl font-black text-amber-700">{payments.filter((row) => row.financeStatus !== "RECONCILED").length}</p></div>
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-600">Failed PayMongo attempts remain retryable while their Checkout Session is active. Expired or homeowner-cancelled sessions remain not posted. Only a verified paid Payment resource can become an HOAHub receipt/payment.</p>
    </section>

    {payments.length === 0 ? <section className="card text-center"><p className="font-black text-ink">No PayMongo homeowner attempts yet.</p><p className="mt-1 text-sm text-slate-500">Online payment attempts will appear here after homeowners start checkout.</p></section> : <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Homeowner</th><th>Reference</th><th>Amount</th><th>Gateway status</th><th>Finance</th><th>Created</th></tr></thead>
        <tbody>{payments.map((payment) => <tr key={payment.requestId}>
          <td><p className="font-bold text-ink">{payment.homeownerName}</p><p className="text-xs text-slate-500">{payment.property}</p></td>
          <td className="font-mono text-xs">{payment.referenceNumber}</td>
          <td className="font-bold tabular-nums">{formatCurrency(payment.amount)}</td>
          <td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${toneClass[payment.tone]}`}>{payment.label}</span></td>
          <td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${payment.financeStatus === "RECONCILED" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{payment.financeStatus === "RECONCILED" ? "Posted & reconciled" : "Not posted"}</span></td>
          <td>{shortDate(new Date(payment.createdAt))}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </>;
}
