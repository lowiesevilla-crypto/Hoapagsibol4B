import Link from "next/link";
import { Download, ExternalLink, Printer } from "lucide-react";
import { notFound } from "next/navigation";
import { PaymentRequestType, Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { PaymentProofViewer } from "@/components/payment-proof-viewer";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/ui";
import { approvePaymentRequestAction, rejectPaymentRequestAction } from "@/lib/actions/payment-requests";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { collectionLabel, money, monthLabel, shortDate } from "@/lib/utils";

export default async function PaymentRequestDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(Role.ADMIN);
  const { id } = await params;
  const request = await prisma.paymentRequest.findUnique({
    where: { id },
    include: { homeowner: { include: { user: true } }, bill: true, payment: true, collection: true },
  });
  if (!request) notFound();
  const purpose = request.type === PaymentRequestType.MONTHLY_DUES
    ? `Monthly dues - ${request.bill ? monthLabel(request.bill.billingMonth) : "Billing"}`
    : collectionLabel(String(request.collectionType), request.description);

  return <>
    <PageHeader eyebrow="QR / GCash review" title="Payment request details" description="Review the homeowner payment proof, status, and submission details before approval." action={<Link className="btn-secondary" href="/admin/payments/requests">Back to payment requests</Link>} />
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
          <Info label="Status" value={request.status.replaceAll("_", " ")} />
          {request.payerNotes && <Info label="Homeowner notes" value={request.payerNotes} />}
          {request.reviewRemarks && <Info label="Review remarks" value={request.reviewRemarks} />}
        </div>
        {request.status === "PENDING_REVIEW" ? <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5">
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
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div><h2 className="text-lg font-black">Uploaded payment screenshot</h2><p className="text-sm text-slate-500">Use the zoom controls below, or open the image in a new tab for full-screen review.</p></div>
          {request.proofImageUrl && <div className="flex flex-wrap gap-2"><Link className="btn-secondary min-h-9 px-3 py-1.5" href={request.proofImageUrl} target="_blank"><ExternalLink className="size-4" /> Open</Link><a className="btn-secondary min-h-9 px-3 py-1.5" href={request.proofImageUrl} download><Download className="size-4" /> Download</a></div>}
        </div>
        {request.proofImageUrl ? <PaymentProofViewer src={request.proofImageUrl} alt={`Payment proof for ${request.referenceNumber || request.id}`} contentType={request.proofContentType} fileName={request.proofFileName} /> : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">No proof of payment was uploaded for this request.</div>}
      </div>
    </section>
  </>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 font-bold text-ink">{value}</p></div>;
}
