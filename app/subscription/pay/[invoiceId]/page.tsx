import { PlatformInvoiceStatus } from "@prisma/client";
import { CheckCircle2, CreditCard, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { startPayMongoInvoiceCheckoutAction } from "@/lib/actions/platform-checkout";
import { prisma } from "@/lib/db";
import { payMongoIsConfigured, verifyPlatformInvoicePaymentToken } from "@/lib/services/platform-paymongo";

function money(value: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

export default async function PlatformInvoicePaymentPage({ params, searchParams }: { params: Promise<{ invoiceId: string }>; searchParams: Promise<{ token?: string; result?: string; error?: string }> }) {
  const { invoiceId } = await params;
  const query = await searchParams;
  const token = String(query.token || "");
  if (!verifyPlatformInvoicePaymentToken(invoiceId, token)) notFound();
  const invoice = await prisma.platformInvoice.findUnique({ where: { id: invoiceId }, include: { tenant: { include: { billingProfile: true } }, subscription: { include: { plan: true } }, lines: true } });
  if (!invoice) notFound();
  const paid = invoice.status === PlatformInvoiceStatus.PAID || Number(invoice.outstandingBalance) < 0.01;
  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-14"><div className="mx-auto max-w-2xl">
    <div className="rounded-3xl bg-gradient-to-r from-pine-900 to-pine-600 p-6 text-white shadow-xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-leaf-100">HOAHub secure billing</p><h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">{invoice.tenant.billingProfile?.legalBusinessName || invoice.tenant.name}</h1><p className="mt-2 text-sm font-semibold text-pine-50">Subscription invoice {invoice.invoiceNumber}</p></div><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15 text-white"><ShieldCheck className="size-6" /></span></div></div>
    {query.result === "success" && !paid && <p className="mt-4 rounded-xl bg-blue-50 p-4 text-sm font-semibold text-blue-900">Payment was submitted. HOAHub is waiting for the verified payment confirmation from PayMongo before marking the invoice paid.</p>}
    {query.result === "cancelled" && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">Online checkout was cancelled. No payment was posted.</p>}
    {query.error && <p className="mt-4 rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-900">{query.error}</p>}
    <section className="mt-5 rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold text-slate-500">Amount due</p><p className="mt-1 text-4xl font-black text-pine-900">{money(Number(invoice.outstandingBalance), invoice.currency)}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-black ${paid ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{invoice.status.replaceAll("_", " ")}</span></div>
      <div className="mt-6 grid gap-4 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><Detail label="Plan" value={invoice.subscription.plan.name} /><Detail label="Billing period" value={`${invoice.billingPeriodStart.toLocaleDateString("en-PH")} – ${invoice.billingPeriodEnd.toLocaleDateString("en-PH")}`} /><Detail label="Invoice date" value={invoice.issueDate.toLocaleDateString("en-PH")} /><Detail label="Due date" value={invoice.dueDate.toLocaleDateString("en-PH")} /></div>
      <div className="mt-5 space-y-2">{invoice.lines.map((line) => <div key={line.id} className="flex items-start justify-between gap-4 border-b py-3 text-sm"><div><p className="font-bold">{line.description}</p><p className="text-xs text-slate-500">Qty {line.quantity}</p></div><p className="font-black">{money(Number(line.lineTotal), invoice.currency)}</p></div>)}</div>
      <div className="mt-5 space-y-2 text-sm"><div className="flex justify-between"><span className="text-slate-500">Invoice total</span><span className="font-bold">{money(Number(invoice.total), invoice.currency)}</span></div><div className="flex justify-between"><span className="text-slate-500">Amount paid</span><span className="font-bold">{money(Number(invoice.amountPaid), invoice.currency)}</span></div><div className="flex justify-between border-t pt-3 text-base"><span className="font-black">Outstanding</span><span className="font-black text-pine-900">{money(Number(invoice.outstandingBalance), invoice.currency)}</span></div></div>
      {paid ? <div className="mt-6 flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900"><CheckCircle2 className="mt-0.5 size-5 shrink-0" /><div><p className="font-black">Payment confirmed</p><p className="mt-1 text-sm">This HOAHub subscription invoice is fully paid.</p></div></div> : payMongoIsConfigured() ? <form action={startPayMongoInvoiceCheckoutAction} className="mt-6"><input type="hidden" name="invoiceId" value={invoice.id} /><input type="hidden" name="token" value={token} /><button className="btn-primary flex min-h-14 w-full items-center justify-center gap-2 text-base"><CreditCard className="size-5" />Pay {money(Number(invoice.outstandingBalance), invoice.currency)} online</button><p className="mt-3 text-center text-xs leading-5 text-slate-500">You will complete payment on PayMongo hosted checkout. HOAHub posts payment only after a verified gateway webhook.</p></form> : <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><p className="font-black">Online payment setup pending</p><p className="mt-1">Please contact HOAHub billing support for payment instructions.</p></div>}
    </section>
    <p className="mx-auto mt-5 max-w-xl text-center text-xs leading-5 text-slate-500">This payment link is specific to one HOAHub platform invoice. It does not expose homeowner billing or other tenant data.</p>
  </div></main>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 font-bold text-slate-800">{value}</p></div>;
}
