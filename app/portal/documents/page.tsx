import Image from "next/image";
import Link from "next/link";
import { DocumentRequestStatus, Prisma, Role } from "@prisma/client";
import { RequestAreaNavigation, RequestProgressTracker, requestTone, statusLabel } from "@/components/homeowner/requests/request-cards";
import { PageHeader } from "@/components/page-header";
import { PortalPageContainer } from "@/components/portal-mobile-shell";
import { DocumentRequestForm } from "@/components/document-request-form";
import { saveHouseholdMemberAction, toggleHouseholdMemberAction } from "@/lib/actions/documents";
import { resubmitCertificateAction } from "@/lib/actions/certificate-of-residency";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { configuredDocumentSummary, normalizeDocumentFields } from "@/lib/services/document-workflow";
import { getRequestableDocumentDefinitions } from "@/lib/services/document-definitions";
import { resolveDocumentDownloadAccess } from "@/lib/services/document-balance-policy";
import { documentTypeLabel } from "@/lib/services/documents";
import { getPaymentSettings } from "@/lib/system-settings";
import { canSubmitDocumentFeePayment, documentFeePaymentStatusLabel, documentRequestPublicReference } from "@/lib/services/document-fee-payments";
import { householdMemberEligibility } from "@/lib/services/household-member-eligibility";
import { money, shortDate } from "@/lib/utils";
import { CERTIFICATE_OF_RESIDENCY_CODE } from "@/lib/services/certificate-of-residency";

