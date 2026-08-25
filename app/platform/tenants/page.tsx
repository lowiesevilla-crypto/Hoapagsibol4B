import { StandardTable } from "@/components/standard-table";
import Link from "next/link";
import { PlatformInvoiceStatus, TenantStatus, TenantSubscriptionStatus } from "@prisma/client";
import { Building2, CircleDollarSign, Clock3, ShieldAlert } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceCard } from "@/components/ui/workspace-card";
import { prisma } from "@/lib/db";

function money(value: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function subscriptionTone(status: TenantSubscriptionStatus) {
  if (status === TenantSubscriptionStatus.ACTIVE) return "success" as const;
  if ([TenantSubscriptionStatus.PAST_DUE, TenantSubscriptionStatus.GRACE, TenantSubscriptionStatus.RESTRICTED, TenantSubscriptionStatus.SUSPENDED].includes(status)) return "warning" as const;
  if (status === TenantSubscriptionStatus.TRIAL) return "info" as const;
  return "neutral" as const;
}

function serviceTone(status: TenantStatus) {
  return status === TenantStatus.ACTIVE ? "success" as const : status === TenantStatus.SUSPENDED ? "critical" as const : "warning" as const;
}

export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; subscription?: string; page?: string; error?: string }> }) {
  const query = await searchParams;
  const q = String(query.q || "").trim();
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = 12;
  const status = Object.values(TenantStatus).includes(query.status as TenantStatus) ? query.status as TenantStatus : undefined;
  const subscriptionStatus = Object.values(TenantSubscriptionStatus).includes(query.subscription as TenantSubscriptionStatus) ? query.subscription as TenantSubscriptionStatus : undefined;
  const where = {
    ...(status ? { status } : {}),
    ...(subscriptionStatus ? { subscriptionStatus } : {}),
    ...(q ? { OR: [{ name: { contains: q } }, { slug: { contains: q } }, { shortName: { contains: q } }] } : {}),
  };
  const riskStatuses = [TenantSubscriptionStatus.PAST_DUE, TenantSubscriptionStatus.GRACE, TenantSubscriptionStatus.RESTRICTED, TenantSubscriptionStatus.SUSPENDED];
  const openInvoiceStatuses = [PlatformInvoiceStatus.OPEN, PlatformInvoiceStatus.PARTIALLY_PAID, PlatformInvoiceStatus.OVERDUE];
  const [tenants, count, totalTenants, activeSubscriptions, trials, attentionTenants, suspended, receivables] = await Promise.all([
    prisma.tenant.findMany({
      where,
      include: {
        _count: { select: { users: true } },
        subscriptions: { where: { status: { notIn: [TenantSubscriptionStatus.CANCELLED, TenantSubscriptionStatus.EXPIRED] } }, include: { plan: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.tenant.count({ where }),
    prisma.tenant.count(),
    prisma.tenantSubscription.count({ where: { status: TenantSubscriptionStatus.ACTIVE } }),
    prisma.tenantSubscription.count({ where: { status: TenantSubscriptionStatus.TRIAL } }),
    prisma.tenant.count({ where: { OR: [{ status: TenantStatus.SUSPENDED }, { subscriptionStatus: { in: riskStatuses } }] } }),
    prisma.tenant.count({ where: { status: TenantStatus.SUSPENDED } }),
    prisma.platformInvoice.aggregate({ where: { status: { in: openInvoiceStatuses } }, _sum: { outstandingBalance: true } }),
  ]);
  const tenantIds = tenants.map((tenant) => tenant.id);
  const dueRows = tenantIds.length ? await prisma.platformInvoice.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds }, status: { in: openInvoiceStatuses } }, _sum: { outstandingBalance: true } }) : [];
  const dueByTenant = new Map(dueRows.map((row) => [row.tenantId, Number(row._sum.outstandingBalance || 0)]));
  const pages = Math.max(1, Math.ceil(count / pageSize));

  return <div className="space-y-5">
    <PageHeader eyebrow="Customer Portfolio" title="Tenant Management" description="Operate HOA customers, subscriptions, receivables, service status, and tenant access from one SaaS portfolio workspace." context={<><StatusBadge tone="ai">Platform control plane</StatusBadge><StatusBadge tone={attentionTenants ? "warning" : "success"}>{attentionTenants ? `${attentionTenants} tenant${attentionTenants === 1 ? "" : "s"} need attention` : "Portfolio healthy"}</StatusBadge></>} actions={<><Link className="btn-secondary" href="/platform/subscriptions">Subscriptions</Link><Link className="btn-primary" href="/platform/tenants/new">Onboard HOA</Link></>} />

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Total tenants" value={totalTenants} note={`${activeSubscriptions} active subscriptions`} icon={Building2} tone="blue" />
      <MetricCard label="Trials" value={trials} note="Current commercial pipeline" icon={Clock3} tone="violet" />
      <MetricCard label="Needs attention" value={attentionTenants} note={`${suspended} service-suspended tenant${suspended === 1 ? "" : "s"}`} icon={ShieldAlert} tone={attentionTenants ? "amber" : "green"} />
      <MetricCard label="Outstanding AR" value={money(Number(receivables._sum.outstandingBalance || 0))} note="Open platform invoices" icon={CircleDollarSign} tone={Number(receivables._sum.outstandingBalance || 0) > 0 ? "red" : "green"} />
    </section>

    {query.error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{query.error}</p>}

    <WorkspaceCard title="Tenant portfolio" description={`${count} tenant${count === 1 ? "" : "s"} match the current view.`} action={<span className="text-xs font-black text-slate-400">Page {page} of {pages}</span>}>
      <form className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_180px_220px_auto]"><input className="field sm:col-span-2 xl:col-span-1" name="q" defaultValue={q} placeholder="Search HOA name or slug" /><select className="field" name="status" defaultValue={status || ""}><option value="">All service statuses</option>{Object.values(TenantStatus).map((value) => <option key={value}>{value}</option>)}</select><select className="field" name="subscription" defaultValue={subscriptionStatus || ""}><option value="">All subscription statuses</option>{Object.values(TenantSubscriptionStatus).map((value) => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select><button className="btn-secondary">Apply filters</button></form>

      <div className="hidden max-h-[65vh] overflow-auto rounded-2xl border border-slate-200 md:block"><StandardTable><table className="min-w-[1120px] w-full text-sm"><thead className="sticky top-0 z-10 bg-surface-subtle text-left"><tr><th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Association</th><th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Plan</th><th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Health</th><th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Amount due</th><th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Next billing</th><th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Users</th><th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Actions</th></tr></thead><tbody>{tenants.map((tenant) => { const subscription = tenant.subscriptions[0]; const due = dueByTenant.get(tenant.id) || 0; const subscriptionState = subscription?.status || tenant.subscriptionStatus; return <tr key={tenant.id} className="border-t border-slate-100 transition hover:bg-pine-50/40"><td className="p-4"><p className="font-black text-slate-900">{tenant.name}</p><p className="mt-1 text-xs font-semibold text-slate-400">/{tenant.slug}</p></td><td className="p-4"><p className="font-bold">{subscription?.plan.name || tenant.subscriptionPlan}</p><p className="text-xs text-slate-500">{subscription?.billingFrequency || "Legacy setup"}</p></td><td className="p-4"><div className="flex flex-wrap gap-1.5"><StatusBadge tone={serviceTone(tenant.status)}>{tenant.status.replaceAll("_", " ")}</StatusBadge><StatusBadge tone={subscriptionTone(subscriptionState)}>{subscriptionState.replaceAll("_", " ")}</StatusBadge></div></td><td className="p-4 font-black">{money(due, subscription?.currency || tenant.currency)}</td><td className="p-4">{subscription?.nextBillingDate?.toLocaleDateString("en-PH") || "Not scheduled"}</td><td className="p-4 font-bold">{tenant._count.users}</td><td className="p-4"><div className="flex gap-3"><Link className="font-black text-platform-700 hover:underline" href={`/platform/tenants/${tenant.id}`}>Tenant 360</Link><Link className="font-black text-blue-700 hover:underline" href={`/platform/tenants/${tenant.id}/billing`}>Billing</Link><Link className="font-black text-slate-600 hover:underline" href={`/platform/tenants/${tenant.id}/users`}>Users</Link></div></td></tr>; })}</tbody></table></StandardTable></div>

      <div className="grid gap-3 md:hidden">{tenants.map((tenant) => { const subscription = tenant.subscriptions[0]; const due = dueByTenant.get(tenant.id) || 0; const subscriptionState = subscription?.status || tenant.subscriptionStatus; return <article key={tenant.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-black text-slate-900">{tenant.name}</h2><p className="mt-1 text-sm text-slate-500">{subscription?.plan.name || tenant.subscriptionPlan}</p></div><StatusBadge tone={subscriptionTone(subscriptionState)}>{subscriptionState.replaceAll("_", " ")}</StatusBadge></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs font-black uppercase text-slate-400">Amount due</p><p className="font-black">{money(due, subscription?.currency || tenant.currency)}</p></div><div><p className="text-xs font-black uppercase text-slate-400">Service</p><div className="mt-1"><StatusBadge tone={serviceTone(tenant.status)}>{tenant.status}</StatusBadge></div></div></div><div className="mt-4 grid grid-cols-3 gap-2"><Link className="btn-secondary px-2 text-center text-xs" href={`/platform/tenants/${tenant.id}`}>Tenant 360</Link><Link className="btn-secondary px-2 text-center text-xs" href={`/platform/tenants/${tenant.id}/billing`}>Billing</Link><Link className="btn-secondary px-2 text-center text-xs" href={`/platform/tenants/${tenant.id}/users`}>Users</Link></div></article>; })}</div>
      {!tenants.length && <div className="rounded-2xl border border-dashed border-slate-200 bg-surface-subtle p-10 text-center text-slate-600">No tenants match the selected filters.</div>}

      <nav className="mt-5 flex items-center justify-between text-sm"><span className="font-semibold text-slate-500">Page {page} of {pages}</span><div className="flex gap-2">{page > 1 && <Link className="btn-secondary" href={`?q=${encodeURIComponent(q)}&status=${status || ""}&subscription=${subscriptionStatus || ""}&page=${page - 1}`}>Previous</Link>}{page < pages && <Link className="btn-secondary" href={`?q=${encodeURIComponent(q)}&status=${status || ""}&subscription=${subscriptionStatus || ""}&page=${page + 1}`}>Next</Link>}</div></nav>
    </WorkspaceCard>
  </div>;
}
