import { PlatformInvoiceStatus, TenantSubscriptionStatus } from "@prisma/client";
import Link from "next/link";
import { AlertTriangle, BadgeCheck, CreditCard, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db";

function money(value: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

export default async function PlatformSubscriptionsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const query = await searchParams;
  const status = Object.values(TenantSubscriptionStatus).includes(query.status as TenantSubscriptionStatus) ? query.status as TenantSubscriptionStatus : undefined;
  const q = String(query.q || "").trim();
  const [subscriptions, counts, receivables, collections] = await Promise.all([
    prisma.tenantSubscription.findMany({
      where: { ...(status ? { status } : {}), ...(q ? { tenant: { OR: [{ name: { contains: q } }, { shortName: { contains: q } }, { slug: { contains: q } }] } } : {}) },
      include: { tenant: true, plan: true, invoices: { orderBy: { issueDate: "desc" }, take: 1 } },
      orderBy: [{ status: "asc" }, { nextBillingDate: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.tenantSubscription.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.platformInvoice.aggregate({ where: { status: { in: [PlatformInvoiceStatus.OPEN, PlatformInvoiceStatus.PARTIALLY_PAID, PlatformInvoiceStatus.OVERDUE] } }, _sum: { outstandingBalance: true } }),
    prisma.platformPayment.aggregate({ where: { status: "SUCCEEDED" }, _sum: { amount: true } }),
  ]);
  const count = (value: TenantSubscriptionStatus) => counts.find((item) => item.status === value)?._count._all || 0;
  return <>
    <PageHeader eyebrow="Platform revenue" title="Tenant subscriptions" description="Manage commercial contracts, billing cycles, renewal dates, receivables, and subscription risk from one workspace." action={<Link className="btn-primary" href="/platform/plans">Manage plans</Link>} />
    <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Active" value={count(TenantSubscriptionStatus.ACTIVE)} icon={<BadgeCheck className="size-5" />} />
      <Metric label="Trial" value={count(TenantSubscriptionStatus.TRIAL)} icon={<ListChecks className="size-5" />} />
      <Metric label="Past due / grace" value={count(TenantSubscriptionStatus.PAST_DUE) + count(TenantSubscriptionStatus.GRACE)} icon={<AlertTriangle className="size-5" />} />
      <Metric label="Outstanding AR" value={money(Number(receivables._sum.outstandingBalance || 0))} icon={<CreditCard className="size-5" />} />
      <Metric label="Recorded collections" value={money(Number(collections._sum.amount || 0))} icon={<CreditCard className="size-5" />} />
    </section>
    <form className="mb-4 grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-[1fr_220px_auto]"><input className="field" name="q" defaultValue={q} placeholder="Search tenant name or slug" /><select className="field" name="status" defaultValue={status || ""}><option value="">All subscription statuses</option>{Object.values(TenantSubscriptionStatus).map((value) => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select><button className="btn-secondary">Filter</button></form>
    <div className="hidden overflow-auto rounded-2xl border bg-white md:block"><table className="min-w-[1000px] w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-4">Tenant</th><th className="p-4">Plan</th><th className="p-4">Status</th><th className="p-4">Cycle</th><th className="p-4">Agreed price</th><th className="p-4">Next billing</th><th className="p-4">Latest invoice</th><th className="p-4">Action</th></tr></thead><tbody>{subscriptions.map((subscription) => { const invoice = subscription.invoices[0]; return <tr key={subscription.id} className="border-t hover:bg-slate-50"><td className="p-4"><p className="font-black">{subscription.tenant.name}</p><p className="text-xs text-slate-500">/{subscription.tenant.slug}</p></td><td className="p-4"><p className="font-bold">{subscription.plan.name}</p><p className="text-xs text-slate-500">{subscription.plan.code}</p></td><td className="p-4"><StatusBadge status={subscription.status} /></td><td className="p-4">{subscription.billingFrequency}</td><td className="p-4 font-bold">{subscription.agreedPrice == null ? "Plan price" : money(Number(subscription.agreedPrice), subscription.currency)}</td><td className="p-4">{subscription.nextBillingDate?.toLocaleDateString("en-PH") || "Not scheduled"}</td><td className="p-4">{invoice ? <><p className="font-bold">{invoice.invoiceNumber}</p><p className="text-xs text-slate-500">{invoice.status} · {money(Number(invoice.outstandingBalance), invoice.currency)} due</p></> : "No invoice"}</td><td className="p-4"><Link className="font-black text-pine-700 hover:underline" href={`/platform/tenants/${subscription.tenantId}/billing`}>Billing</Link></td></tr>; })}</tbody></table></div>
    <div className="grid gap-3 md:hidden">{subscriptions.map((subscription) => <article key={subscription.id} className="card"><div className="flex items-start justify-between gap-3"><div><h2 className="font-black">{subscription.tenant.name}</h2><p className="text-sm text-slate-500">{subscription.plan.name} · {subscription.billingFrequency}</p></div><StatusBadge status={subscription.status} /></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs font-bold uppercase text-slate-400">Next billing</p><p className="font-bold">{subscription.nextBillingDate?.toLocaleDateString("en-PH") || "Not scheduled"}</p></div><div><p className="text-xs font-bold uppercase text-slate-400">Price</p><p className="font-bold">{subscription.agreedPrice == null ? "Plan price" : money(Number(subscription.agreedPrice), subscription.currency)}</p></div></div><Link className="btn-secondary mt-4 block text-center" href={`/platform/tenants/${subscription.tenantId}/billing`}>Open billing</Link></article>)} </div>
    {!subscriptions.length && <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-slate-500">No subscriptions match the selected filters. Assign plans from a tenant Billing tab.</div>}
  </>;
}

function Metric({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return <article className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p><span className="text-pine-700">{icon}</span></div><p className="mt-2 text-2xl font-black text-pine-950">{value}</p></article>;
}

function StatusBadge({ status }: { status: TenantSubscriptionStatus }) {
  const risk = [TenantSubscriptionStatus.PAST_DUE, TenantSubscriptionStatus.GRACE, TenantSubscriptionStatus.RESTRICTED, TenantSubscriptionStatus.SUSPENDED].includes(status);
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${risk ? "bg-amber-100 text-amber-900" : status === TenantSubscriptionStatus.ACTIVE ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{status.replaceAll("_", " ")}</span>;
}
