import { StandardTable } from "@/components/standard-table";
import Link from "next/link";
import { QrCode, ReceiptText } from "lucide-react";
import { BillRemarks } from "@/components/bill-remarks";
import { PaymentAreaNavigation, PaymentEmptyState, PaymentMetricCard, UnpaidBillingCard } from "@/components/homeowner/payments/payment-cards";
import { PortalPageContainer, PortalSectionHeader } from "@/components/portal-mobile-shell";
import { StatusBadge } from "@/components/status-badge";
import { refreshOverdueBills } from "@/lib/actions/billing";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";
import { money, monthLabel, shortDate } from "@/lib/utils";

const PAGE_SIZE = 12;

export default async function PortalBillingPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const profile = await requireHomeownerProfile();
  const query = await searchParams;
  const page = Math.max(1, Number(query.page || "1") || 1);
  await refreshOverdueBills();
  const where = { tenantId: profile.tenantId, homeownerId: profile.id, archivedAt: null };
  const [bills, totalBills, unpaidCount, unpaidBalance] = await Promise.all([
    prisma.bill.findMany({
      where,
      include: { paymentRequests: { where: { tenantId: profile.tenantId, status: "PENDING_REVIEW" }, select: { id: true } } },
      orderBy: [{ billingMonth: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.bill.count({ where }),
    prisma.bill.count({ where: { ...where, balance: { gt: 0 } } }),
    prisma.bill.aggregate({ where: { ...where, balance: { gt: 0 } }, _sum: { balance: true } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalBills / PAGE_SIZE));

  return (
    <PortalPageContainer className="space-y-6">
      <PaymentAreaNavigation active="billing" />
      <section className="grid gap-3 md:grid-cols-3">
        <PaymentMetricCard label="Unpaid Bills" value={String(unpaidCount)} note="Homeowner-owned billing records" icon={ReceiptText} tone={unpaidCount > 0 ? "warning" : "success"} />
        <PaymentMetricCard label="Unpaid Balance" value={money(unpaidBalance._sum.balance || 0)} note="From tenant-scoped billing records" icon={QrCode} tone={Number(unpaidBalance._sum.balance || 0) > 0 ? "warning" : "success"} />
        <Link href="/portal/pay" className="flex min-h-32 items-center justify-between gap-3 rounded-3xl border border-pine-100 bg-pine-700 p-5 text-white shadow-brand focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">
          <span><span className="block text-sm font-black uppercase tracking-[.14em] text-pine-100">Action</span><span className="mt-2 block text-2xl font-black">Pay by QR</span></span>
          <QrCode className="size-8" aria-hidden="true" />
        </Link>
      </section>

      <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
        <PortalSectionHeader eyebrow={`${totalBills} billing records`} title="Billing History" action={<Pagination page={page} totalPages={totalPages} basePath="/portal/billing" />} />
        <div className="space-y-3 md:hidden">
          {bills.map((bill) => <UnpaidBillingCard key={bill.id} title={bill.recurringChargeType.replaceAll("_", " ")} coverage={monthLabel(bill.billingMonth)} dueDate={shortDate(bill.dueDate)} originalAmount={money(bill.totalAmount)} paidAmount={money(bill.amountPaid)} balance={money(bill.balance)} status={bill.status.replaceAll("_", " ")} selectable={Number(bill.balance) > 0} pending={bill.paymentRequests.length > 0} />)}
          {!bills.length && <PaymentEmptyState title="No billing history" description="Monthly dues and other billing records will appear here after posting." />}
        </div>
        <div className="table-wrap hidden shadow-none md:block">
          <StandardTable><table className="data-table">
            <thead><tr><th>Billing month</th><th>Type</th><th>Remarks</th><th>Due date</th><th>Base dues</th><th>Penalty</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead>
            <tbody>{bills.map((bill) => <tr key={bill.id}><td className="font-bold">{monthLabel(bill.billingMonth)}</td><td>{bill.recurringChargeType.replaceAll("_", " ")}</td><td><BillRemarks notes={bill.notes} /></td><td>{shortDate(bill.dueDate)}</td><td>{money(bill.amount)}</td><td>{money(bill.penalty)}</td><td>{money(bill.amountPaid)}</td><td className="font-black">{money(bill.balance)}</td><td><StatusBadge status={bill.status} /></td><td>{Number(bill.balance) > 0 && <Link className="btn-secondary min-h-8 px-3 py-1" href="/portal/pay"><QrCode className="size-4" /> Pay</Link>}</td></tr>)}{!bills.length && <tr><td colSpan={10} className="py-12 text-center text-slate-500">No billing history yet.</td></tr>}</tbody>
          </table></StandardTable>
        </div>
      </section>
    </PortalPageContainer>
  );
}

function Pagination({ page, totalPages, basePath }: { page: number; totalPages: number; basePath: string }) {
  if (totalPages <= 1) return null;
  return <div className="flex gap-2 text-sm font-black"><Link aria-disabled={page <= 1} className={`rounded-xl px-3 py-2 ${page <= 1 ? "pointer-events-none bg-slate-100 text-slate-400" : "bg-pine-50 text-pine-700"}`} href={`${basePath}?page=${page - 1}`}>Prev</Link><span className="rounded-xl bg-slate-100 px-3 py-2 text-slate-600">{page}/{totalPages}</span><Link aria-disabled={page >= totalPages} className={`rounded-xl px-3 py-2 ${page >= totalPages ? "pointer-events-none bg-slate-100 text-slate-400" : "bg-pine-50 text-pine-700"}`} href={`${basePath}?page=${page + 1}`}>Next</Link></div>;
}
