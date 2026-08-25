import Link from "next/link";
import { CreditCard, Paperclip, Printer, Search } from "lucide-react";
import { PaymentAreaNavigation, PaymentEmptyState, PaymentHistoryCard, PaymentMetricCard } from "@/components/homeowner/payments/payment-cards";
import { PortalPageContainer, PortalSectionHeader } from "@/components/portal-mobile-shell";
import { prisma } from "@/lib/db";
import { paymentAllocationCoverageLabel } from "@/lib/payment-coverage";
import { paymentAppliedAmount, paymentUnappliedCredit } from "@/lib/payment-credit";
import { requireHomeownerProfile } from "@/lib/portal";
import { money, shortDate } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE = 10;

export default async function PortalPaymentsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; status?: string; method?: string; from?: string; to?: string }> }) {
  const profile = await requireHomeownerProfile();
  const query = await searchParams;
  const page = Math.max(1, Number(query.page || "1") || 1);
  const where = paymentWhere(profile.tenantId, profile.id, query);
  const [payments, totalPayments, activeSummary] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { bill: true, allocations: { include: { bill: true }, orderBy: { bill: { billingMonth: "asc" } } } },
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where: { tenantId: profile.tenantId, homeownerId: profile.id, status: "ACTIVE" },
      include: { allocations: true },
      orderBy: [{ paymentDate: "desc" }],
      take: 50,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalPayments / PAGE_SIZE));
  const latest = activeSummary[0];

  return (
    <PortalPageContainer className="space-y-6">
      <PaymentAreaNavigation active="payments" />
      <section className="grid gap-3 md:grid-cols-3">
        <PaymentMetricCard label="Receipts" value={String(totalPayments)} note="Filtered payment records" icon={CreditCard} href="#receipts" />
        <PaymentMetricCard label="Latest Payment" value={latest ? money(latest.amount) : "None"} note={latest ? shortDate(latest.paymentDate) : "No recorded payment"} icon={Printer} tone={latest ? "success" : "default"} href={latest ? `/receipts/payment/${latest.id}` : "#receipts"} />
        <PaymentMetricCard label="Recent Credit" value={money(activeSummary.reduce((sum, payment) => sum + paymentUnappliedCredit(payment), 0))} note="From recent active payments" icon={CreditCard} tone="info" href="/portal/soa" />
      </section>

      <section id="receipts" className="scroll-mt-28 rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
        <PortalSectionHeader eyebrow="Search and filter" title="Payment History" />
        <form className="grid gap-3 md:grid-cols-5" action="/portal/payments">
          <label className="md:col-span-2"><span className="label">Search receipt or reference</span><input className="field min-h-12" name="q" defaultValue={query.q || ""} placeholder="Receipt, reference, remarks" /></label>
          <label><span className="label">Status</span><select className="field min-h-12" name="status" defaultValue={query.status || ""}><option value="">All</option><option value="ACTIVE">Active</option><option value="VOIDED">Void</option></select></label>
          <label><span className="label">Method</span><select className="field min-h-12" name="method" defaultValue={query.method || ""}><option value="">All</option><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CHECK">Check</option><option value="OTHER">Other</option></select></label>
          <div className="flex items-end"><button className="btn-primary min-h-12 w-full" type="submit"><Search className="size-4" /> Apply</button></div>
          <label><span className="label">From</span><input className="field min-h-12" name="from" type="date" defaultValue={query.from || ""} /></label>
          <label><span className="label">To</span><input className="field min-h-12" name="to" type="date" defaultValue={query.to || ""} /></label>
        </form>
      </section>

      <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
        <PortalSectionHeader eyebrow={`${totalPayments} matching records`} title="Digital Receipts" action={<Pagination page={page} totalPages={totalPages} query={query} />} />
        <div className="space-y-3 md:hidden">
          {payments.map((payment) => <PaymentHistoryCard key={payment.id} href={`/receipts/payment/${payment.id}`} receipt={payment.receiptNumber || "Legacy receipt"} amount={money(payment.amount)} date={shortDate(payment.paymentDate)} method={payment.method.replaceAll("_", " ")} reference={payment.referenceNumber || "Not required"} coverage={paymentAllocationCoverageLabel(payment)} status={payment.status} />)}
          {!payments.length && <PaymentEmptyState title="No payment history" description="Approved QR requests and HOA-recorded payments will appear here." />}
        </div>
        <div className="table-wrap hidden shadow-none md:block">
          <table className="data-table">
            <thead><tr><th>Receipt / reference</th><th>Payment Coverage</th><th>Date</th><th>Method</th><th>Remarks</th><th>Proof</th><th className="text-right">Received</th><th className="text-right">Applied</th><th className="text-right">Credit</th><th></th></tr></thead>
            <tbody>
              {payments.map((payment) => <tr key={payment.id}><td><p className="font-mono text-xs font-bold text-pine-700">{payment.receiptNumber || "Legacy receipt"}</p><p className="font-mono text-[10px] text-slate-400">Ref: {payment.referenceNumber || "Not required"}</p></td><td className="font-bold">{paymentAllocationCoverageLabel(payment)}</td><td>{shortDate(payment.paymentDate)}</td><td>{payment.method.replaceAll("_", " ")}</td><td className="max-w-xs whitespace-pre-wrap text-slate-500">{payment.remarks || "-"}</td><td>{payment.proofUrl ? <a className="inline-flex items-center gap-1 text-xs font-bold text-pine-700" href={payment.proofUrl} target="_blank" rel="noreferrer"><Paperclip className="size-3" /> With Proof of Payment</a> : <span className="text-xs font-semibold text-slate-400">No Attachment</span>}</td><td className="text-right font-black text-pine-700">{money(payment.amount)}</td><td className="text-right">{money(paymentAppliedAmount(payment))}</td><td className="text-right">{money(paymentUnappliedCredit(payment))}</td><td><Link className="btn-secondary min-h-8 px-3 py-1" href={`/receipts/payment/${payment.id}`} target="_blank"><Printer className="size-4" /> Receipt</Link></td></tr>)}
              {!payments.length && <tr><td colSpan={10} className="py-12 text-center text-slate-500">No payments match your filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </PortalPageContainer>
  );
}

