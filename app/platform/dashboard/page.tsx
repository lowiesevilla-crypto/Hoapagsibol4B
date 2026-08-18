import Link from "next/link";
import { PlatformInvoiceStatus, TenantStatus, TenantSubscriptionStatus } from "@prisma/client";
import { Building2, CircleDollarSign, Clock3, CreditCard, ShieldAlert, Sparkles, UsersRound } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceCard } from "@/components/ui/workspace-card";
import { prisma } from "@/lib/db";

function money(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value);
}

function subscriptionTone(status: TenantSubscriptionStatus) {
  if (status === TenantSubscriptionStatus.ACTIVE) return "success" as const;
  if ([TenantSubscriptionStatus.PAST_DUE, TenantSubscriptionStatus.GRACE, TenantSubscriptionStatus.RESTRICTED, TenantSubscriptionStatus.SUSPENDED].includes(status)) return "warning" as const;
  return "neutral" as const;
}

export default async function PlatformDashboardPage() {
  const riskStatuses = [TenantSubscriptionStatus.PAST_DUE, TenantSubscriptionStatus.GRACE, TenantSubscriptionStatus.RESTRICTED, TenantSubscriptionStatus.SUSPENDED];
  const openInvoiceStatuses = [PlatformInvoiceStatus.OPEN, PlatformInvoiceStatus.PARTIALLY_PAID, PlatformInvoiceStatus.OVERDUE];

  const [totalTenants, activeTenants, activeSubscriptions, trials, riskSubscriptions, suspendedTenants, attentionTenants, receivables, recentTenants, riskTenants] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { status: TenantStatus.ACTIVE } }),
    prisma.tenantSubscription.count({ where: { status: TenantSubscriptionStatus.ACTIVE } }),
    prisma.tenantSubscription.count({ where: { status: TenantSubscriptionStatus.TRIAL } }),
    prisma.tenantSubscription.count({ where: { status: { in: riskStatuses } } }),
    prisma.tenant.count({ where: { status: TenantStatus.SUSPENDED } }),
    prisma.tenant.count({ where: { OR: [{ status: TenantStatus.SUSPENDED }, { subscriptionStatus: { in: riskStatuses } }] } }),
    prisma.platformInvoice.aggregate({ where: { status: { in: openInvoiceStatuses } }, _sum: { outstandingBalance: true } }),
    prisma.tenant.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, status: true, subscriptionStatus: true, subscriptionPlan: true, createdAt: true, _count: { select: { users: true } } },
    }),
    prisma.tenant.findMany({
      where: { OR: [{ status: TenantStatus.SUSPENDED }, { subscriptionStatus: { in: riskStatuses } }] },
      take: 5,
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, status: true, subscriptionStatus: true, updatedAt: true },
    }),
  ]);

  const outstandingAr = Number(receivables._sum.outstandingBalance || 0);
  const healthyShare = totalTenants > 0 ? Math.round(((totalTenants - attentionTenants) / totalTenants) * 100) : 100;
  const activeShare = totalTenants > 0 ? Math.round((activeTenants / totalTenants) * 100) : 100;

  return (
    <div className="space-y-5">
      <section className="canva-platform-hero overflow-hidden rounded-[26px] p-6 text-white sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <p className="text-[11px] font-black uppercase tracking-[.2em] text-[#8fd6e9]">SaaS Intelligence · Live</p>
            <h1 className="mt-2 text-[34px] font-black leading-[1.04] tracking-[-.04em] sm:text-[42px]">HOAHub Platform Command Center</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#c6e0e8] sm:text-[15px]">A single operational view of customers, subscription state, platform receivables, and tenant risk using authoritative HOAHub records.</p>
            <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-black text-[#d7edf2]">{healthyShare}% portfolio health</span><span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-black text-[#d7edf2]">{activeShare}% active tenants</span></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-white/12 bg-white/8 px-4 text-sm font-black text-white hover:bg-white/12" href="/platform/subscriptions"><CreditCard className="size-4" /> Subscriptions</Link>
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-[13px] bg-[#0b95d8] px-4 text-sm font-black text-white shadow-[0_10px_24px_rgba(11,149,216,.2)] hover:bg-[#27b6ff]" href="/platform/tenants/new"><Building2 className="size-4" /> Onboard HOA</Link>
          </div>
        </div>
      </section>

      <section aria-label="Platform executive snapshot" className="grid gap-[15px] sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active HOA tenants" value={activeTenants} note={`${totalTenants} total tenant records`} icon={Building2} tone="blue" href="/platform/tenants" />
        <MetricCard label="Active subscriptions" value={activeSubscriptions} note={`${trials} current trial${trials === 1 ? "" : "s"}`} icon={UsersRound} tone="green" href="/platform/subscriptions" />
        <MetricCard label="Outstanding AR" value={money(outstandingAr)} note="Open, partially paid, or overdue platform invoices" icon={CircleDollarSign} tone={outstandingAr > 0 ? "amber" : "green"} href="/platform/invoices" />
        <MetricCard label="Risk & exceptions" value={attentionTenants} note={`${riskSubscriptions} subscription risk · ${suspendedTenants} suspended`} icon={ShieldAlert} tone={attentionTenants ? "red" : "green"} href="/platform/tenants" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
        <WorkspaceCard title="Portfolio intelligence" description="Current tenant and subscription distribution from the HOAHub control plane." action={<StatusBadge tone={attentionTenants ? "warning" : "success"}>{healthyShare}% healthy</StatusBadge>}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_250px]">
            <div className="rounded-[18px] border border-[#e3edf2] bg-[#f7fbfd] p-5">
              <PortfolioBar label="Active tenants" value={activeTenants} max={Math.max(totalTenants, 1)} className="bg-[#0b95d8]" />
              <PortfolioBar label="Active subscriptions" value={activeSubscriptions} max={Math.max(totalTenants, 1)} className="bg-[#6ed64b]" />
              <PortfolioBar label="Trials" value={trials} max={Math.max(totalTenants, 1)} className="bg-[#27b6ff]" />
              <PortfolioBar label="Needs attention" value={attentionTenants} max={Math.max(totalTenants, 1)} className="bg-[#e95d6a]" />
            </div>
            <div className="grid gap-3">
              <SignalTile icon={UsersRound} label="Tenant activation" value={`${activeTenants}/${totalTenants}`} note="Active service records" />
              <SignalTile icon={CreditCard} label="Subscription health" value={`${activeSubscriptions} active`} note={`${riskSubscriptions} risk states`} />
              <SignalTile icon={CircleDollarSign} label="Platform receivables" value={money(outstandingAr)} note="Authoritative open AR" />
            </div>
          </div>
        </WorkspaceCard>

        <aside className="canva-intelligence-panel rounded-[22px] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#9edfd1]">Platform Intelligence Brief</p><h2 className="mt-2 text-xl font-black">Portfolio signal</h2></div><span className="grid size-11 place-items-center rounded-2xl bg-white/10"><Sparkles className="size-5 text-[#6ed64b]" /></span></div>
          <p className="mt-5 text-sm leading-6"><strong>{healthyShare}%</strong> of tenant records are currently outside subscription-risk or suspension states.</p>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs leading-5"><strong>{attentionTenants}</strong> tenant{attentionTenants === 1 ? "" : "s"} require commercial or service follow-up. Open platform AR is <strong>{money(outstandingAr)}</strong>.</p></div>
          <Link className="mt-5 inline-flex text-xs font-black text-[#9fe98b] hover:underline" href="/platform/tenants">Review tenant portfolio →</Link>
        </aside>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <WorkspaceCard title="Tenant health matrix" description="Operational confidence based on authoritative service and subscription states." action={<Link className="text-xs font-black text-[#0872ae] hover:underline" href="/platform/tenants">View all tenants →</Link>}>
          <div className="divide-y divide-[#edf2f5]">
            {recentTenants.map((tenant) => {
              const healthy = tenant.status === TenantStatus.ACTIVE && tenant.subscriptionStatus === TenantSubscriptionStatus.ACTIVE;
              const watch = tenant.status !== TenantStatus.SUSPENDED && !healthy;
              return <Link key={tenant.id} href={`/platform/tenants/${tenant.id}`} className="grid gap-3 py-3.5 first:pt-1 sm:grid-cols-[minmax(0,1fr)_130px] sm:items-center"><span className="min-w-0"><span className="block truncate text-sm font-black text-[#153c50]">{tenant.name}</span><span className="mt-1 block truncate text-xs text-[#7c8d9b]">{tenant.subscriptionPlan} · {tenant._count.users} users · onboarded {tenant.createdAt.toLocaleDateString("en-PH")}</span></span><span className="sm:text-right"><StatusBadge tone={healthy ? "success" : watch ? "warning" : "critical"}>{healthy ? "Healthy" : watch ? "Watch" : "Risk"}</StatusBadge></span></Link>;
            })}
            {!recentTenants.length ? <p className="py-8 text-center text-sm text-[#7c8d9b]">No tenant records yet.</p> : null}
          </div>
        </WorkspaceCard>

        <WorkspaceCard title="Requires attention" description="Commercial and platform exceptions from current records." action={<StatusBadge tone={riskTenants.length ? "warning" : "success"}>{riskTenants.length ? `${riskTenants.length} shown` : "Clear"}</StatusBadge>}>
          <div className="divide-y divide-[#edf2f5]">
            {riskTenants.map((tenant) => (
              <Link key={tenant.id} href={`/platform/tenants/${tenant.id}/billing`} className="flex min-w-0 items-center justify-between gap-3 py-3.5 first:pt-1">
                <span className="min-w-0"><span className="block truncate text-sm font-black text-[#153c50]">{tenant.name}</span><span className="mt-0.5 block text-xs text-[#7c8d9b]">Updated {tenant.updatedAt.toLocaleDateString("en-PH")}</span></span>
                <StatusBadge tone={subscriptionTone(tenant.subscriptionStatus)}>{tenant.subscriptionStatus.replaceAll("_", " ")}</StatusBadge>
              </Link>
            ))}
            {!riskTenants.length ? <p className="py-8 text-center text-sm font-semibold text-status-success">No tenant risk requires attention.</p> : null}
          </div>
        </WorkspaceCard>
      </section>
    </div>
  );
}

function PortfolioBar({ label, value, max, className }: { label: string; value: number; max: number; className: string }) {
  const percentage = Math.min(100, Math.round((value / max) * 100));
  return <div className="mb-4 last:mb-0"><div className="flex items-center justify-between gap-3 text-xs font-bold"><span className="text-[#6f8294]">{label}</span><span className="text-[#0c3248]">{value}</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#e3ebef]"><div className={`h-full rounded-full ${className}`} style={{ width: `${percentage}%` }} /></div></div>;
}

function SignalTile({ icon: Icon, label, value, note }: { icon: typeof Building2; label: string; value: string; note: string }) {
  return <div className="rounded-[16px] border border-[#e3edf2] bg-white p-3.5"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-[12px] bg-[#eaf6ff] text-[#0b80be]"><Icon className="size-4" /></span><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.08em] text-[#8091a0]">{label}</p><p className="mt-0.5 truncate text-base font-black text-[#0c3248]">{value}</p></div></div><p className="mt-2 text-[11px] text-[#7c8d9b]">{note}</p></div>;
}
