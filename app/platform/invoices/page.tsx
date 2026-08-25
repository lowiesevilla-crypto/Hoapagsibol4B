import { StandardTable } from "@/components/standard-table";
import { PlatformInvoiceStatus, Role } from "@prisma/client";
import { Download, ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { platformPrisma } from "@/lib/db";
import {
  platformInvoiceDocumentUrl,
  platformInvoicePdfUrl,
} from "@/lib/services/platform-invoice-document";

function money(value: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function date(value: Date) {
  return value.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit", timeZone: "UTC" });
}

export default async function PlatformInvoicesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const user = await requireUser();
  if (!user.roles.includes(Role.SUPER_ADMIN) && !user.roles.includes(Role.PLATFORM_ADMIN)) redirect("/admin/dashboard");

  const query = await searchParams;
  const q = String(query.q || "").trim();
  const status = Object.values(PlatformInvoiceStatus).includes(query.status as PlatformInvoiceStatus)
    ? query.status as PlatformInvoiceStatus
    : undefined;
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = 25;
  const where = {
    ...(status ? { status } : {}),
    ...(q ? {
      OR: [
        { invoiceNumber: { contains: q } },
        { tenant: { name: { contains: q } } },
        { tenant: { shortName: { contains: q } } },
        { tenant: { slug: { contains: q } } },
      ],
    } : {}),
  };

  const [invoices, total, openCount, overdueCount, receivables, paidTotals] = await Promise.all([
    platformPrisma.platformInvoice.findMany({
      where,
      include: {
        tenant: { select: { name: true, shortName: true, slug: true } },
        subscription: { include: { plan: { select: { name: true, code: true } } } },
      },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    platformPrisma.platformInvoice.count({ where }),
    platformPrisma.platformInvoice.count({ where: { status: { in: [PlatformInvoiceStatus.OPEN, PlatformInvoiceStatus.PARTIALLY_PAID] } } }),
    platformPrisma.platformInvoice.count({ where: { status: PlatformInvoiceStatus.OVERDUE } }),
    platformPrisma.platformInvoice.aggregate({
      where: { status: { in: [PlatformInvoiceStatus.OPEN, PlatformInvoiceStatus.PARTIALLY_PAID, PlatformInvoiceStatus.OVERDUE] } },
      _sum: { outstandingBalance: true },
    }),
    platformPrisma.platformInvoice.aggregate({ where: { status: PlatformInvoiceStatus.PAID }, _sum: { amountPaid: true } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const hrefForPage = (next: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    params.set("page", String(next));
    return `/platform/invoices?${params.toString()}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-leaf-700">Revenue Operations</p>
          <h1 className="text-3xl font-black text-slate-950">Platform Invoices</h1>
          <p className="mt-2 max-w-3xl text-slate-600">Professional HOAHub subscription invoices across all tenants. Open, print, or download the immutable issued document from this register.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-pine-50 px-4 py-2 text-sm font-black text-pine-900"><FileText className="size-4" /> Invoice register</span>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Open invoices" value={String(openCount)} />
        <Metric label="Overdue" value={String(overdueCount)} />
        <Metric label="Outstanding AR" value={money(Number(receivables._sum.outstandingBalance || 0))} />
        <Metric label="Paid collections" value={money(Number(paidTotals._sum.amountPaid || 0))} />
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-5 sm:p-6">
        <form className="grid gap-3 sm:grid-cols-[1fr_220px_auto]">
          <input className="field" name="q" defaultValue={q} placeholder="Search invoice, tenant, or slug" />
          <select className="field" name="status" defaultValue={status || ""}>
            <option value="">All invoice statuses</option>
            {Object.values(PlatformInvoiceStatus).map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
          </select>
          <button className="btn-secondary">Filter</button>
        </form>

        <div className="mt-5 overflow-auto">
          <StandardTable><table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-3">Invoice</th>
                <th className="p-3">Tenant</th>
                <th className="p-3">Plan</th>
                <th className="p-3">Issued / Due</th>
                <th className="p-3">Total</th>
                <th className="p-3">Paid</th>
                <th className="p-3">Balance</th>
                <th className="p-3">Status</th>
                <th className="p-3">Document</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t align-top">
                  <td className="p-3 font-black text-slate-900">{invoice.invoiceNumber}</td>
                  <td className="p-3"><p className="font-bold">{invoice.tenant.name}</p><p className="mt-1 text-xs text-slate-500">/{invoice.tenant.slug}</p></td>
                  <td className="p-3"><p className="font-bold">{invoice.subscription.plan.name}</p><p className="mt-1 text-xs text-slate-500">{invoice.subscription.plan.code}</p></td>
                  <td className="p-3">{date(invoice.issueDate)}<br /><span className="text-xs text-slate-500">Due {date(invoice.dueDate)}</span></td>
                  <td className="p-3 font-bold">{money(Number(invoice.total), invoice.currency)}</td>
                  <td className="p-3">{money(Number(invoice.amountPaid), invoice.currency)}</td>
                  <td className="p-3 font-black">{money(Number(invoice.outstandingBalance), invoice.currency)}</td>
                  <td className="p-3"><Status value={invoice.status} /></td>
                  <td className="p-3">
                    <div className="flex flex-col items-start gap-2">
                      <Link className="inline-flex items-center gap-1 font-black text-blue-700 hover:underline" href={platformInvoiceDocumentUrl(invoice.id)} target="_blank">View / Print <ExternalLink className="size-3" /></Link>
                      <a className="inline-flex items-center gap-1 font-black text-pine-700 hover:underline" href={platformInvoicePdfUrl(invoice.id)}><Download className="size-3" /> Download PDF</a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></StandardTable>
        </div>
        {!invoices.length && <p className="mt-5 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No platform invoices match the current filters.</p>}

        <div className="mt-5 flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-500">Page {Math.min(page, pageCount)} of {pageCount} · {total} invoice{total === 1 ? "" : "s"}</span>
          <div className="flex gap-2">
            {page > 1 ? <Link className="btn-secondary" href={hrefForPage(page - 1)}>Previous</Link> : <span className="rounded-xl border px-4 py-2 text-slate-300">Previous</span>}
            {page < pageCount ? <Link className="btn-secondary" href={hrefForPage(page + 1)}>Next</Link> : <span className="rounded-xl border px-4 py-2 text-slate-300">Next</span>}
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 break-words text-2xl font-black text-pine-900">{value}</p></article>;
}

function Status({ value }: { value: PlatformInvoiceStatus }) {
  const style = value === PlatformInvoiceStatus.PAID
    ? "bg-emerald-100 text-emerald-800"
    : value === PlatformInvoiceStatus.OVERDUE
      ? "bg-rose-100 text-rose-800"
      : value === PlatformInvoiceStatus.CANCELLED || value === PlatformInvoiceStatus.VOID
        ? "bg-slate-200 text-slate-700"
        : "bg-amber-100 text-amber-900";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${style}`}>{value.replaceAll("_", " ")}</span>;
}
