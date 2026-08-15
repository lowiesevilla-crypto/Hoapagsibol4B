import { CalendarDays, Clock3, CreditCard, QrCode, ReceiptText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PayByQrForm } from "@/components/pay-by-qr-form";
import { PayMongoHomeownerForm } from "@/components/paymongo-homeowner-form";
import { PaymentAreaNavigation, PaymentEmptyState, PaymentHeroCard, PaymentMetricCard, PaymentRequestStatusCard, UnpaidBillingCard } from "@/components/homeowner/payments/payment-cards";
import { PortalPageContainer, PortalSectionHeader } from "@/components/portal-mobile-shell";
import { prisma } from "@/lib/db";
import { getAppUrl } from "@/lib/app-url";
import { isPayMongoPaymentRequest } from "@/lib/homeowner-payment-flow";
import { requireHomeownerProfile } from "@/lib/portal";
import { getStatementOfAccount } from "@/lib/services/statement-of-account";
import { getHomeownerPaymentConfig } from "@/lib/services/homeowner-payment-config";
import { resolveHomeownerPaymentRequestDisplayStatus, resolveHomeownerPaymentStatus } from "@/lib/services/homeowner-payment-status";
import { getAssociationSettings, getPaymentSettings } from "@/lib/system-settings";
import { locateTenantUpload, locateUpload } from "@/lib/storage";
import { canSubmitDocumentFeePayment, documentFeePaymentPurpose, documentFeePaymentStatusLabel, documentRequestPublicReference } from "@/lib/services/document-fee-payments";
import { documentTypeLabel } from "@/lib/services/documents";
import { collectionLabel, inputDate, money, monthLabel, shortDate } from "@/lib/utils";

const UNPAID_LIMIT = 8;
const REQUEST_LIMIT = 6;

