import Link from "next/link";
import { PlatformInvoiceStatus, TenantStatus, TenantSubscriptionStatus } from "@prisma/client";
import { Building2, CircleDollarSign, Clock3, ShieldAlert } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
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

  const [totalTenants, activeSubscriptions, trials, riskSubscriptions, suspendedTenants, receivables, recentTenants, riskTenants] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenantSubscription.count({ where: { status: TenantSubscriptionStatus.ACTIVE } }),
    prisma.tenantSubscription.count({ where: { status: TenantSubscriptionStatus.TRIAL } }),
    prisma.tenantSubscription.count({ where: { status: { in: riskStatuses } } }),
    prisma.tenant.count({ where: { status: TenantStatus.SUSPENDED } }),
    prisma.platformInvoice.aggregate({ where: { status: { in: openInvoiceStatuses } }, _sum: { outstandingBalance: true } }),
    prisma.tenant.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, status: true, subscriptionStatus: true, createdAt: true },
    }),
    prisma.tenant.findMany({
      where: { subscriptionStatus: { in: riskStatuses } },
      take: 5,
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, status: true, subscriptionStatus: true, updatedAt: true },
    }),
  ]);

  const outstandingAr = Number(receivables._sum.outstandingBalance || 0);
  const attentionCount = riskSubscriptions + suspendedTenants;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="SaaS Command Center"
        title="HOAHub Platform Dashboard"
        description="Operate the HOAHub customer portfolio from a platform-level workspace that is visually and operationally distinct from individual tenant administration."
        context={<StatusBadge tone="ai">Platform control plane</StatusBadge>}
        actions={(
          <>
            <Link className="btn-secondary" href="/platform/subscriptions">Subscriptions</Link>
            <Link className="btn-primary" href="/platform/tenants/new">Onboard HOA</Link>
          </>
        )}
      />

      <section aria-label="Platform executive snapshot" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total tenants" value={totalTenants} note={`${activeSubscriptions} active subscriptions`} icon={Building2} tone="blue" href="/platform/tenants" />
        <MetricCard label="Trials" value={trials} note="Current commercial pipeline" icon={Clock3} tone="violet" href="/platform/subscriptions" />
        <MetricCard label="Needs attention" value={attentionCount} note={`${riskSubscriptions} subscription risk · ${suspendedTenants} suspended tenants`} icon={ShieldAlert} tone={attentionCount ? "amber" : "green"} href="/platform/tenants" />
        <MetricCard label="Outstanding AR" value={money(outstandingAr)} note="Open platform invoices" icon={CircleDollarSign} tone={outstandingAr > 0 ? "red" : "green"} href="/platform/invoices" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <WorkspaceCard title="Recently onboarded tenants" description="Latest HOA customers added to the platform." action={<Link className="text-xs font-black text-platform-700 hover:underline" href="/platform/tenants">View all tenants →</Link>}>
          <div className="divide-y divide-slate-100">
            {recentTenants.map((tenant) => (
              <Link key={tenant.id} href={`/platform/tenants/${tenant.id}`} className="flex min-w-0 items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-slate-900">{tenant.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">Onboarded {tenant.createdAt.toLocaleDateString("en-PH")}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <StatusBadge tone={tenant.status === TenantStatus.ACTIVE ? "success" : "warning"}>{tenant.status.replaceAll("_", " ")}</StatusBadge>
                  <StatusBadge tone={subscriptionTone(tenant.subscriptionStatus)}>{tenant.subscriptionStatus.replaceAll("_", " ")}</StatusBadge>
                </span>
              </Link>
            ))}
            {!recentTenants.length ? <p className="py-8 text-center text-sm text-slate-500">No tenant records yet.</p> : null}
          </div>
        </WorkspaceCard>

        <WorkspaceCard title="Commercial attention" description="Tenants with subscription states requiring follow-up." action={<StatusBadge tone={riskTenants.length ? "warning" : "success"}>{riskTenants.length ? `${riskTenants.length} shown` : "Healthy"}</StatusBadge>}>
          <div className="divide-y divide-slate-100">
            {riskTenants.map((tenant) => (
              <Link key={tenant.id} href={`/platform/tenants/${tenant.id}/billing`} className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-slate-900">{tenant.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">Updated {tenant.updatedAt.toLocaleDateString("en-PH")}</span>
                </span>
                <StatusBadge tone="warning">{tenant.subscriptionStatus.replaceAll("_", " ")}</StatusBadge>
              </Link>
            ))}
            {!riskTenants.length ? <p className="py-8 text-center text-sm font-semibold text-status-success">No subscription risk requires attention.</p> : null}
          </div>
        </WorkspaceCard>
      </section>
    </div>
  );
}