function paymentWhere(tenantId: string, homeownerId: string, query: { q?: string; status?: string; method?: string; from?: string; to?: string }): Prisma.PaymentWhereInput {
  const where: Prisma.PaymentWhereInput = { tenantId, homeownerId };
  if (query.status === "ACTIVE" || query.status === "VOIDED") where.status = query.status;
  if (["CASH", "BANK_TRANSFER", "GCASH", "CHECK", "OTHER"].includes(query.method || "")) where.method = query.method as never;
  if (query.from || query.to) {
    where.paymentDate = {
      ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
      ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
    };
  }
  const q = query.q?.trim();
  if (q) {
    where.OR = [
      { receiptNumber: { contains: q } },
      { referenceNumber: { contains: q } },
      { remarks: { contains: q } },
    ];
  }
  return where;
}

function Pagination({ page, totalPages, query }: { page: number; totalPages: number; query: Record<string, string | undefined> }) {
  if (totalPages <= 1) return null;
  const href = (nextPage: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value && key !== "page") params.set(key, value);
    params.set("page", String(nextPage));
    return `/portal/payments?${params.toString()}`;
  };
  return <div className="flex gap-2 text-sm font-black"><Link aria-disabled={page <= 1} className={`rounded-xl px-3 py-2 ${page <= 1 ? "pointer-events-none bg-slate-100 text-slate-400" : "bg-pine-50 text-pine-700"}`} href={href(page - 1)}>Prev</Link><span className="rounded-xl bg-slate-100 px-3 py-2 text-slate-600">{page}/{totalPages}</span><Link aria-disabled={page >= totalPages} className={`rounded-xl px-3 py-2 ${page >= totalPages ? "pointer-events-none bg-slate-100 text-slate-400" : "bg-pine-50 text-pine-700"}`} href={href(page + 1)}>Next</Link></div>;
}