export default async function PortalPayPage({ searchParams }: { searchParams: Promise<{ documentRequestId?: string; error?: string; success?: string; message?: string; online?: string }> }) {
  const profile = await requireHomeownerProfile();
  const query = await searchParams;
  const today = new Date();
  const [soa, association, paymentSettings, paymentConfig, openBills, paymentRequests, selectedDocumentRequest] = await Promise.all([
    getStatementOfAccount(profile.id, profile.tenantId, getAppUrl(), today),
    getAssociationSettings(profile.tenantId),
    getPaymentSettings(profile.tenantId),
    getHomeownerPaymentConfig(profile.tenantId),
    prisma.bill.findMany({
      where: { tenantId: profile.tenantId, homeownerId: profile.id, balance: { gt: 0 }, archivedAt: null },
      include: { paymentRequests: { where: { tenantId: profile.tenantId, status: "PENDING_REVIEW" }, select: { id: true } } },
      orderBy: [{ dueDate: "asc" }, { billingMonth: "desc" }],
      take: UNPAID_LIMIT,
    }),
    prisma.paymentRequest.findMany({
      where: { tenantId: profile.tenantId, homeownerId: profile.id },
      include: { bill: true, payment: true, collection: true, documentRequest: { include: { definition: true } } },
      orderBy: [{ createdAt: "desc" }],
      take: REQUEST_LIMIT,
    }),
    query.documentRequestId ? prisma.documentRequest.findFirst({
      where: { tenantId: profile.tenantId, homeownerId: profile.id, id: query.documentRequestId, archivedAt: null },
      include: { definition: true, configuration: true, paymentRequest: { include: { collection: true } } },
    }) : Promise.resolve(null),
  ]);

  const isPayMongoFlow = paymentConfig.flow === "PAYMONGO";
  const oldestUnpaid = openBills[0] ?? null;
  const pendingRequests = paymentRequests.filter((request) => request.status === "PENDING_REVIEW");
  const latestRequest = paymentRequests[0] ?? null;
  const latestRejected = latestRequest?.status === "REJECTED" ? latestRequest : null;
  const latestPayment = soa.paymentHistory.find((payment) => payment.status === "Active");
  const statusInfo = resolveHomeownerPaymentStatus({
    hasBills: soa.billingHistory.length > 0,
    balance: soa.summary.currentOutstandingBalance,
    collectionStatus: soa.summary.collectionStatus,
    hasPending: pendingRequests.length > 0,
    hasRejected: Boolean(latestRejected),
  });
  const billChoices = openBills.map((bill) => ({
    id: bill.id,
    month: monthLabel(bill.billingMonth),
    dueDate: shortDate(bill.dueDate),
    balance: Number(bill.balance),
    balanceLabel: money(bill.balance),
    hasPendingRequest: bill.paymentRequests.length > 0,
  }));
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
  const gcashQrImageUrl = !isPayMongoFlow ? await availableGcashQrImageUrl(paymentSettings.gcashQrImageUrl) : null;

  return (
    <PortalPageContainer className="space-y-6">
      <PaymentAreaNavigation active="pay" />

      {query.error && <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800" role="alert">{query.error}</div>}
      {query.success && <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800" role="status">{query.message || "Payment request submitted."}</div>}
      {query.online === "confirming" && <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold leading-6 text-blue-900" role="status">PayMongo checkout was completed or closed. HOAHub is waiting for the verified PayMongo confirmation before updating your balance or issuing an official receipt. Refresh this page if the status is still pending.</div>}
      {query.online === "cancelled" && <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900" role="status">PayMongo checkout was cancelled. No payment is marked as paid unless PayMongo confirms the transaction.</div>}

      <PaymentHeroCard
        amount={money(soa.summary.currentOutstandingBalance)}
        status={statusInfo.label}
        statusTone={statusInfo.tone}
        collectionStatus={soa.summary.collectionStatus}
        oldestCoverage={oldestUnpaid ? monthLabel(oldestUnpaid.billingMonth) : undefined}
        dueDate={oldestUnpaid ? shortDate(oldestUnpaid.dueDate) : undefined}
        availableCredit={money(soa.summary.availableCredit)}
        pendingSummary={pendingRequests.length ? `${pendingRequests.length} request${pendingRequests.length === 1 ? "" : "s"}` : "None"}
        recentPayment={latestPayment ? `${money(latestPayment.amount)} · ${shortDate(latestPayment.paymentDate)}` : "None yet"}
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PaymentMetricCard label="Outstanding" value={money(soa.summary.currentOutstandingBalance)} note="From Statement of Account" icon={ReceiptText} tone={statusInfo.tone} />
        <PaymentMetricCard label="Available Credit" value={money(soa.summary.availableCredit)} note="Unapplied homeowner credit" icon={CreditCard} tone={soa.summary.availableCredit > 0 ? "success" : "default"} />
        <PaymentMetricCard label="Oldest Due" value={oldestUnpaid ? shortDate(oldestUnpaid.dueDate) : "None"} note={oldestUnpaid ? monthLabel(oldestUnpaid.billingMonth) : "No unpaid billing"} icon={CalendarDays} />
        <PaymentMetricCard label={isPayMongoFlow ? "Online Payment" : "Verification"} value={pendingRequests.length ? "Pending" : "Clear"} note={isPayMongoFlow ? "PayMongo confirmation status" : latestRejected ? "Latest rejected request needs review" : "HOA review status"} icon={Clock3} tone={pendingRequests.length ? "warning" : latestRejected ? "danger" : "success"} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[.95fr_1.05fr]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
            <PortalSectionHeader eyebrow={`${openBills.length} shown`} title="Unpaid Billings" action={<Link href="/portal/billing" className="text-sm font-black text-pine-700">View billing</Link>} />
            <div className="space-y-3">
              {openBills.map((bill) => <UnpaidBillingCard key={bill.id} title="Monthly Dues" coverage={monthLabel(bill.billingMonth)} dueDate={shortDate(bill.dueDate)} originalAmount={money(bill.totalAmount)} paidAmount={money(bill.amountPaid)} balance={money(bill.balance)} status={bill.status.replaceAll("_", " ")} selectable pending={bill.paymentRequests.length > 0} />)}
              {!openBills.length && <PaymentEmptyState title="No unpaid billing" description={isPayMongoFlow ? "Your current account has no unpaid monthly dues available for online payment." : "Your current account has no unpaid monthly dues available for QR payment."} />}
            </div>
          </section>

          <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
            <PortalSectionHeader eyebrow={`${paymentRequests.length} recent`} title="Payment Status" action={<Link href="/portal/payments" className="text-sm font-black text-pine-700">History</Link>} />
            <div className="space-y-3">
              {paymentRequests.map((request) => {
                const onlineRequest = isPayMongoPaymentRequest(request);
                const displayStatus = resolveHomeownerPaymentRequestDisplayStatus({
                  requestStatus: request.status,
                  onlineRequest,
                  hasPostedPayment: Boolean(request.payment || request.collection),
                });
                return <PaymentRequestStatusCard key={request.id} title={paymentRequestPurpose(request)} amount={money(request.amount)} status={displayStatus.label} statusTone={displayStatus.tone} meta={`Submitted ${shortDate(request.createdAt)} · Updated ${shortDate(request.updatedAt)}`} reference={request.referenceNumber || "Not submitted"} method={onlineRequest ? "PayMongo Online" : request.method.replaceAll("_", " ")} remarks={homeownerSafeRemarks(request.reviewRemarks)} proofLabel={onlineRequest ? "Gateway checkout" : request.proofImageUrl ? "Attached" : "No attachment"} />;
              })}
              {!paymentRequests.length && <PaymentEmptyState title="No payment activity" description={isPayMongoFlow ? "PayMongo checkout and confirmation activity will appear here." : "Submitted QR payments and HOA verification results will appear here."} icon={ShieldCheck} />}
            </div>
          </section>
        </div>

        <div className="space-y-5">
          {isPayMongoFlow ? <section className="rounded-3xl border border-blue-100 bg-white p-4 shadow-soft sm:p-5">
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-blue-50 p-3">
              {association.logoUrl ? <img src={association.logoUrl} alt={`${association.name} logo`} className="size-12 rounded-xl object-contain" /> : <span className="grid size-12 place-items-center rounded-xl bg-blue-100 text-sm font-black text-blue-800">HOA</span>}
              <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tenant payment account</p><p className="break-words font-black text-slate-950">{association.name}</p></div>
            </div>
            <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700"><CreditCard className="size-5" /></span><div><h2 className="text-lg font-black">PayMongo Online</h2><p className="mt-1 text-sm leading-6 text-slate-600">This HOA has enabled online checkout as its homeowner payment flow. Manual QR proof submission is not available while this mode is active.</p></div></div>
          </section> : <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
              {association.logoUrl ? <img src={association.logoUrl} alt={`${association.name} logo`} className="size-12 rounded-xl object-contain" /> : <span className="grid size-12 place-items-center rounded-xl bg-pine-100 text-sm font-black text-pine-800">HOA</span>}
              <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tenant payment account</p><p className="break-words font-black text-slate-950">{association.name}</p></div>
            </div>
            <div className="mb-4 flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-pine-50 text-pine-700"><QrCode className="size-5" /></span><div><h2 className="text-lg font-black">Official GCash QR</h2><p className="text-sm text-slate-500">Verify these details before sending payment.</p></div></div>
            {gcashQrImageUrl ? <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-3"><img src={gcashQrImageUrl} alt="Official HOA GCash QR code" className="mx-auto aspect-square max-h-[420px] w-full max-w-[420px] object-contain" /></div> : <div className="grid min-h-72 place-items-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-bold text-slate-600">GCash QR is currently unavailable. Please contact Admin.</div>}
            <dl className="mt-5 grid gap-3 rounded-2xl bg-pine-50/70 p-4 text-sm">
              <div><dt className="font-bold uppercase tracking-wide text-slate-500">Account name</dt><dd className="break-words text-lg font-black text-pine-900">{paymentSettings.gcashAccountName || "Not configured"}</dd></div>
              <div><dt className="font-bold uppercase tracking-wide text-slate-500">Mobile number</dt><dd className="break-words text-lg font-black text-pine-900">{paymentSettings.gcashMobileNumber || "Not configured"}</dd></div>
            </dl>
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900"><p className="font-black">Payment instructions</p><p className="mt-1 whitespace-pre-wrap">{paymentSettings.paymentInstructions || "Pay the exact amount, save the GCash reference number, and submit it using the form below."}</p></div>
          </section>}

          {query.documentRequestId && !selectedDocumentRequest ? <DocumentPaymentNotice title="Document request unavailable" message="This document request was not found for your homeowner account." /> : selectedDocumentRequest && !selectedDocumentPayment ? <DocumentPaymentNotice title={documentFeePaymentStatusLabel(selectedDocumentRequest)} message={selectedDocumentRequest.paymentRequest?.status === "APPROVED" ? "This document fee has already been confirmed. Return to your document requests to view the next status." : "This document request is not currently eligible for a fee payment."} /> : isPayMongoFlow ? <PayMongoHomeownerForm openBills={billChoices} documentPayment={selectedDocumentPayment} /> : <PayByQrForm openBills={billChoices} today={inputDate(today)} documentPayment={selectedDocumentPayment} />}
        </div>
      </section>
    </PortalPageContainer>
  );
}

function DocumentPaymentNotice({ title, message }: { title: string; message: string }) {
  return <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-soft"><h2 className="text-lg font-black text-amber-950">{title}</h2><p className="mt-2 text-sm font-semibold text-amber-900">{message}</p></section>;
}

function paymentRequestPurpose(request: { type: string; bill?: { billingMonth: Date } | null; collectionType?: unknown; description?: string | null; documentRequest?: { definition?: { displayName: string } | null; type?: unknown } | null }) {
  if (request.type === "MONTHLY_DUES") return `Monthly dues - ${request.bill ? monthLabel(request.bill.billingMonth) : "Bill"}`;
  if (request.type === "DOCUMENT_FEE") return `Document Request Fee - ${request.documentRequest?.definition?.displayName || "Official HOA document"}`;
  return collectionLabel(String(request.collectionType), request.description);
}

function homeownerSafeRemarks(remarks?: string | null) {
  return remarks?.trim() || null;
}

async function availableGcashQrImageUrl(url?: string | null) {
  const value = url?.trim();
  if (!value) return null;
  if (!value.startsWith("/uploads/settings/")) return value;
  const segments = value.slice("/uploads/settings/".length).split("/").filter(Boolean);
  if (!segments.length || segments.some((segment) => segment.includes("..") || segment.includes("/") || segment.includes("\\"))) return null;
  try {
    if (segments.length >= 3 && segments[1] === "gcash") {
      await locateTenantUpload(segments[0], "settings", ...segments.slice(1));
    } else {
      await locateUpload("settings", ...segments);
    }
    return value;
  } catch {
    return null;
  }
}
