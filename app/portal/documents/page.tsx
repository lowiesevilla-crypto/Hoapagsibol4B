import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { DocumentRequestForm } from "@/components/document-request-form";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { documentTypeLabel } from "@/lib/services/documents";
import { getPaymentSettings } from "@/lib/system-settings";
import { money, shortDate } from "@/lib/utils";

export default async function PortalDocumentsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; message?: string; status?: string; type?: string; date?: string; page?: string }> }) {
  const user = await requireUser();
  const homeownerId = user.homeownerProfile!.id;
  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const where = { tenantId: user.tenantId, homeownerId, archivedAt: null, ...(query.status ? { status: query.status as never } : {}), ...(query.type ? { type: query.type as never } : {}), ...(query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? { requestedAt: { gte: new Date(`${query.date}T00:00:00.000Z`), lt: new Date(`${query.date}T23:59:59.999Z`) } } : {}) };
  const [requests, requestCount, unpaid, paymentSettings] = await Promise.all([
    prisma.documentRequest.findMany({ where, include: { histories: { include: { actor: true }, orderBy: { createdAt: "desc" } } }, orderBy: { requestedAt: "desc" }, skip: (page - 1) * 10, take: 10 }),
    prisma.documentRequest.count({ where }),
    prisma.bill.aggregate({ where: { tenantId: user.tenantId, homeownerId, archivedAt: null, balance: { gt: 0 } }, _sum: { balance: true } }),
    getPaymentSettings(user.tenantId),
  ]);
  const unpaidBalance = Number(unpaid._sum.balance ?? 0);
  return <>
    <PageHeader eyebrow="Homeowner services" title="Document requests" description="Request, track, and download official HOA certificates and passes." />
    {query.error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{query.error}</div>}
    {query.success && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{query.message || "Request submitted successfully."}</div>}
    {unpaidBalance > 0 && <section className="card mb-6 border-amber-200 bg-amber-50">
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center"><div><h2 className="text-lg font-black text-amber-950">Outstanding monthly dues</h2><p className="mt-1 text-sm text-amber-900">You may submit a request, but downloading the generated document is restricted while your current balance of <b>{money(unpaidBalance)}</b> remains unpaid, unless an administrator records an override.</p><Link className="btn-primary mt-4 inline-flex" href="/portal/pay">Open Pay by QR</Link></div><div className="mx-auto w-full max-w-52 rounded-2xl bg-white p-3 text-center shadow-sm">{paymentSettings.gcashQrImageUrl ? <Image className="h-auto w-full object-contain" src={paymentSettings.gcashQrImageUrl} alt="GCash payment QR code" width={320} height={320} unoptimized /> : <p className="p-4 text-sm font-bold text-slate-600">GCash QR is currently unavailable. Please contact Admin.</p>}</div></div>
    </section>}
    <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
      <DocumentRequestForm />
      <section className="card"><h2 className="text-lg font-black">My request history</h2><p className="mb-4 text-sm text-slate-500">Status changes and generated documents remain available here.</p>
        {requests.length === 0 ? <p className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">You have not submitted a document request yet.</p> : <div className="space-y-3">{requests.map((item) => { const downloadable = unpaidBalance <= 0 || item.allowDownloadDespiteBalance; return <article key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex flex-col justify-between gap-2 sm:flex-row"><div><p className="font-black">{documentTypeLabel(item.type)}</p><p className="text-xs text-slate-500">{item.origin === "ADMIN" ? "Created by HOA office" : `Requested ${shortDate(item.requestedAt)}`}{item.documentNumber ? ` | ${item.documentNumber}` : ""}{item.generatedAt ? ` | Generated ${shortDate(item.generatedAt)}` : ""}</p></div><span className={`badge ${item.status === "GENERATED" || item.status === "DOWNLOADED" ? "badge-paid" : item.status === "REJECTED" ? "badge-overdue" : "badge-info"}`}>{item.status.replaceAll("_", " ")}</span></div><p className="mt-2 text-sm text-slate-600">{item.purpose}</p>{(item.adminRemarks || item.remarks) && <p className="mt-2 rounded-xl bg-white p-2 text-xs"><b>Remarks:</b> {item.adminRemarks || item.remarks}</p>}{item.generatedContent && <div className="mt-3 flex flex-wrap gap-2"><Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/documents/${item.id}`}>View details</Link>{downloadable ? <><a className="btn-primary min-h-9 px-3 py-1.5 text-xs" href={`/documents/${item.id}/pdf`}>Download PDF</a><Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/documents/${item.id}/print`}>Print</Link></> : <span className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900">Download locked: {money(unpaidBalance)} balance</span>}</div>}<details className="mt-3 rounded-xl bg-white p-3 text-xs"><summary className="cursor-pointer font-bold">Status history ({item.histories.length})</summary><div className="mt-2 space-y-1">{item.histories.map((history) => <p key={history.id}><b>{history.status.replaceAll("_", " ")}</b> - {shortDate(history.createdAt)}{history.note ? `: ${history.note}` : ""}</p>)}</div></details></article>; })}</div>}
        {requestCount > 10 && <div className="mt-4 flex items-center justify-between text-sm"><Link className={`btn-secondary ${page <= 1 ? "pointer-events-none opacity-50" : ""}`} href={`?page=${page - 1}`}>Previous</Link><span>Page {page} of {Math.ceil(requestCount / 10)}</span><Link className={`btn-secondary ${page >= Math.ceil(requestCount / 10) ? "pointer-events-none opacity-50" : ""}`} href={`?page=${page + 1}`}>Next</Link></div>}
      </section>
    </div>
  </>;
}
