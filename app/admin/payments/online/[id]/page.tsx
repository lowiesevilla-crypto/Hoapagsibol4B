import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, CircleDollarSign, Landmark, Route } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import {
  getTenantPayMongoSettlementTrace,
  type SettlementPayoutTrace,
} from "@/lib/services/paymongo-settlement-trace";
import { money, shortDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusTone: Record<string, string> = {
  VERIFIED: "bg-emerald-100 text-emerald-800",
  RECORDED: "bg-blue-100 text-blue-800",
  DEPOSITED: "bg-emerald-100 text-emerald-800",
  RECONCILED: "bg-emerald-100 text-emerald-800",
  IN_TRANSIT: "bg-blue-100 text-blue-800",
  AWAITING_PAYOUT: "bg-amber-100 text-amber-900",
  PENDING: "bg-amber-100 text-amber-900",
  ON_HOLD: "bg-amber-100 text-amber-900",
  NOT_APPLICABLE: "bg-slate-100 text-slate-700",
  NOT_POSTED: "bg-amber-100 text-amber-900",
  RETURNED: "bg-rose-100 text-rose-800",
  CANCELLED: "bg-slate-100 text-slate-700",
  MISMATCH: "bg-rose-100 text-rose-800",
  NOT_CONFIGURED: "bg-rose-100 text-rose-800",
  UNAVAILABLE: "bg-slate-100 text-slate-700",
};

function Badge({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${statusTone[value] || "bg-slate-100 text-slate-700"}`}>{value.replaceAll("_", " ")}</span>;
}

function IdValue({ value }: { value: string | null }) {
  return <span className="break-all font-mono text-xs text-slate-700">{value || "Not available"}</span>;
}

function PayoutCard({ title, description, payout }: { title: string; description: string; payout: SettlementPayoutTrace }) {
  return <section className="card h-full">
    <div className="flex items-start justify-between gap-3">
      <div><h2 className="font-black text-ink">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{description}</p></div>
      <Badge value={payout.status} />
    </div>
    <dl className="mt-5 grid gap-4 sm:grid-cols-2">
      <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">Payout ID</dt><dd className="mt-1"><IdValue value={payout.payoutId} /></dd></div>
      <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">Split transaction</dt><dd className="mt-1"><IdValue value={payout.transactionId} /></dd></div>
      <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">Matched gross</dt><dd className="mt-1 font-black tabular-nums">{payout.grossAmount === null ? "Not available" : money(payout.grossAmount)}</dd></div>
      <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">Matched net</dt><dd className="mt-1 font-black tabular-nums">{payout.netAmount === null ? "Not available" : money(payout.netAmount)}</dd></div>
      <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">Expected / status date</dt><dd className="mt-1 font-semibold">{payout.expectedAt ? shortDate(new Date(payout.expectedAt)) : "Not available"}</dd></div>
      <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">Provider</dt><dd className="mt-1 font-semibold">{payout.provider || "Not available"}</dd></div>
    </dl>
    {payout.scheduleAmount !== null && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
      Next account payout estimate: <b>{money(payout.scheduleAmount)}</b>{payout.scheduleTransactionCount !== null ? ` across ${payout.scheduleTransactionCount} transaction(s)` : ""}{payout.scheduleType ? ` · ${payout.scheduleType} schedule` : ""}.
    </div>}
    <p className="mt-4 text-xs leading-5 text-slate-500">{payout.note}</p>
  </section>;
}

export default async function PayMongoSettlementTracePage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission(Permission.PAYMENTS_MANAGE);
  const { id } = await params;
  const trace = await getTenantPayMongoSettlementTrace({ tenantId: admin.tenantId, requestId: id });
  if (!trace) notFound();

  return <>
    <PageHeader
      eyebrow="Payments · PayMongo · Settlement"
      title="Settlement trace"
      description="Read-only provider and HOAHub evidence for one tenant-scoped homeowner checkout. This page never initiates, changes, refunds, or releases money."
      action={<Link className="btn-secondary" href="/admin/payments/online"><ArrowLeft className="size-4" /> Online payment status</Link>}
    />

    <section className="card mb-6 border-blue-100 bg-blue-50/50">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-wider text-blue-700">{trace.referenceNumber}</p><h2 className="mt-1 text-xl font-black text-ink">{trace.homeownerName}</h2><p className="mt-1 text-sm text-slate-600">{trace.property} · Created {shortDate(new Date(trace.createdAt))}</p></div>
        <div className="flex flex-wrap gap-2"><Badge value={trace.gatewayStatus} /><Badge value={trace.financeStatus} />{trace.liveMode !== null && <Badge value={trace.liveMode ? "LIVE MODE" : "TEST MODE"} />}</div>
      </div>
      {!trace.providerAvailable && <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">The live Checkout resource is temporarily unavailable. HOAHub audit snapshots remain visible, but provider-returned routing and payout evidence may be incomplete.</p>}
    </section>

    <div className="mb-6 grid gap-5 lg:grid-cols-2">
      <section className="card">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-blue-100 text-blue-700"><CircleDollarSign className="size-5" /></span><div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Gateway identity</p><h2 className="font-black text-ink">Checkout and payment</h2></div></div>
        <dl className="mt-5 grid gap-4">
          <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">Checkout Session ID</dt><dd className="mt-1"><IdValue value={trace.checkoutId} /></dd></div>
          <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">Original Payment ID</dt><dd className="mt-1"><IdValue value={trace.gatewayPaymentId} /></dd></div>
          <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">Paid at</dt><dd className="mt-1 font-semibold">{trace.paidAt ? shortDate(new Date(trace.paidAt)) : "Not paid or unavailable"}</dd></div>
        </dl>
      </section>

      <section className="card">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><Route className="size-5" /></span><div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Split routing</p><h2 className="font-black text-ink">Tenant and platform recipients</h2></div></div>
        <div className="mt-5 flex items-center justify-between gap-3"><span className="text-sm font-bold text-slate-600">Routing evidence</span><Badge value={trace.routing.status} /></div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">Tenant child</dt><dd className="mt-1 font-mono text-xs text-slate-700">{trace.routing.childAccount}</dd></div>
          <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">Platform parent</dt><dd className="mt-1 font-mono text-xs text-slate-700">{trace.routing.parentAccount || "Not configured"}</dd></div>
        </dl>
        <p className="mt-4 text-xs leading-5 text-slate-500">{trace.routing.note}</p>
      </section>
    </div>

    <section className="card mb-6">
      <h2 className="font-black text-ink">Money allocation</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">The HOA principal and HOAHub fee remain separate. PayMongo processing fees are reported independently when the Checkout snapshot provides them.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-400">HOA principal</p><p className="mt-2 text-2xl font-black tabular-nums text-ink">{money(trace.amounts.hoaPrincipal)}</p><p className="mt-1 text-xs text-slate-500">Expected for the tenant child</p></div>
        <div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-400">HOAHub fee</p><p className="mt-2 text-2xl font-black tabular-nums text-blue-700">{money(trace.amounts.platformConvenienceFee)}</p><p className="mt-1 text-xs text-slate-500">Expected for the platform parent</p></div>
        <div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Processing fee</p><p className="mt-2 text-2xl font-black tabular-nums text-amber-700">{money(trace.amounts.processingFee)}</p><p className="mt-1 text-xs text-slate-500">PayMongo provider fee</p></div>
        <div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Customer paid</p><p className="mt-2 text-2xl font-black tabular-nums text-emerald-700">{money(trace.amounts.totalCustomerPaid)}</p><p className="mt-1 text-xs text-slate-500">Verified or snapshotted total</p></div>
      </div>
    </section>

    <div className="grid gap-5 xl:grid-cols-2">
      <PayoutCard title="HOAHub fee payout" description="Parent/platform settlement for the fixed convenience fee." payout={trace.parentPayout} />
      <PayoutCard title="HOA principal payout" description="Tenant child-account settlement for the homeowner's HOA payment." payout={trace.childPayout} />
    </div>

    <section className="mt-6 grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><Building2 className="mb-2 size-5" /><b>Where to confirm the tenant principal:</b> PayMongo Dashboard → Linked Accounts → Child payouts. Upcoming account schedules are aggregate estimates until a payout is generated.</div>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950"><Landmark className="mb-2 size-5" /><b>Where to confirm the platform fee:</b> PayMongo Dashboard → Payouts. Open a generated payout and find the matching Original Payment ID in its Split payment transaction log.</div>
    </section>
  </>;
}
