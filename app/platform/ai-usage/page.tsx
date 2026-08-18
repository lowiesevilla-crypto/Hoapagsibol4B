import Link from "next/link";
import { AiRequestOutcome } from "@prisma/client";
import { BrainCircuit, CircleDollarSign, Gauge, MessageSquareText } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceCard } from "@/components/ui/workspace-card";
import { prisma } from "@/lib/db";

function moneyCentavos(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value / 100);
}

export default async function PlatformAiUsagePage() {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [monthUsage, successfulRequests, blockedRequests, tenantUsage, recent] = await Promise.all([
    prisma.aiUsageLedger.aggregate({ where: { createdAt: { gte: monthStart } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, estimatedCostCentavos: true }, _avg: { latencyMs: true } }),
    prisma.aiUsageLedger.count({ where: { createdAt: { gte: monthStart }, outcome: AiRequestOutcome.SUCCEEDED } }),
    prisma.aiUsageLedger.count({ where: { createdAt: { gte: monthStart }, outcome: { in: [AiRequestOutcome.DENIED, AiRequestOutcome.REFUSED, AiRequestOutcome.RATE_LIMITED, AiRequestOutcome.QUOTA_BLOCKED, AiRequestOutcome.PROVIDER_ERROR] } } }),
    prisma.aiUsageLedger.groupBy({ by: ["tenantId"], where: { createdAt: { gte: monthStart } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, estimatedCostCentavos: true }, orderBy: { _count: { id: "desc" } }, take: 12 }),
    prisma.aiUsageLedger.findMany({ take: 12, orderBy: { createdAt: "desc" }, select: { id: true, tenantId: true, outcome: true, model: true, inputTokens: true, outputTokens: true, estimatedCostCentavos: true, latencyMs: true, createdAt: true } }),
  ]);

  const tenantIds = [...new Set([...tenantUsage.map((row) => row.tenantId), ...recent.map((row) => row.tenantId)])];
  const tenants = tenantIds.length ? await prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }) : [];
  const tenantName = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  const requestCount = monthUsage._count._all;
  const totalTokens = Number(monthUsage._sum.inputTokens ?? 0) + Number(monthUsage._sum.outputTokens ?? 0);
  const estimatedCostCentavos = Number(monthUsage._sum.estimatedCostCentavos ?? 0);
  const avgLatency = Math.round(Number(monthUsage._avg.latencyMs ?? 0));

  return <div className="space-y-5">
    <PageHeader eyebrow="AI Operations" title="Platform AI Usage" description="Cross-tenant usage telemetry for the HOAHub AI product layer. This surface shows usage metadata only; it does not expose tenant conversation content." context={<><StatusBadge tone="ai">Platform telemetry</StatusBadge><StatusBadge tone="info">Metadata only</StatusBadge></>} actions={<Link className="btn-secondary" href="/platform/dashboard">Command Center</Link>} />

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Requests this month" value={requestCount} note={`${successfulRequests} succeeded · ${blockedRequests} blocked/failed`} icon={MessageSquareText} tone="violet" />
      <MetricCard label="Tokens processed" value={totalTokens.toLocaleString("en-PH")} note="Input + output usage ledger" icon={BrainCircuit} tone="blue" />
      <MetricCard label="Estimated provider cost" value={moneyCentavos(estimatedCostCentavos)} note="Usage-ledger estimate" icon={CircleDollarSign} tone="green" />
      <MetricCard label="Average latency" value={avgLatency ? `${avgLatency} ms` : "—"} note="Recorded provider latency" icon={Gauge} tone={avgLatency > 5000 ? "amber" : "blue"} />
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
      <WorkspaceCard title="Tenant AI adoption" description="Highest request volume for the current month.">
        <div className="divide-y divide-slate-100">
          {tenantUsage.map((row) => <div key={row.tenantId} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_100px_150px_120px] sm:items-center"><div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{tenantName.get(row.tenantId) ?? "Tenant"}</p><p className="mt-1 truncate font-mono text-[10px] text-slate-400">{row.tenantId}</p></div><p className="text-sm font-black text-platform-700">{row._count._all} requests</p><p className="text-xs font-bold text-slate-500">{(Number(row._sum.inputTokens ?? 0) + Number(row._sum.outputTokens ?? 0)).toLocaleString("en-PH")} tokens</p><p className="text-right text-sm font-black text-pine-900">{moneyCentavos(Number(row._sum.estimatedCostCentavos ?? 0))}</p></div>)}
          {!tenantUsage.length ? <p className="py-10 text-center text-sm text-slate-500">No AI usage recorded this month.</p> : null}
        </div>
      </WorkspaceCard>

      <WorkspaceCard title="Recent AI requests" description="Outcome and performance metadata without prompt/response content.">
        <div className="divide-y divide-slate-100">
          {recent.map((row) => <div key={row.id} className="py-3 first:pt-0 last:pb-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{tenantName.get(row.tenantId) ?? "Tenant"}</p><p className="mt-1 text-xs text-slate-500">{row.model || "Provider model"} · {row.inputTokens + row.outputTokens} tokens · {row.latencyMs ? `${row.latencyMs} ms` : "latency unavailable"}</p></div><StatusBadge tone={row.outcome === AiRequestOutcome.SUCCEEDED ? "success" : row.outcome === AiRequestOutcome.PROVIDER_ERROR ? "critical" : "warning"}>{row.outcome.replaceAll("_", " ")}</StatusBadge></div></div>)}
          {!recent.length ? <p className="py-10 text-center text-sm text-slate-500">No AI requests recorded.</p> : null}
        </div>
      </WorkspaceCard>
    </section>
  </div>;
}
