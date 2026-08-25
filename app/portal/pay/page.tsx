import { StandardTable } from "@/components/standard-table";
import { Paperclip, QrCode, ShieldCheck } from "lucide-react";
import { PayByQrForm } from "@/components/pay-by-qr-form";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";
import { getPaymentSettings } from "@/lib/system-settings";
import { collectionLabel, inputDate, money, monthLabel, shortDate } from "@/lib/utils";

export default async function PortalPayPage() {
  const profile = await requireHomeownerProfile();
  const [paymentSettings, openBills, requests] = await Promise.all([
    getPaymentSettings(profile.tenantId),
    prisma.bill.findMany({ where: { homeownerId: profile.id, balance: { gt: 0 }, archivedAt: null }, include: { paymentRequests: { where: { status: "PENDING_REVIEW" }, select: { id: true } } }, orderBy: [{ dueDate: "asc" }, { billingMonth: "desc" }] }),
    prisma.paymentRequest.findMany({ where: { homeownerId: profile.id }, include: { bill: true, payment: true, collection: true }, orderBy: [{ createdAt: "desc" }] }),
  ]);
  const today = inputDate(new Date());
  const billChoices = openBills.map((bill) => ({ id: bill.id, month: monthLabel(bill.billingMonth), dueDate: shortDate(bill.dueDate), balance: Number(bill.balance), balanceLabel: money(bill.balance), hasPendingRequest: bill.paymentRequests.length > 0 }));

  return <>
    <PageHeader eyebrow="GCash payment" title="Pay by QR code" description="Scan the official HOA QR, send payment to the configured GCash account, then submit your reference number for verification." />
    <section className="mb-6 grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
      <div className="card">
        <div className="mb-4 flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-pine-50 text-pine-700"><QrCode className="size-5" /></span><div><h2 className="text-lg font-black">Official GCash details</h2><p className="text-sm text-slate-500">Verify these details before sending payment.</p></div></div>
        {paymentSettings.gcashQrImageUrl ? <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-3"><img src={paymentSettings.gcashQrImageUrl} alt="Official HOA GCash QR code" className="mx-auto aspect-square max-h-[420px] w-full max-w-[420px] object-contain" /></div> : <div className="grid min-h-72 place-items-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-bold text-slate-600">GCash QR is currently unavailable. Please contact Admin.</div>}
        <dl className="mt-5 grid gap-3 rounded-2xl bg-pine-50/70 p-4 text-sm">
          <div><dt className="font-bold uppercase tracking-wide text-slate-500">Account name</dt><dd className="text-lg font-black text-pine-900">{paymentSettings.gcashAccountName || "Not configured"}</dd></div>
          <div><dt className="font-bold uppercase tracking-wide text-slate-500">Mobile number</dt><dd className="text-lg font-black text-pine-900">{paymentSettings.gcashMobileNumber || "Not configured"}</dd></div>
        </dl>
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900"><p className="font-black">Payment instructions</p><p className="mt-1 whitespace-pre-wrap">{paymentSettings.paymentInstructions || "Pay the exact amount, save the GCash reference number, and submit it using the form beside this QR code."}</p></div>
      </div>

      <div className="grid gap-5">
        <PayByQrForm openBills={billChoices} today={today} />
      </div>
    </section>

    <section className="card">
      <div className="mb-4 flex items-center gap-3"><ShieldCheck className="size-5 text-pine-700" /><div><h2 className="text-lg font-black">My QR payment requests</h2><p className="text-sm text-slate-500">Approved requests automatically create receipts and update your account balance.</p></div></div>
      <div className="table-wrap shadow-none"><StandardTable><table className="data-table"><thead><tr><th>Submitted</th><th>Purpose</th><th>Reference</th><th>Attachment</th><th>Status</th><th>Reviewed</th><th className="text-right">Amount</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td>{shortDate(request.createdAt)}</td><td><p className="font-bold">{request.type === "MONTHLY_DUES" ? `Monthly dues - ${request.bill ? monthLabel(request.bill.billingMonth) : "Bill"}` : collectionLabel(String(request.collectionType), request.description)}</p><p className="text-xs text-slate-400">{request.payerNotes || request.reviewRemarks || ""}</p></td><td className="font-mono text-xs">{request.referenceNumber}</td><td>{request.proofImageUrl ? <a className="inline-flex items-center gap-1 text-xs font-bold text-pine-700" href={request.proofImageUrl} target="_blank" rel="noreferrer"><Paperclip className="size-3" /> With Proof of Payment</a> : <span className="text-xs font-semibold text-slate-400">No Attachment</span>}</td><td><StatusBadge status={request.status} /></td><td>{request.reviewedAt ? shortDate(request.reviewedAt) : "Pending"}</td><td className="text-right font-black">{money(request.amount)}</td></tr>)}{!requests.length && <tr><td colSpan={7} className="py-12 text-center text-slate-500">No QR payment requests submitted yet.</td></tr>}</tbody></table></StandardTable></div>
    </section>
  </>;
}