export default async function PortalDocumentsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; message?: string; status?: string; type?: string; date?: string; page?: string; q?: string }> }) {
  const user = await requireUser(Role.HOMEOWNER);
  const homeownerId = user.homeownerProfile!.id;
  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const q = query.q?.trim() || "";
  const where: Prisma.DocumentRequestWhereInput = { tenantId: user.tenantId, homeownerId, archivedAt: null, ...(query.status ? { status: query.status as never } : {}), ...(query.type ? { type: query.type as never } : {}), ...(query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? { requestedAt: { gte: new Date(`${query.date}T00:00:00.000Z`), lt: new Date(`${query.date}T23:59:59.999Z`) } } : {}), ...documentHistorySearch(q) };
  const [requests, requestCount, unpaid, paymentSettings, configs, members] = await Promise.all([
    prisma.documentRequest.findMany({ where, include: { subjectMember: true, homeowner: { include: { user: true } }, histories: { include: { actor: true }, orderBy: { createdAt: "desc" } }, configuration: true, definition: true, paymentRequest: { include: { collection: true } }, versions: { orderBy: { version: "desc" }, take: 1 }, generationAttempts: { orderBy: { updatedAt: "desc" }, take: 1 } }, orderBy: { requestedAt: "desc" }, skip: (page - 1) * 10, take: 10 }),
    prisma.documentRequest.count({ where }),
    prisma.bill.aggregate({ where: { tenantId: user.tenantId, homeownerId, archivedAt: null, balance: { gt: 0 } }, _sum: { balance: true } }),
    getPaymentSettings(user.tenantId),
    getRequestableDocumentDefinitions(user.tenantId),
    prisma.householdMember.findMany({ where: { tenantId: user.tenantId, homeownerId }, orderBy: [{ active: "desc" }, { fullName: "asc" }] }),
  ]);
  const unpaidBalance = Number(unpaid._sum.balance ?? 0);
  const portalConfigs = configs.map((config) => ({
    id: config.id,
    displayName: config.displayName,
    description: config.description,
    feeLabel: Number(config.feeAmount) > 0 ? money(Number(config.feeAmount)) : "Free",
    deliveryMode: config.deliveryMode,
    summary: configuredDocumentSummary(config),
    approvalRequired: config.approvalRequired,
    paymentRequired: config.paymentRequired,
    maxCopies: config.maxCopies,
    fields: normalizeDocumentFields(config.fields).map((field) => ({ key: field.key, label: field.label, fieldType: field.fieldType, required: field.required, defaultValue: field.defaultValue, options: field.options, validation: field.validation })),
  }));
  const portalMembers = members.map((member) => {
    const eligibility = householdMemberEligibility(member, { tenantId: user.tenantId, homeownerId });
    return { id: member.id, fullName: member.fullName, relationship: member.relationship, active: member.active, eligible: eligibility.eligible, eligibilityLabel: eligibility.label, eligibilityReason: eligibility.reason };
  });
  return <PortalPageContainer className="space-y-6">
    <RequestAreaNavigation active="documents" />
    <PageHeader eyebrow="Homeowner services" title="Document requests" description="Request, track, and download official HOA certificates and passes." action={<Link className="btn-secondary" href="/portal/documents/guide">Request guide</Link>} />
    {query.error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{query.error}</div>}
    {query.success && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{query.message || "Request submitted successfully."}</div>}
    {unpaidBalance > 0 && <section className="card mb-6 border-amber-200 bg-amber-50">
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center"><div><h2 className="text-lg font-black text-amber-950">Outstanding monthly dues</h2><p className="mt-1 text-sm text-amber-900">Your current qualifying HOA balance is <b>{money(unpaidBalance)}</b>. Some document types may restrict requests, downloads, or printing based on the tenant&apos;s saved document policy.</p><Link className="btn-primary mt-4 inline-flex" href="/portal/pay">Open Pay by QR</Link></div><div className="mx-auto w-full max-w-52 rounded-2xl bg-white p-3 text-center shadow-sm">{paymentSettings.gcashQrImageUrl ? <Image className="h-auto w-full object-contain" src={paymentSettings.gcashQrImageUrl} alt="GCash payment QR code" width={320} height={320} unoptimized /> : <p className="p-4 text-sm font-bold text-slate-600">GCash QR is currently unavailable. Please contact Admin.</p>}</div></div>
    </section>}
    <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
      <div className="space-y-6">
        <DocumentRequestForm configs={portalConfigs} members={portalMembers} />
        <section className="card">
          <h2 className="text-lg font-black">Household and family members</h2>
          <p className="mb-4 text-sm text-slate-500">Only members registered here can be selected as a document subject.</p>
          <form action={saveHouseholdMemberAction} className="grid gap-3 md:grid-cols-2">
            <input className="field" name="fullName" placeholder="Full name" required />
            <input className="field" name="relationship" placeholder="Relationship" required />
            <label><span className="label">Date of Birth</span><input className="field" name="birthDate" type="date" /><span className="mt-1 block text-xs text-slate-500">Optional. Used only when required by the selected document type.</span></label>
            <input className="field" name="civilStatus" placeholder="Civil status" />
            <input className="field" name="nationality" placeholder="Nationality" />
            <input className="field md:col-span-2" name="address" placeholder="Address, if different from property address" />
            <button className="btn-secondary md:col-span-2">Add household member</button>
          </form>
          <div className="mt-4 space-y-2">
            {members.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No household members registered yet.</p> : members.map((member) => <details key={member.id} className="rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-bold">{member.fullName} <span className="text-xs font-normal text-slate-500">- {member.relationship}{member.active ? "" : " | Inactive"}</span></summary><form action={saveHouseholdMemberAction} className="mt-3 grid gap-3 md:grid-cols-2"><input type="hidden" name="id" value={member.id} /><input className="field" name="fullName" defaultValue={member.fullName} required /><input className="field" name="relationship" defaultValue={member.relationship} required /><label><span className="label">Date of Birth</span><input className="field" name="birthDate" type="date" defaultValue={member.birthDate?.toISOString().slice(0, 10)} /><span className="mt-1 block text-xs text-slate-500">Optional. Used only when required by the selected document type.</span></label><input className="field" name="civilStatus" defaultValue={member.civilStatus || ""} placeholder="Civil status" /><input className="field" name="nationality" defaultValue={member.nationality || ""} placeholder="Nationality" /><input className="field" name="address" defaultValue={member.address || ""} placeholder="Address" /><label className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-bold"><input type="checkbox" name="active" defaultChecked={member.active} /> Active</label><button className="btn-secondary">Save member</button></form><form action={toggleHouseholdMemberAction} className="mt-2"><input type="hidden" name="id" value={member.id} /><button className="btn-secondary min-h-9 px-3 py-1.5 text-xs">{member.active ? "Deactivate" : "Activate"}</button></form></details>)}
          </div>
        </section>
      </div>
      <section className="card"><h2 className="text-lg font-black">My request history</h2><p className="mb-4 text-sm text-slate-500">Status changes and generated documents remain available here.</p>
        <form className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_150px_150px_150px_auto_auto]" method="get">
          <input className="field" type="search" name="q" defaultValue={q} placeholder="Search request no., document type, subject, status, receipt, or reference" aria-label="Search document request history" />
          <select className="field min-h-12" name="status" defaultValue={query.status || ""} aria-label="Filter document requests by status"><option value="">All statuses</option>{Object.values(DocumentRequestStatus).map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select>
          <select className="field min-h-12" name="type" defaultValue={query.type || ""} aria-label="Filter document requests by type"><option value="">All types</option><option value="GATE_PASS">Gate Pass</option><option value="MOVE_IN_OUT_PASS">Move-In/Out Pass</option><option value="CERTIFICATE_OF_RESIDENCY">Residency</option><option value="CLEARANCE_CERTIFICATE">Clearance</option></select>
          <input className="field min-h-12" type="date" name="date" defaultValue={query.date || ""} aria-label="Filter document requests by request date" />
          <button className="btn-primary">Search</button>
          {q && <Link className="btn-secondary" href="/portal/documents">Clear search</Link>}
        </form>
        {q && <p className="mb-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-600">Showing results for <b>{q}</b>. {requestCount === 0 ? "No matching requests were found." : `${requestCount} matching request${requestCount === 1 ? "" : "s"} found.`}</p>}
        {requests.length === 0 ? <p className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">You have not submitted a document request yet.</p> : <div className="space-y-3">{requests.map((item) => { const subject = snapshotRecord(item.subjectSnapshot); const access = resolveDocumentDownloadAccess({ request: item, currentOutstandingBalance: unpaidBalance }); const downloadable = Boolean(item.generatedContent && access.downloadAllowed); const platformCertificate = item.definition?.code === CERTIFICATE_OF_RESIDENCY_CODE; const currentVersion = item.versions[0]; const latestAttempt = item.generationAttempts[0]; const generationFailed = latestAttempt && ["BLOCKED", "FAILED"].includes(latestAttempt.state) && !item.generatedContent; const generationActive = item.status === "GENERATING" && !generationFailed; const exactReleasedVersion = platformCertificate && currentVersion?.issuedStatus === "RELEASED" && !currentVersion.revokedAt; const paymentStatusLabel = documentFeePaymentStatusLabel(item); const requestReference = documentRequestPublicReference(item); return <article key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex flex-col justify-between gap-2 sm:flex-row"><div><p className="font-black">{item.definition?.displayName || item.configuration?.displayName || documentTypeLabel(item.type)}</p><p className="text-xs text-slate-500">{item.origin === "ADMIN" ? "Created by HOA office" : `Requested ${shortDate(item.requestedAt)}`}{item.documentNumber ? ` | ${item.documentNumber}` : ` | ${requestReference}`}{item.generatedAt ? ` | Generated ${shortDate(item.generatedAt)}` : ""}</p></div><span className={`badge ${requestTone(item.status) === "success" ? "badge-paid" : requestTone(item.status) === "danger" || generationFailed ? "badge-overdue" : "badge-info"}`}>{currentVersion?.issuedStatus === "REVOKED" ? "REVOKED" : generationFailed ? "GENERATION NEEDS RETRY" : statusLabel(item.status)}</span></div><RequestProgressTracker status={item.status} /><p className="mt-2 text-sm text-slate-600">{item.purpose}</p><p className="mt-1 text-xs font-bold text-slate-500">Subject: {String(subject.fullName || "Registered homeowner")}{subject.relationship ? ` (${String(subject.relationship)})` : ""} | Fee: {money(Number(item.feeAmountSnapshot))} | Payment: {paymentStatusLabel}</p>{(item.adminRemarks || item.remarks) && <p className="mt-2 rounded-xl bg-white p-2 text-xs"><b>Remarks:</b> {item.adminRemarks || item.remarks}</p>}{generationActive && <p className="mt-2 rounded-xl bg-blue-50 p-2 text-xs font-bold text-blue-800">Document is being generated. Current status: {item.status.replaceAll("_", " ")}. Last updated {shortDate(item.updatedAt)}.</p>}{generationFailed && <p className="mt-2 rounded-xl bg-amber-100 p-2 text-xs font-bold text-amber-900">We could not finish generating this document. Your request was saved and HOA staff can retry processing it.</p>}{item.status === "RETURNED_FOR_CORRECTION" && platformCertificate && <form action={resubmitCertificateAction} className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><input type="hidden" name="id" value={item.id} /><label><span className="label">Corrected purpose</span><textarea className="field min-h-24" name="purpose" defaultValue={item.purpose || ""} maxLength={500} required /></label><label><span className="label">Additional remarks</span><textarea className="field min-h-20" name="remarks" defaultValue={item.remarks || ""} maxLength={1000} /></label><button className="btn-primary w-full sm:w-auto">Resubmit for review</button></form>}{access.message && <p className="mt-2 rounded-xl bg-amber-100 p-2 text-xs font-bold text-amber-900">{access.paymentLocked ? `Payment of ${money(Number(item.feeAmountSnapshot))} is required before this document can be generated and downloaded.` : access.message}</p>}<DocumentFeePaymentPanel item={item} paymentStatusLabel={paymentStatusLabel} requestReference={requestReference} />{item.generatedContent && <div className="mt-3 flex flex-wrap gap-2"><Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/documents/${item.id}`}>View Document</Link>{downloadable && exactReleasedVersion ? <><a className="btn-primary min-h-9 px-3 py-1.5 text-xs" href={`/documents/${item.id}/download`}>Download</a><a className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/documents/${item.id}/download?print=1`} target="_blank" rel="noreferrer">Print</a></> : downloadable ? <><a className="btn-primary min-h-9 px-3 py-1.5 text-xs" href={`/documents/${item.id}/pdf`}>Download</a><Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/documents/${item.id}/print`}>Print</Link></> : <span className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900">Download locked</span>}{item.verificationCode && <Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/verify/documents/${item.verificationCode}`}>Verify</Link>}</div>}<details className="mt-3 rounded-xl bg-white p-3 text-xs"><summary className="cursor-pointer font-bold">Status history ({item.histories.length})</summary><div className="mt-2 space-y-1">{item.histories.map((history) => <p key={history.id}><b>{history.status.replaceAll("_", " ")}</b> - {shortDate(history.createdAt)}{history.note ? `: ${history.note}` : ""}</p>)}</div></details></article>; })}</div>}
        {requestCount > 10 && <div className="mt-4 flex items-center justify-between text-sm"><Link className={`btn-secondary ${page <= 1 ? "pointer-events-none opacity-50" : ""}`} href={`?${historyPageParams(query, page - 1)}`}>Previous</Link><span>Page {page} of {Math.ceil(requestCount / 10)}</span><Link className={`btn-secondary ${page >= Math.ceil(requestCount / 10) ? "pointer-events-none opacity-50" : ""}`} href={`?${historyPageParams(query, page + 1)}`}>Next</Link></div>}
      </section>
    </div>
  </PortalPageContainer>;
}

function snapshotRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

type DocumentFeePanelItem = {
  id: string;
  status: string;
  documentNumber?: string | null;
  requestedAt?: Date | null;
  paymentRequiredSnapshot: boolean;
  feeAmountSnapshot: unknown;
  definition?: { displayName: string } | null;
  configuration?: { displayName: string } | null;
  type?: unknown;
  paymentRequest?: {
    id: string;
    status: string;
    referenceNumber?: string | null;
    proofImageUrl?: string | null;
    paymentDate?: Date | null;
    reviewedAt?: Date | null;
    reviewRemarks?: string | null;
    collectionId?: string | null;
    collection?: { id: string; receiptNumber?: string | null; collectionDate?: Date | null } | null;
  } | null;
};

function DocumentFeePaymentPanel({ item, paymentStatusLabel, requestReference }: { item: DocumentFeePanelItem; paymentStatusLabel: string; requestReference: string }) {
  if (!item.paymentRequiredSnapshot || Number(item.feeAmountSnapshot) <= 0) return null;
  const payment = item.paymentRequest;
  const receiptId = payment?.collectionId || payment?.collection?.id;
  const paymentNeedsAction = canSubmitDocumentFeePayment(item);
  return <section className="mt-3 rounded-2xl border border-pine-100 bg-white p-3 text-xs">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div>
        <h3 className="text-sm font-black text-pine-950">Document fee payment</h3>
        <p className="mt-1 font-semibold text-slate-600">Payment of {money(Number(item.feeAmountSnapshot))} is required before this document can be generated and downloaded.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-info w-fit">{paymentStatusLabel}</span>
        {paymentNeedsAction && <Link className="btn-primary min-h-9 px-3 py-1.5 text-xs" href={`/portal/pay?documentRequestId=${item.id}`}>Pay Document Fee</Link>}
      </div>
    </div>
    <details className="mt-3 rounded-xl bg-slate-50 p-3" open={paymentNeedsAction}>
      <summary className="cursor-pointer font-black">Payment details - {paymentStatusLabel}</summary>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <PaymentInfo label="Document Type" value={item.definition?.displayName || item.configuration?.displayName || (item.type ? documentTypeLabel(item.type as never) : "Official HOA document")} />
        <PaymentInfo label="Request Number" value={requestReference} />
        <PaymentInfo label="Document Fee" value={money(Number(item.feeAmountSnapshot))} />
        <PaymentInfo label="Payment Status" value={paymentStatusLabel} />
        <PaymentInfo label="Receipt Type" value="Other Collection receipt" />
        <PaymentInfo label="Payment Reference" value={payment?.referenceNumber || "Not submitted"} />
        <PaymentInfo label="Payment Date" value={payment?.paymentDate ? shortDate(payment.paymentDate) : "Not submitted"} />
        <PaymentInfo label="Confirmation Date" value={payment?.reviewedAt ? shortDate(payment.reviewedAt) : "Pending verification"} />
        <PaymentInfo label="Receipt Number" value={payment?.collection?.receiptNumber || "Available after confirmation"} />
      </dl>
      {payment?.status === "REJECTED" && <p className="mt-3 rounded-xl bg-rose-50 p-3 font-bold text-rose-700">Payment rejected{payment.reviewRemarks ? `: ${payment.reviewRemarks}` : "."}</p>}
      {payment?.status === "PENDING_REVIEW" && (payment.referenceNumber || payment.proofImageUrl) && <p className="mt-3 rounded-xl bg-blue-50 p-3 font-bold text-blue-800">Payment submitted and waiting for HOA verification. Download remains locked until confirmation.</p>}
      {payment?.status === "APPROVED" && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 p-3 font-bold text-emerald-800"><span>Payment confirmed. Document processing will continue automatically.</span>{receiptId && <Link className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/receipts/collection/${receiptId}`} target="_blank">View Receipt</Link>}</div>}
    </details>
  </section>;
}

function PaymentInfo({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-2"><dt className="font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-0.5 font-black text-slate-800">{value}</dd></div>;
}

function documentHistorySearch(q: string): Prisma.DocumentRequestWhereInput {
  if (!q) return {};
  const statusMatches = Object.values(DocumentRequestStatus).filter((status) => status.replaceAll("_", " ").toLowerCase().includes(q.toLowerCase()) || status.toLowerCase().includes(q.toLowerCase()));
  const requestSuffix = q.match(/^DR-\d{4}-(.+)$/i)?.[1] || q;
  const filters: Prisma.DocumentRequestWhereInput[] = [
    { id: { contains: requestSuffix } },
    { documentNumber: { contains: q } },
    { purpose: { contains: q } },
    { homeowner: { user: { name: { contains: q } } } },
    { subjectMember: { is: { fullName: { contains: q } } } },
    { definition: { is: { displayName: { contains: q } } } },
    { definition: { is: { code: { contains: q } } } },
    { configuration: { is: { displayName: { contains: q } } } },
    { paymentRequest: { is: { referenceNumber: { contains: q } } } },
    { paymentRequest: { is: { collection: { is: { receiptNumber: { contains: q } } } } } },
  ];
  if (statusMatches.length > 0) filters.push({ status: { in: statusMatches } });
  return {
    OR: filters,
  };
}

function historyPageParams(query: { q?: string; status?: string; type?: string; date?: string }, page: number) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.type) params.set("type", query.type);
  if (query.date) params.set("date", query.date);
  params.set("page", String(page));
  return params.toString();
}
