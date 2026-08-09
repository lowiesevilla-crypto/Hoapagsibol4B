import Link from "next/link";
import { Download, ExternalLink, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { PaymentRequestType, Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { PaymentProofViewer } from "@/components/payment-proof-viewer";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/ui";
import { reconcileOnlinePaymentAction } from "@/lib/actions/homeowner-paymongo-reconciliation";
import { approvePaymentRequestAction, rejectPaymentRequestAction } from "@/lib/actions/payment-requests";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPaymongoCheckoutSessionRemark } from "@/lib/homeowner-paymongo-batch";
import { isPayMongoPaymentRequest } from "@/lib/homeowner-payment-flow";
import { documentRequestPublicReference } from "@/lib/services/document-fee-payments";
import { documentTypeLabel } from "@/lib/services/documents";
import { collectionLabel, money, monthLabel, shortDate } from "@/lib/utils";

export default async function PaymentRequestDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  const admin = await requireUser(Role.ADMIN);
  const { id } = await params;
  const query = await searchParams;
  const request = await prisma.paymentRequest.findFirst({
    where: { id, tenantId: admin.tenantId },
    include: { homeowner: { include: { user: true } }, bill: true, payment: true, collection: true, documentRequest: { include: { definition: true, configuration: true } } },
  });
  if (!request) notFound();
  const online = isPayMongoPaymentRequest(request);
  const purpose = request.type === PaymentRequestType.MONTHLY_DUES
    ? `Monthly dues - ${request.bill ? monthLabel(request.bill.billingMonth) : "Billing"}`
    : request.type === PaymentRequestType.DOCUMENT_FEE
      ? `Document Request Fee - ${request.documentRequest?.definition?.displayName || request.documentRequest?.configuration?.displayName || (request.documentRequest?.type ? documentTypeLabel(request.documentRequest.type) : "Official HOA document")}`
    : collectionLabel(String(request.collectionType), request.description);
  const publicReviewRemarks = request.reviewRemarks && !isPaymongoCheckoutSessionRemark(request.reviewRemarks) ? request.reviewRemarks : null;
  const displayStatus = online && request.status === "PENDING_REVIEW" ? "AWAITING PAYMONGO CONFIRMATION" : request.status.replaceAll("_", " ");

  return <>
    <PageHeader eyebrow={online ? "Online payment" : "QR / GCash review"} title="Payment request details" description={online ? "PayMongo Online is gateway-confirmed and posts automatically. Tenant administrators do not approve or reject online payments." : "Review the homeowner payment proof, status, and submission details before approval."} action={<Link className="btn-secondary" href="/admin/payments/requests">Back to payment requests</Link>} />
    {query.success && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{query.success}</p>}
    {query.error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{query.error}</p>}
    <section className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
      <div className="card">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-black">{request.homeowner.user.name}</h2><p className="text-sm text-slate-500">Block {request.homeowner.block}, Lot {request.homeowner.lot}</p></div>
          <StatusBadge status={request.status} />
        </div>
        <div className="grid gap-3 text-sm">
          <Info label="Purpose" value={purpose} />
          <Info label="Amount" value={money(request.amount)} />
          <Info label="Reference number" value={request.referenceNumber || "-"} />
          <Info label="Payment date" value={shortDate(request.paymentDate)} />
          <Info label="Submitted" value={shortDate(request.createdAt)} />
          <Info label="Status" value={displayStatus} />
          <Info label="Payment flow" value={online ? "PayMongo Online — automatic gateway confirmation" : "Manual QR / proof — administrator verification required"} />
          {request.documentRequest && <Info label="Document request" value={documentRequestPublicReference(request.documentRequest)} />}
          {request.documentRequest && <Info label="Document status" value={request.documentRequest.status.replaceAll("_", " ")} />}
          {request.payerNotes && <Info label="Homeowner notes" value={online ? "Online payment checkout" : request.payerNotes} />}
          {publicReviewRemarks && <Info label={online ? "Gateway remarks" : "Review remarks"} value={publicReviewRemarks} />}
        </div>
        {request.documentRequest && <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5"><Link className="btn-secondary" href={`/admin/documents/${request.documentRequest.id}`}>Open document request</Link>{request.collectionId && <Link className="btn-secondary" href={`/receipts/collection/${request.collectionId}`} target="_blank">Open receipt</Link>}</div>}
        {request.status === "PENDING_REVIEW" && online ? <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
          <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-blue-950"><ShieldCheck className="mt-0.5 size-5 shrink-0" /><div><p className="font-black">No manual approval required</p><p className="mt-1 text-sm leading-6">HOAHub posts this payment only from a verified PayMongo paid event or trusted Checkout Session reconciliation. When confirmed, the payment, receipt, allocations, bill balance, and financial records are updated automatically.</p></div></div>
          <form action={reconcileOnlinePaymentAction}><input type="hidden" name="requestId" value={request.id} /><SubmitButton className="btn-secondary w-full"><RefreshCw className="size-4" /> Refresh PayMongo status</SubmitButton></form>
        </div> : request.status === "PENDING_REVIEW" ? <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5">
          <form action={approvePaymentRequestAction} className="space-y-2">
            <input type="hidden" name="id" value={request.id} />
            <input className="field" name="reviewRemarks" placeholder="Approval note optional" />
            <SubmitButton className="btn-primary w-full">Approve as paid</SubmitButton>
          </form>
          <form action={rejectPaymentRequestAction} className="space-y-2">
            <input type="hidden" name="id" value={request.id} />
            <input className="field" name="reviewRemarks" placeholder="Reason for rejection" />
            <SubmitButton className="btn-danger w-full">Reject request</SubmitButton>
          </form>
        </div> : <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
          {request.paymentId && <Link className="btn-secondary" href={`/receipts/payment/${request.paymentId}`} target="_blank"><Printer className="size-4" /> Payment receipt</Link>}
          {request.collectionId && <Link className="btn-secondary" href={`/receipts/collection/${request.collectionId}`} target="_blank"><Printer className="size-4" /> Collection receipt</Link>}
        </div>}
      </div>

      <div className="card">
        {online ? <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-8 text-center"><ShieldCheck className="size-10 text-blue-700" /><h2 className="mt-4 text-lg font-black text-blue-950">Gateway-confirmed online payment</h2><p className="mt-2 max-w-xl text-sm leading-6 text-blue-900">No homeowner screenshot or manual proof is required. HOAHub verifies PayMongo server-to-server and automatically creates the official financial records only after a paid payment is confirmed.</p></div> : <>
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div><h2 className="text-lg font-black">Uploaded payment screenshot</h2><p className="text-sm text-slate-500">Use the zoom controls below, or open the image in a new tab for full-screen review.</p></div>
            {request.proofImageUrl && <div className="flex flex-wrap gap-2"><Link className="btn-secondary min-h-9 px-3 py-1.5" href={request.proofImageUrl} target="_blank"><ExternalLink className="size-4" /> Open</Link><a className="btn-secondary min-h-9 px-3 py-1.5" href={request.proofImageUrl} download><Download className="size-4" /> Download</a></div>}
          </div>
          {request.proofImageUrl ? <PaymentProofViewer src={request.proofImageUrl} alt={`Payment proof for ${request.referenceNumber || request.id}`} contentType={request.proofContentType} fileName={request.proofFileName} /> : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">No proof of payment was uploaded for this request.</div>}
        </>}
      </div>
    </section>
  </>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 font-bold text-ink">{value}</p></div>;
}
