import Link from "next/link";
import { PlatformInvoiceStatus, TenantStatus, TenantSubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

function money(value: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
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
  const [tenants, count, totalTenants, activeSubscriptions, trials, riskSubscriptions, suspended, receivables] = await Promise.all([
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
    prisma.tenantSubscription.count({ where: { status: { in: [TenantSubscriptionStatus.PAST_DUE, TenantSubscriptionStatus.GRACE, TenantSubscriptionStatus.RESTRICTED] } } }),
    prisma.tenant.count({ where: { status: TenantStatus.SUSPENDED } }),
    prisma.platformInvoice.aggregate({ where: { status: { in: [PlatformInvoiceStatus.OPEN, PlatformInvoiceStatus.PARTIALLY_PAID, PlatformInvoiceStatus.OVERDUE] } }, _sum: { outstandingBalance: true } }),
  ]);
  const tenantIds = tenants.map((tenant) => tenant.id);
  const dueRows = tenantIds.length ? await prisma.platformInvoice.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds }, status: { in: [PlatformInvoiceStatus.OPEN, PlatformInvoiceStatus.PARTIALLY_PAID, PlatformInvoiceStatus.OVERDUE] } }, _sum: { outstandingBalance: true } }) : [];
  const dueByTenant = new Map(dueRows.map((row) => [row.tenantId, Number(row._sum.outstandingBalance || 0)]));
  const pages = Math.max(1, Math.ceil(count / pageSize));
  return <>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-wider text-leaf-700">SaaS control center</p><h1 className="text-3xl font-black text-slate-900 sm:text-4xl">Tenant Management</h1><p className="mt-2 max-w-3xl text-slate-600">Operate HOA customers, subscriptions, receivables, service status, and tenant access from one commercial workspace.</p></div><div className="flex gap-2"><Link className="btn-secondary" href="/platform/subscriptions">Subscriptions</Link><Link className="btn-primary" href="/platform/tenants/new">Onboard HOA</Link></div></div>
    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <Metric label="Total tenants" value={totalTenants} />
      <Metric label="Active subscriptions" value={activeSubscriptions} />
      <Metric label="Trials" value={trials} />
      <Metric label="Collection risk" value={riskSubscriptions} />
      <Metric label="Suspended" value={suspended} />
      <Metric label="Outstanding AR" value={money(Number(receivables._sum.outstandingBalance || 0))} />
    </section>
    {query.error && <p className="mt-5 rounded-xl bg-rose-50 p-3 text-rose-800">{query.error}</p>}
    <form className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2 xl:grid-cols-[1fr_180px_220px_auto]"><input className="field sm:col-span-2 xl:col-span-1" name="q" defaultValue={q} placeholder="Search HOA name or slug" /><select className="field" name="status" defaultValue={status || ""}><option value="">All service statuses</option>{Object.values(TenantStatus).map((value) => <option key={value}>{value}</option>)}</select><select className="field" name="subscription" defaultValue={subscriptionStatus || ""}><option value="">All subscription statuses</option>{Object.values(TenantSubscriptionStatus).map((value) => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select><button className="btn-secondary">Search</button></form>
    <div className="mt-4 hidden max-h-[65vh] overflow-auto rounded-2xl border bg-white md:block"><table className="min-w-[1120px] w-full text-sm"><thead className="sticky top-0 bg-slate-100 text-left"><tr><th className="p-4">Association</th><th className="p-4">Plan</th><th className="p-4">Subscription</th><th className="p-4">Amount due</th><th className="p-4">Next billing</th><th className="p-4">Users</th><th className="p-4">Service</th><th className="p-4">Actions</th></tr></thead><tbody>{tenants.map((tenant) => { const subscription = tenant.subscriptions[0]; const due = dueByTenant.get(tenant.id) || 0; return <tr key={tenant.id} className="border-t hover:bg-slate-50"><td className="p-4"><p className="font-black">{tenant.name}</p><Link className="text-xs font-bold text-blue-700 hover:underline" href={`/${tenant.slug}/login`} target="_blank">/{tenant.slug}/login</Link></td><td className="p-4"><p className="font-bold">{subscription?.plan.name || tenant.subscriptionPlan}</p><p className="text-xs text-slate-500">{subscription?.billingFrequency || "Legacy setup"}</p></td><td className="p-4"><SubscriptionBadge status={subscription?.status || tenant.subscriptionStatus} /></td><td className="p-4 font-black">{money(due, subscription?.currency || tenant.currency)}</td><td className="p-4">{subscription?.nextBillingDate?.toLocaleDateString("en-PH") || "Not scheduled"}</td><td className="p-4">{tenant._count.users}</td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${tenant.status === TenantStatus.ACTIVE ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{tenant.status}</span></td><td className="p-4"><div className="flex gap-3"><Link className="font-black text-pine-700" href={`/platform/tenants/${tenant.id}`}>Manage</Link><Link className="font-black text-blue-700" href={`/platform/tenants/${tenant.id}/billing`}>Billing</Link><Link className="font-black text-slate-600" href={`/platform/tenants/${tenant.id}/users`}>Users</Link></div></td></tr>; })}</tbody></table></div>
    <div className="mt-4 grid gap-3 md:hidden">{tenants.map((tenant) => { const subscription = tenant.subscriptions[0]; const due = dueByTenant.get(tenant.id) || 0; return <article key={tenant.id} className="rounded-2xl border bg-white p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-slate-900">{tenant.name}</h2><p className="mt-1 text-sm text-slate-500">{subscription?.plan.name || tenant.subscriptionPlan}</p></div><SubscriptionBadge status={subscription?.status || tenant.subscriptionStatus} /></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs font-black uppercase text-slate-400">Amount due</p><p className="font-black">{money(due, subscription?.currency || tenant.currency)}</p></div><div><p className="text-xs font-black uppercase text-slate-400">Next billing</p><p className="font-bold">{subscription?.nextBillingDate?.toLocaleDateString("en-PH") || "Not scheduled"}</p></div></div><div className="mt-4 grid grid-cols-3 gap-2"><Link className="btn-secondary text-center" href={`/platform/tenants/${tenant.id}`}>Manage</Link><Link className="btn-secondary text-center" href={`/platform/tenants/${tenant.id}/billing`}>Billing</Link><Link className="btn-secondary text-center" href={`/platform/tenants/${tenant.id}/users`}>Users</Link></div></article>; })}</div>
    {!tenants.length && <div className="mt-4 rounded-2xl border border-dashed bg-white p-10 text-center text-slate-600">No tenants match the selected filters.</div>}
    <div className="mt-5 flex items-center justify-between text-sm"><span>Page {page} of {pages}</span><div className="flex gap-2">{page > 1 && <Link className="btn-secondary" href={`?q=${encodeURIComponent(q)}&status=${status || ""}&subscription=${subscriptionStatus || ""}&page=${page - 1}`}>Previous</Link>}{page < pages && <Link className="btn-secondary" href={`?q=${encodeURIComponent(q)}&status=${status || ""}&subscription=${subscriptionStatus || ""}&page=${page + 1}`}>Next</Link>}</div></div>
  </>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 break-words text-2xl font-black text-pine-900">{value}</p></article>;
}

function SubscriptionBadge({ status }: { status: TenantSubscriptionStatus }) {
  const risk = [TenantSubscriptionStatus.PAST_DUE, TenantSubscriptionStatus.GRACE, TenantSubscriptionStatus.RESTRICTED, TenantSubscriptionStatus.SUSPENDED].includes(status);
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${status === TenantSubscriptionStatus.ACTIVE ? "bg-emerald-100 text-emerald-800" : risk ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{status.replaceAll("_", " ")}</span>;
}
