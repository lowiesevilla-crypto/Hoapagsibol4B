import { Paperclip, QrCode, ShieldCheck } from "lucide-react";
import { PayByQrForm } from "@/components/pay-by-qr-form";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";
import { getAssociationSettings, getPaymentSettings } from "@/lib/system-settings";
import { canSubmitDocumentFeePayment, documentFeePaymentPurpose, documentFeePaymentStatusLabel, documentRequestPublicReference } from "@/lib/services/document-fee-payments";
import { documentTypeLabel } from "@/lib/services/documents";
import { collectionLabel, inputDate, money, monthLabel, shortDate } from "@/lib/utils";

export default async function PortalPayPage({ searchParams }: { searchParams: Promise<{ documentRequestId?: string; error?: string; success?: string; message?: string }> }) {
  const profile = await requireHomeownerProfile();
  const query = await searchParams;
  const [association, paymentSettings, openBills, requests, selectedDocumentRequest] = await Promise.all([
    getAssociationSettings(profile.tenantId),
    getPaymentSettings(profile.tenantId),
    prisma.bill.findMany({ where: { tenantId: profile.tenantId, homeownerId: profile.id, balance: { gt: 0 }, archivedAt: null }, include: { paymentRequests: { where: { tenantId: profile.tenantId, status: "PENDING_REVIEW" }, select: { id: true } } }, orderBy: [{ dueDate: "asc" }, { billingMonth: "desc" }] }),
    prisma.paymentRequest.findMany({ where: { tenantId: profile.tenantId, homeownerId: profile.id }, include: { bill: true, payment: true, collection: true, documentRequest: { include: { definition: true } } }, orderBy: [{ createdAt: "desc" }] }),
    query.documentRequestId ? prisma.documentRequest.findFirst({ where: { tenantId: profile.tenantId, homeownerId: profile.id, id: query.documentRequestId, archivedAt: null }, include: { definition: true, configuration: true, paymentRequest: { include: { collection: true } } } }) : Promise.resolve(null),
  ]);
  const today = inputDate(new Date());
  const billChoices = openBills.map((bill) => ({ id: bill.id, month: monthLabel(bill.billingMonth), dueDate: shortDate(bill.dueDate), balance: Number(bill.balance), balanceLabel: money(bill.balance), hasPendingRequest: bill.paymentRequests.length > 0 }));
  const selectedDocumentType = selectedDocumentRequest ? selectedDocumentRequest.definition?.displayName || selectedDocumentRequest.configuration?.displayName || documentTypeLabel(selectedDocumentRequest.type) : "";
  const selectedRequestReference = selectedDocumentRequest ? documentRequestPublicReference(selectedDocumentRequest) : "";
  const selectedDocumentPayment = selectedDocumentRequest && canSubmitDocumentFeePayment(selectedDocumentRequest) ? {
    documentRequestId: selectedDocumentRequest.id,
    documentType: selectedDocumentType,
    requestReference: selectedRequestReference,
    amountLabel: money(selectedDocumentRequest.feeAmountSnapshot),
    purpose: documentFeePaymentPurpose({ documentType: selectedDocumentType, requestReference: selectedRequestReference }),
    statusLabel: documentFeePaymentStatusLabel(selectedDocumentRequest),
  } : null;

  return <>
    <PageHeader eyebrow="GCash payment" title="Pay by QR code" description="Scan the official HOA QR, send payment to the configured GCash account, then submit your reference number for verification." />
    {query.error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{query.error}</div>}
    {query.success && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{query.message || "Payment request submitted."}</div>}
    <section className="mb-6 grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
      <div className="card">
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          {association.logoUrl ? <img src={association.logoUrl} alt={`${association.name} logo`} className="size-12 rounded-xl object-contain" /> : <span className="grid size-12 place-items-center rounded-xl bg-pine-100 text-sm font-black text-pine-800">HOA</span>}
          <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tenant payment account</p><p className="font-black text-slate-950">{association.name}</p></div>
        </div>
        <div className="mb-4 flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-pine-50 text-pine-700"><QrCode className="size-5" /></span><div><h2 className="text-lg font-black">Official GCash details</h2><p className="text-sm text-slate-500">Verify these details before sending payment.</p></div></div>
        {paymentSettings.gcashQrImageUrl ? <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-3"><img src={paymentSettings.gcashQrImageUrl} alt="Official HOA GCash QR code" className="mx-auto aspect-square max-h-[420px] w-full max-w-[420px] object-contain" /></div> : <div className="grid min-h-72 place-items-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-bold text-slate-600">GCash QR is currently unavailable. Please contact Admin.</div>}
        <dl className="mt-5 grid gap-3 rounded-2xl bg-pine-50/70 p-4 text-sm">
          <div><dt className="font-bold uppercase tracking-wide text-slate-500">Account name</dt><dd className="text-lg font-black text-pine-900">{paymentSettings.gcashAccountName || "Not configured"}</dd></div>
          <div><dt className="font-bold uppercase tracking-wide text-slate-500">Mobile number</dt><dd className="text-lg font-black text-pine-900">{paymentSettings.gcashMobileNumber || "Not configured"}</dd></div>
        </dl>
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900"><p className="font-black">Payment instructions</p><p className="mt-1 whitespace-pre-wrap">{paymentSettings.paymentInstructions || "Pay the exact amount, save the GCash reference number, and submit it using the form beside this QR code."}</p></div>
      </div>

      <div className="grid gap-5">
        {query.documentRequestId && !selectedDocumentRequest ? <DocumentPaymentNotice title="Document request unavailable" message="This document request was not found for your homeowner account." /> : selectedDocumentRequest && !selectedDocumentPayment ? <DocumentPaymentNotice title={documentFeePaymentStatusLabel(selectedDocumentRequest)} message={selectedDocumentRequest.paymentRequest?.status === "APPROVED" ? "This document fee has already been confirmed. Return to your document requests to view the next status." : "This document request is not currently eligible for a fee payment."} /> : <PayByQrForm openBills={billChoices} today={today} documentPayment={selectedDocumentPayment} />}
      </div>
    </section>

    <section className="card">
      <div className="mb-4 flex items-center gap-3"><ShieldCheck className="size-5 text-pine-700" /><div><h2 className="text-lg font-black">My QR payment requests</h2><p className="text-sm text-slate-500">Approved requests automatically create receipts and update your account balance.</p></div></div>
      <div className="table-wrap shadow-none"><table className="data-table"><thead><tr><th>Submitted</th><th>Purpose</th><th>Reference</th><th>Attachment</th><th>Status</th><th>Reviewed</th><th className="text-right">Amount</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td>{shortDate(request.createdAt)}</td><td><p className="font-bold">{paymentRequestPurpose(request)}</p>{request.documentRequestId && <p className="text-xs font-bold text-pine-700">Request No. {request.documentRequest ? documentRequestPublicReference(request.documentRequest) : request.documentRequestId}</p>}<p className="text-xs text-slate-400">{request.payerNotes || request.reviewRemarks || ""}</p></td><td className="font-mono text-xs">{request.referenceNumber || "Not submitted"}</td><td>{request.proofImageUrl ? <a className="inline-flex items-center gap-1 text-xs font-bold text-pine-700" href={request.proofImageUrl} target="_blank" rel="noreferrer"><Paperclip className="size-3" /> With Proof of Payment</a> : <span className="text-xs font-semibold text-slate-400">No Attachment</span>}</td><td>{request.type === "DOCUMENT_FEE" && request.documentRequest ? <span className="badge badge-info">{documentFeePaymentStatusLabel({ ...request.documentRequest, paymentRequiredSnapshot: true, feeAmountSnapshot: request.amount, paymentRequest: request })}</span> : <StatusBadge status={request.status} />}</td><td>{request.reviewedAt ? shortDate(request.reviewedAt) : "Pending"}</td><td className="text-right font-black">{money(request.amount)}</td></tr>)}{!requests.length && <tr><td colSpan={7} className="py-12 text-center text-slate-500">No QR payment requests submitted yet.</td></tr>}</tbody></table></div>
    </section>
  </>;
}

function DocumentPaymentNotice({ title, message }: { title: string; message: string }) {
  return <section className="card border-amber-200 bg-amber-50"><h2 className="text-lg font-black text-amber-950">{title}</h2><p className="mt-2 text-sm font-semibold text-amber-900">{message}</p></section>;
}

function paymentRequestPurpose(request: { type: string; bill?: { billingMonth: Date } | null; collectionType?: unknown; description?: string | null; documentRequest?: { definition?: { displayName: string } | null; type?: unknown } | null }) {
  if (request.type === "MONTHLY_DUES") return `Monthly dues - ${request.bill ? monthLabel(request.bill.billingMonth) : "Bill"}`;
  if (request.type === "DOCUMENT_FEE") return `Document Request Fee - ${request.documentRequest?.definition?.displayName || "Official HOA document"}`;
  return collectionLabel(String(request.collectionType), request.description);
}
