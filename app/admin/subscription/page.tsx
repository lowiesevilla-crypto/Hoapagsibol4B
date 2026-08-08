import { PlatformInvoiceStatus, Role } from "@prisma/client";
import { CreditCard, Download, ExternalLink, FileText, ReceiptText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  platformInvoiceDocumentUrl,
  platformInvoicePdfUrl,
} from "@/lib/services/platform-invoice-document";
import { platformInvoicePaymentUrl } from "@/lib/services/platform-paymongo";

function money(value: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

const payableStatuses = [
  PlatformInvoiceStatus.OPEN,
  PlatformInvoiceStatus.PARTIALLY_PAID,
  PlatformInvoiceStatus.OVERDUE,
];

export default async function TenantSubscriptionPage() {
  const user = await requireUser(Role.ADMIN);
  const [tenant, subscription, invoices, payments, receivables] = await Promise.all([
    prisma.tenant.findFirst({
      where: { id: user.tenantId },
      include: { billingProfile: true },
    }),
    prisma.tenantSubscription.findFirst({
      where: {
        tenantId: user.tenantId,
        status: { notIn: ["CANCELLED", "EXPIRED"] },
      },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.platformInvoice.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { issueDate: "desc" },
      take: 36,
    }),
    prisma.platformPayment.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { receivedAt: "desc" },
      take: 12,
    }),
    prisma.platformInvoice.aggregate({
      where: {
        tenantId: user.tenantId,
        status: { in: payableStatuses },
      },
      _sum: { outstandingBalance: true },
    }),
  ]);

  if (!tenant) return null;
  const outstanding = Number(receivables._sum.outstandingBalance || 0);
  const currency = subscription?.currency || tenant.currency;
  const nextInvoice = invoices.find((invoice) => payableStatuses.includes(invoice.status));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-leaf-700">Account</p>
          <h1 className="text-3xl font-black text-slate-950">HOAHub Subscription</h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Review your HOA&apos;s HOAHub service plan, platform invoices, and payment history. This page is separate from homeowner dues and HOA collections.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-pine-50 px-4 py-2 text-sm font-black text-pine-900">
          <ShieldCheck className="size-4" /> Secure tenant billing
        </span>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Current plan" value={subscription?.plan.name || tenant.subscriptionPlan || "Not assigned"} />
        <Metric label="Subscription status" value={(subscription?.status || tenant.subscriptionStatus).replaceAll("_", " ")} />
        <Metric label="Outstanding balance" value={money(outstanding, currency)} />
        <Metric label="Next billing" value={subscription?.nextBillingDate?.toLocaleDateString("en-PH") || "Not scheduled"} />
      </section>

      {nextInvoice && (
        <section className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-blue-700">Payment due</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">{nextInvoice.invoiceNumber}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {money(Number(nextInvoice.outstandingBalance), nextInvoice.currency)} due {nextInvoice.dueDate.toLocaleDateString("en-PH")}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="btn-secondary inline-flex items-center gap-2" href={platformInvoiceDocumentUrl(nextInvoice.id)} target="_blank">
                <FileText className="size-4" /> View invoice
              </Link>
              <Link className="btn-primary inline-flex items-center gap-2" href={platformInvoicePaymentUrl(nextInvoice.id)} target="_blank">
                <CreditCard className="size-4" /> View &amp; Pay
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="mt-6 rounded-2xl border bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Subscription details</h2>
            <p className="mt-1 text-sm text-slate-500">Commercial terms are maintained by HOAHub Platform Administration.</p>
          </div>
          <ReceiptText className="size-6 text-pine-600" />
        </div>
        <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Billing frequency" value={subscription?.billingFrequency || "—"} />
          <Detail label="Current period" value={subscription?.currentPeriodStart && subscription?.currentPeriodEnd ? `${subscription.currentPeriodStart.toLocaleDateString("en-PH")} – ${subscription.currentPeriodEnd.toLocaleDateString("en-PH")}` : "—"} />
          <Detail label="Billing email" value={tenant.billingProfile?.billingEmail || tenant.email || "Not configured"} />
          <Detail label="AutoPay" value={subscription?.autoPayEnabled ? "Enabled" : "Not enabled"} />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-5 sm:p-6">
        <h2 className="text-xl font-black">Platform invoices</h2>
        <p className="mt-1 text-sm text-slate-500">Only HOAHub subscription invoices for this tenant are shown here. Every issued invoice can be printed or downloaded as PDF.</p>
        <div className="mt-5 overflow-auto">
          <table className="min-w-[1040px] w-full text-sm">
            <thead className="bg-slate-50 text-left"><tr><th className="p-3">Invoice</th><th className="p-3">Billing period</th><th className="p-3">Due</th><th className="p-3">Total</th><th className="p-3">Paid</th><th className="p-3">Balance</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
            <tbody>{invoices.map((invoice) => {
              const payable = payableStatuses.includes(invoice.status) && Number(invoice.outstandingBalance) > 0;
              return <tr key={invoice.id} className="border-t align-top">
                <td className="p-3 font-black">{invoice.invoiceNumber}</td>
                <td className="p-3">{invoice.billingPeriodStart.toLocaleDateString("en-PH")} – {invoice.billingPeriodEnd.toLocaleDateString("en-PH")}</td>
                <td className="p-3">{invoice.dueDate.toLocaleDateString("en-PH")}</td>
                <td className="p-3 font-bold">{money(Number(invoice.total), invoice.currency)}</td>
                <td className="p-3">{money(Number(invoice.amountPaid), invoice.currency)}</td>
                <td className="p-3 font-black">{money(Number(invoice.outstandingBalance), invoice.currency)}</td>
                <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${invoice.status === PlatformInvoiceStatus.PAID ? "bg-emerald-100 text-emerald-800" : invoice.status === PlatformInvoiceStatus.OVERDUE ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}>{invoice.status.replaceAll("_", " ")}</span></td>
                <td className="p-3">
                  <div className="flex flex-col items-start gap-2">
                    <Link className="inline-flex items-center gap-1 font-black text-blue-700 hover:underline" href={platformInvoiceDocumentUrl(invoice.id)} target="_blank">View / Print <ExternalLink className="size-3" /></Link>
                    <a className="inline-flex items-center gap-1 font-black text-pine-700 hover:underline" href={platformInvoicePdfUrl(invoice.id)}><Download className="size-3" /> Download PDF</a>
                    {payable && <Link className="inline-flex items-center gap-1 font-black text-amber-700 hover:underline" href={platformInvoicePaymentUrl(invoice.id)} target="_blank"><CreditCard className="size-3" /> View &amp; Pay</Link>}
                  </div>
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {!invoices.length && <p className="mt-5 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No HOAHub subscription invoices yet.</p>}
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-5 sm:p-6">
        <h2 className="text-xl font-black">Payment history</h2>
        <div className="mt-4 space-y-3">
          {payments.map((payment) => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm"><div><p className="font-black">{payment.paymentReference}</p><p className="mt-1 text-xs text-slate-500">{payment.gateway} · {payment.method.replaceAll("_", " ")} · {payment.status.replaceAll("_", " ")}</p></div><div className="text-right"><p className="font-black text-pine-900">{money(Number(payment.amount), payment.currency)}</p><p className="mt-1 text-xs text-slate-500">{(payment.paidAt || payment.receivedAt).toLocaleString("en-PH")}</p></div></div>)}
          {!payments.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No HOAHub subscription payments recorded.</p>}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 break-words text-2xl font-black text-pine-900">{value}</p></article>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 break-words font-bold text-slate-800">{value}</p></div>;
}
