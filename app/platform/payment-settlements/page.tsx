import { CircleDollarSign, Clock3, Landmark, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { WorkspaceCard } from "@/components/ui/workspace-card";
import {
  getPlatformPaymentSettlements,
  type PlatformSettlementStage,
} from "@/lib/services/platform-payment-settlements";

export const dynamic = "force-dynamic";

const STAGES: PlatformSettlementStage[] = [
  "Clearing",
  "Available / awaiting payout",
  "Payout pending",
  "In transit",
  "Deposited",
  "Payout on hold",
  "Payout returned",
  "Payout cancelled",
  "Payment confirmed",
  "Verification unavailable",
];

function money(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function timestamp(value: Date | null) {
  if (!value) return "—";
  return value.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

function stageTone(stage: PlatformSettlementStage): StatusTone {
  if (stage === "Deposited") return "success";
  if (stage === "Payout returned" || stage === "Payout cancelled" || stage === "Verification unavailable") return "critical";
  if (stage === "Payout on hold" || stage === "Available / awaiting payout") return "warning";
  if (stage === "Payout pending" || stage === "In transit") return "ai";
  if (stage === "Clearing" || stage === "Payment confirmed") return "info";
  return "neutral";
}

function shortId(value: string) {
  if (!value) return "—";
  return value.length > 24 ? `${value.slice(0, 13)}…${value.slice(-8)}` : value;
}

export default async function PlatformPaymentSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string }>;
}) {
  const query = await searchParams;
  const q = String(query.q || "").trim().toLowerCase();
  const stage = STAGES.includes(query.stage as PlatformSettlementStage)
    ? query.stage as PlatformSettlementStage
    : undefined;
  const settlement = await getPlatformPaymentSettlements();
  const rows = settlement.rows.filter((row) => {
    if (stage && row.stage !== stage) return false;
    if (!q) return true;
    return [
      row.tenantName,
      row.tenantId,
      row.gatewayPaymentId,
      row.checkoutId,
      row.linkedAccountId,
      row.payoutId,
      row.payoutReferenceNumber,
      row.splitTransactionId,
      row.stage,
    ].some((value) => value.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Payments & Settlement"
        title="HOAHub Payment Settlements"
        description="Live reconciliation of homeowner PayMongo convenience-fee splits against the HOAHub parent account payout lifecycle. This view does not create transfers or alter financial records."
        context={<><StatusBadge tone="ai">Live PayMongo reconciliation</StatusBadge><StatusBadge tone="info">Read only</StatusBadge></>}
        actions={<div className="flex flex-wrap gap-2"><Link className="btn-secondary inline-flex items-center gap-2" href="/platform/payment-settlements"><RefreshCw className="size-4" /> Refresh</Link><Link className="btn-secondary" href="/platform/audit">Platform audit</Link></div>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Tracked HOAHub fees"
          value={money(settlement.metrics.trackedFeePesos)}
          note={`${settlement.metrics.trackedCount} confirmed split payment${settlement.metrics.trackedCount === 1 ? "" : "s"}`}
          icon={CircleDollarSign}
          tone="blue"
        />
        <MetricCard
          label="Clearing / awaiting payout"
          value={settlement.metrics.clearingCount + settlement.metrics.awaitingPayoutCount}
          note={`${settlement.metrics.clearingCount} clearing · ${settlement.metrics.awaitingPayoutCount} ready or awaiting payout`}
          icon={Clock3}
          tone={(settlement.metrics.clearingCount + settlement.metrics.awaitingPayoutCount) > 0 ? "amber" : "green"}
        />
        <MetricCard
          label="Payout in progress"
          value={settlement.metrics.payoutInProgressCount}
          note="Pending, in transit, or on hold"
          icon={Landmark}
          tone={settlement.metrics.payoutInProgressCount ? "violet" : "neutral"}
        />
        <MetricCard
          label="Deposited"
          value={settlement.metrics.depositedCount}
          note={settlement.metrics.attentionCount ? `${settlement.metrics.attentionCount} item(s) need attention` : "No returned, cancelled, or unavailable items"}
          icon={ShieldCheck}
          tone={settlement.metrics.attentionCount ? "red" : "green"}
        />
      </section>

      {settlement.serviceError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          <p className="font-black">PayMongo reconciliation is partially unavailable.</p>
          <p className="mt-1 break-words text-xs leading-5">{settlement.serviceError}</p>
          <p className="mt-1 text-xs">HOAHub audit evidence remains visible below; no fallback transfer is attempted.</p>
        </div>
      ) : null}

      <WorkspaceCard
        title="Convenience-fee settlement register"
        description={`Parent account ${settlement.parentAccountId || "not configured"} · refreshed ${timestamp(settlement.fetchedAt)}. Payment availability indicates clearing; a matched parent payout split transaction is the settlement evidence for the HOAHub fee.`}
        action={<StatusBadge tone={settlement.metrics.attentionCount ? "warning" : "success"}>{settlement.metrics.attentionCount ? "Review attention items" : "Reconciliation active"}</StatusBadge>}
      >
        <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_280px_auto]">
          <input className="field" name="q" defaultValue={query.q || ""} placeholder="Search tenant, payment, payout, or split ID" />
          <select className="field" name="stage" defaultValue={stage || ""}>
            <option value="">All settlement stages</option>
            {STAGES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <button className="btn-secondary">Filter</button>
        </form>

        <div className="mt-5 hidden max-h-[68vh] overflow-auto rounded-2xl border border-slate-200 md:block">
          <table className="min-w-[1260px] w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface-subtle text-left">
              <tr>
                <th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Confirmed</th>
                <th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Tenant</th>
                <th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">PayMongo payment</th>
                <th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">HOAHub fee</th>
                <th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Availability</th>
                <th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Settlement stage</th>
                <th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Parent payout</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.auditId} className="border-t border-slate-100 align-top">
                  <td className="p-4 whitespace-nowrap text-xs font-semibold text-slate-500">{timestamp(row.confirmedAt)}</td>
                  <td className="p-4">
                    <p className="font-black text-slate-900">{row.tenantName}</p>
                    <p className="mt-1 max-w-48 truncate font-mono text-[10px] text-slate-400">{row.linkedAccountId}</p>
                  </td>
                  <td className="p-4">
                    <p className="font-mono text-xs font-bold text-slate-800" title={row.gatewayPaymentId}>{shortId(row.gatewayPaymentId)}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.paymentSourceType || "online"}{row.paymentStatus ? ` · ${row.paymentStatus}` : ""}</p>
                  </td>
                  <td className="p-4 whitespace-nowrap font-black text-slate-900">{money(row.feeAmountPesos)}</td>
                  <td className="p-4">
                    <p className="text-xs font-bold text-slate-700">Available: {timestamp(row.availableAt)}</p>
                    <p className="mt-1 text-xs text-slate-500">Credited: {timestamp(row.creditedAt)}</p>
                  </td>
                  <td className="p-4">
                    <StatusBadge tone={stageTone(row.stage)}>{row.stage}</StatusBadge>
                    {row.reconciliationError ? <p className="mt-2 max-w-64 break-words text-[11px] leading-4 text-status-critical">{row.reconciliationError}</p> : null}
                  </td>
                  <td className="p-4">
                    {row.payoutId ? <>
                      <p className="font-mono text-xs font-bold text-slate-800" title={row.payoutId}>{shortId(row.payoutId)}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.payoutStatus || "payout"} · {timestamp(row.payoutStatusUpdatedAt)}</p>
                      {row.splitTransactionId ? <p className="mt-1 max-w-56 truncate font-mono text-[10px] text-slate-400" title={row.splitTransactionId}>split: {row.splitTransactionId}</p> : null}
                      {row.payoutReferenceNumber ? <p className="mt-1 max-w-56 truncate text-[10px] text-slate-400" title={row.payoutReferenceNumber}>ref: {row.payoutReferenceNumber}</p> : null}
                    </> : <span className="text-xs font-semibold text-slate-400">No parent payout matched yet</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid gap-3 md:hidden">
          {rows.map((row) => (
            <article key={row.auditId} className="rounded-2xl border border-slate-100 bg-surface-subtle p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black text-slate-900">{row.tenantName}</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-500">{shortId(row.gatewayPaymentId)}</p>
                </div>
                <StatusBadge tone={stageTone(row.stage)}>{row.stage}</StatusBadge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div><p className="font-black uppercase tracking-wide text-slate-400">HOAHub fee</p><p className="mt-1 font-black text-slate-900">{money(row.feeAmountPesos)}</p></div>
                <div><p className="font-black uppercase tracking-wide text-slate-400">Confirmed</p><p className="mt-1 font-semibold text-slate-700">{timestamp(row.confirmedAt)}</p></div>
                <div><p className="font-black uppercase tracking-wide text-slate-400">Available</p><p className="mt-1 font-semibold text-slate-700">{timestamp(row.availableAt)}</p></div>
                <div><p className="font-black uppercase tracking-wide text-slate-400">Parent payout</p><p className="mt-1 font-mono font-semibold text-slate-700">{shortId(row.payoutId)}</p></div>
              </div>
              {row.reconciliationError ? <p className="mt-3 break-words text-[11px] leading-4 text-status-critical">{row.reconciliationError}</p> : null}
            </article>
          ))}
        </div>

        {!rows.length ? <p className="py-12 text-center text-sm text-slate-500">No convenience-fee settlement records match the current filter.</p> : null}
      </WorkspaceCard>
    </div>
  );
}
