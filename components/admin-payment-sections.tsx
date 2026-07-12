import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Eye, History, Paperclip, Printer, Save } from "lucide-react";
import { PaymentRequestType } from "@prisma/client";
import { PaymentForm } from "@/components/payment-form";
import { PaymentVoidForm } from "@/components/payment-void-form";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/ui";
import { approvePaymentRequestAction, rejectPaymentRequestAction } from "@/lib/actions/payment-requests";
import { updatePaymentAmountAction } from "@/lib/actions/payments";
import { paymentAllocationCoverageLabel, paymentCoverageLabel } from "@/lib/payment-coverage";
import { paymentUnappliedCredit } from "@/lib/payment-credit";
import { collectionLabel, inputDate, money, shortDate } from "@/lib/utils";
import { getActivePaymentsData, getPaymentHistoryData, getPaymentRequestsData, getRecordPaymentData, paymentPageSize, preservedEntries, recordBillPageSize, type PaymentQuery } from "@/lib/services/admin-payments";

type HomeownerFilter = { id: string; block: string; lot: string; user: { name: string } };

export function PaymentsNav() {
  const items = [
    ["/admin/payments/record", "Record Payment"],
    ["/admin/payments/requests", "Payment Requests"],
    ["/admin/payments/active", "Active Payments"],
    ["/admin/payments/history", "Transaction History"],
  ] as const;
  return <nav className="mb-4 flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 text-sm font-black shadow-sm">
    {items.map(([href, label]) => <Link key={href} className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" href={href}>{label}</Link>)}
  </nav>;
}

export function RecordPaymentView({ data, query }: { data: Awaited<ReturnType<typeof getRecordPaymentData>>; query: PaymentQuery }) {
  return <>
    <SearchPanel action="/admin/payments/record" q={data.q} placeholder="Search name, block, lot, account, email, resolution, or bill ID" />
    <PaymentForm bills={data.billChoices} today={inputDate(new Date())} submissionKey={randomUUID()} serverSearch />
    <p className="mb-3 text-xs font-semibold text-slate-500">Record Payment intentionally shows homeowners with open balances only. Search runs server-side across the authenticated tenant.</p>
    <Pager page={data.billPage} count={data.openBillCount} pageSize={recordBillPageSize} pageKey="billPage" preserved={preservedEntries(query, ["billPage"])} basePath="/admin/payments/record" />
  </>;
}

export function PaymentRequestsView({ data, query }: { data: Awaited<ReturnType<typeof getPaymentRequestsData>>; query: PaymentQuery }) {
  return <>
    <PaymentFilterPanel action="/admin/payments/requests" query={query} homeowners={data.homeowners} includeRequestFilters />
    <section className="card mb-6">
      <div className="mb-4"><h2 className="text-lg font-black">Payment requests</h2><p className="text-sm text-slate-500">Review homeowner-submitted GCash references. Approval creates an official receipt and updates dues or other collections.</p></div>
      <div className="table-wrap shadow-none"><table className="data-table"><thead><tr><th>Homeowner</th><th>Purpose</th><th>Reference</th><th>Attachment</th><th>Status</th><th>Submitted</th><th className="text-right">Amount</th><th></th></tr></thead><tbody>
        {data.paymentRequests.map((request) => <tr key={request.id}><td><p className="font-bold">{request.homeowner.user.name}</p><p className="text-xs text-slate-400">B{request.homeowner.block} L{request.homeowner.lot}</p></td><td><p className="font-bold">{request.type === PaymentRequestType.MONTHLY_DUES ? `Monthly dues - ${request.bill ? request.bill.billingMonth.toLocaleDateString("en-PH", { month: "long", year: "numeric" }) : "Bill"}` : collectionLabel(String(request.collectionType), request.description)}</p><p className="max-w-xs truncate text-xs text-slate-400">{request.payerNotes || request.reviewRemarks || "-"}</p></td><td><p className="font-mono text-xs">{request.referenceNumber}</p><Link className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-pine-700" href={`/admin/payments/requests/${request.id}`}><Eye className="size-3" /> Details</Link></td><td>{request.proofImageUrl ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"><Paperclip className="size-3" /> With Proof of Payment</span> : <span className="text-xs font-semibold text-slate-400">No Attachment</span>}</td><td><StatusBadge status={request.status} /></td><td>{shortDate(request.createdAt)}</td><td className="text-right font-black">{money(request.amount)}</td><td>{request.status === "PENDING_REVIEW" ? <div className="flex min-w-56 flex-col gap-2"><form action={approvePaymentRequestAction} className="space-y-2"><input type="hidden" name="id" value={request.id} /><input className="field min-h-9 py-1 text-xs" name="reviewRemarks" placeholder="Approval note optional" /><SubmitButton className="btn-primary w-full min-h-8 px-3 py-1 text-xs">Approve as paid</SubmitButton></form><form action={rejectPaymentRequestAction} className="space-y-2"><input type="hidden" name="id" value={request.id} /><input className="field min-h-9 py-1 text-xs" name="reviewRemarks" placeholder="Reason for rejection" /><SubmitButton className="btn-danger w-full min-h-8 px-3 py-1 text-xs">Reject</SubmitButton></form></div> : <div className="flex justify-end">{request.payment?.status === "ACTIVE" && <Link className="btn-secondary min-h-8 px-3 py-1" href={`/receipts/payment/${request.payment.id}`} target="_blank"><Printer className="size-4" /> Receipt</Link>}{request.collectionId && <Link className="btn-secondary min-h-8 px-3 py-1" href={`/receipts/collection/${request.collectionId}`} target="_blank"><Printer className="size-4" /> Receipt</Link>}</div>}</td></tr>)}
        {!data.paymentRequests.length && <tr><td colSpan={8} className="py-12 text-center text-slate-500">No payment requests found.</td></tr>}
      </tbody></table></div>
    </section>
    <Pager page={data.requestPage} count={data.requestCount} pageSize={paymentPageSize} pageKey="requestPage" preserved={preservedEntries(query, ["requestPage"])} basePath="/admin/payments/requests" />
  </>;
}

export function ActivePaymentsView({ data, query }: { data: Awaited<ReturnType<typeof getActivePaymentsData>>; query: PaymentQuery }) {
  return <>
    <PaymentFilterPanel action="/admin/payments/active" query={query} homeowners={data.homeowners} includePaymentFilters />
    <p className="mb-4 text-sm font-bold text-pine-800">Unapplied credit in these active payments: {money(data.payments.reduce((sum, payment) => sum + paymentUnappliedCredit(payment), 0))}</p>
    <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-black">Active payment records</h2><p className="text-sm text-slate-500">Controlled amount updates are audited. Use Void to remove a transaction from active financial totals.</p></div></section>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Receipt / reference</th><th>Homeowner</th><th>Payment Coverage</th><th>Payment date</th><th>Method</th><th>Proof</th><th>Controlled amount update</th><th>Actions</th></tr></thead><tbody>
      {data.payments.map((payment) => <tr key={payment.id}><td><p className="font-mono text-xs font-bold text-pine-700">{payment.receiptNumber || payment.id.slice(-8).toUpperCase()}</p><p className="font-mono text-[10px] text-slate-400">Ref: {payment.referenceNumber || "Not required"}</p></td><td className="font-bold">{payment.homeowner.user.name}</td><td><p className="font-bold">{paymentAllocationCoverageLabel(payment)}</p><p className="text-xs text-slate-400">{payment.allocations.length || (payment.bill ? 1 : 0)} bill allocation(s)</p></td><td>{shortDate(payment.paymentDate)}</td><td>{payment.method.replaceAll("_", " ")}</td><td>{payment.proofUrl ? <a className="inline-flex items-center gap-1 text-xs font-bold text-pine-700" href={payment.proofUrl} target="_blank" rel="noreferrer"><Paperclip className="size-3" /> With Proof of Payment</a> : <span className="text-xs font-semibold text-slate-400">No Attachment</span>}</td><td><form action={updatePaymentAmountAction} className="grid min-w-64 gap-2 sm:grid-cols-[7rem_1fr_auto]"><input type="hidden" name="id" value={payment.id} /><label className="sr-only" htmlFor={`payment-amount-${payment.id}`}>Payment amount for {payment.homeowner.user.name}</label><input id={`payment-amount-${payment.id}`} className="field min-h-9 py-1 text-right font-black text-pine-700" name="amount" type="number" min="0.01" step="0.01" defaultValue={Number(payment.amount).toFixed(2)} required /><input className="field min-h-9 py-1 text-xs" name="reason" maxLength={500} placeholder="Update reason (optional)" /><SubmitButton className="btn-secondary min-h-9 px-3 py-1 text-xs"><Save className="size-3.5" /> Save</SubmitButton></form></td><td><div className="flex min-w-40 flex-col gap-2"><Link className="btn-secondary min-h-8 px-3 py-1" href={`/receipts/payment/${payment.id}`} target="_blank"><Printer className="size-4" /> Receipt</Link><PaymentVoidForm paymentId={payment.id} /></div></td></tr>)}
      {!data.payments.length && <tr><td colSpan={8} className="py-12 text-center text-slate-500">No active payments found.</td></tr>}
    </tbody></table></div>
    <Pager page={data.paymentPage} count={data.paymentCount} pageSize={paymentPageSize} pageKey="paymentPage" preserved={preservedEntries(query, ["paymentPage"])} basePath="/admin/payments/active" />
  </>;
}

export function PaymentHistoryView({ data, query }: { data: Awaited<ReturnType<typeof getPaymentHistoryData>>; query: PaymentQuery }) {
  return <>
    <PaymentFilterPanel action="/admin/payments/history" query={query} homeowners={data.homeowners} includePaymentFilters />
    <p className="text-sm font-bold text-slate-600">Voided unapplied credit in this history: {money(data.paymentArchives.reduce((sum, payment) => sum + paymentUnappliedCredit(payment), 0))}</p>
    <section className="card mt-6">
      <div className="mb-4 flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-600"><History className="size-5" /></span><div><h2 className="text-lg font-black">Transaction history</h2><p className="text-sm text-slate-500">Voided transactions remain archived for audit/reference and are excluded from active payments, receipts, billing totals, and financial reports.</p></div></div>
      <div className="table-wrap shadow-none"><table className="data-table"><thead><tr><th>Original transaction</th><th>Payment Coverage / account</th><th>Homeowner</th><th>Payment details</th><th>Proof</th><th>Voided by</th><th>Reason</th></tr></thead><tbody>
        {data.paymentArchives.map((item) => <tr key={item.id}><td><p className="font-mono text-xs">{item.originalPaymentId}</p><p className="text-xs text-slate-400">Receipt {item.receiptNumber || "-"}</p></td><td><p className="font-bold">{item.allocations.length ? paymentAllocationCoverageLabel(item) : paymentCoverageLabel(item)}</p><p className="text-xs text-slate-400">{item.property} | {item.allocations.length || 1} allocation(s)</p></td><td>{item.homeownerName}</td><td><p className="font-black text-rose-700">{money(item.amount)}</p><p className="text-xs text-slate-500">{shortDate(item.paymentDate)} - {item.method.replaceAll("_", " ")}</p><p className="font-mono text-xs text-slate-400">{item.referenceNumber || "No reference required"}</p></td><td>{item.proofUrl ? <a className="inline-flex items-center gap-1 text-xs font-bold text-pine-700" href={item.proofUrl} target="_blank" rel="noreferrer"><Paperclip className="size-3" /> Archived proof</a> : <span className="text-xs text-slate-400">No attachment</span>}</td><td><p className="font-bold">{item.voidedBy.name}</p><p className="text-xs text-slate-400">{shortDate(item.voidedAt)}</p></td><td className="max-w-xs whitespace-pre-wrap text-sm">{item.voidReason || "No reason supplied."}</td></tr>)}
        {!data.paymentArchives.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">No transaction history found.</td></tr>}
      </tbody></table></div>
    </section>
    <Pager page={data.historyPage} count={data.archiveCount} pageSize={paymentPageSize} pageKey="historyPage" preserved={preservedEntries(query, ["historyPage"])} basePath="/admin/payments/history" />
  </>;
}

function SearchPanel({ action, q, placeholder }: { action: string; q: string; placeholder: string }) {
  return <form action={action} className="card mb-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
    <input className="field" type="search" name="q" defaultValue={q} placeholder={placeholder} />
    <div className="flex gap-2"><button className="btn-primary">Search</button><Link className="btn-secondary" href={action}>Clear</Link></div>
  </form>;
}

function PaymentFilterPanel({ action, query, homeowners, includeRequestFilters = false, includePaymentFilters = false }: { action: string; query: PaymentQuery; homeowners: HomeownerFilter[]; includeRequestFilters?: boolean; includePaymentFilters?: boolean }) {
  return <form action={action} className="card mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <input className="field" type="search" name="q" defaultValue={query.q || ""} placeholder="OR, receipt, transaction, reference, homeowner, block or lot" />
    <select className="field" name="homeownerId" defaultValue={query.homeownerId || ""}><option value="">All homeowners</option>{homeowners.map((item) => <option key={item.id} value={item.id}>{item.user.name} - B{item.block} L{item.lot}</option>)}</select>
    {includeRequestFilters && <select className="field" name="status" defaultValue={query.status || ""}><option value="">All request statuses</option><option value="PENDING_REVIEW">Pending review</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select>}
    {includeRequestFilters && <select className="field" name="paymentType" defaultValue={query.paymentType || ""}><option value="">All payment types</option><option value="MONTHLY_DUES">Monthly dues</option><option value="OTHER_COLLECTION">Other collection</option></select>}
    {includeRequestFilters && <select className="field" name="collectionType" defaultValue={query.collectionType || ""}><option value="">All collection types</option>{["GATE_PASS","STICKER","MEMBERSHIP","CONSTRUCTION_BOND","CONTRACTOR_BOND","OTHER"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select>}
    {includePaymentFilters && <select className="field" name="method" defaultValue={query.method || ""}><option value="">All payment methods</option>{["CASH","BANK_TRANSFER","GCASH","CHECK","OTHER"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select>}
    <input className="field" type="date" name="dateFrom" defaultValue={query.dateFrom} aria-label="Date from" />
    <input className="field" type="date" name="dateTo" defaultValue={query.dateTo} aria-label="Date to" />
    {includePaymentFilters && <select className="field" name="sort" defaultValue={query.sort || "newest"}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount_high">Highest amount</option></select>}
    <div className="flex gap-2"><button className="btn-primary">Apply filters</button><Link className="btn-secondary" href={action}>Clear</Link></div>
  </form>;
}

function Pager({ page, count, pageSize, pageKey, preserved, basePath }: { page: number; count: number; pageSize: number; pageKey: string; preserved: string[][]; basePath: string }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages <= 1) return null;
  const url = (target: number) => {
    const params = new URLSearchParams(preserved);
    params.set(pageKey, String(target));
    return `${basePath}?${params}`;
  };
  return <nav className="my-4 flex items-center justify-between gap-3 text-sm"><Link className={`btn-secondary ${page <= 1 ? "pointer-events-none opacity-50" : ""}`} href={url(page - 1)}>Previous</Link><span className="font-bold">Page {page} of {pages} | {count} records</span><Link className={`btn-secondary ${page >= pages ? "pointer-events-none opacity-50" : ""}`} href={url(page + 1)}>Next</Link></nav>;
}
