import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getAccessibleGeneratedDocument } from "@/lib/document-access";
import { documentTypeLabel } from "@/lib/services/documents";
import { buildSelfContainedDocumentAssets } from "@/lib/services/issued-document-export";
import { shortDate } from "@/lib/utils";

export default async function GeneratedDocumentDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const { user, request, downloadAllowed, access } = await getAccessibleGeneratedDocument(id);
  const embedded = await buildSelfContainedDocumentAssets(request.generatedContent || "", user.tenant.slug);
  const actions = downloadAllowed ? <><Link className="btn-secondary" href={`/documents/${id}/print`}>Print</Link><a className="btn-primary" href={`/documents/${id}/pdf`}>Download PDF</a><a className="btn-secondary" href={`/documents/${id}/download`}>Download HTML</a></> : undefined;
  const title = request.definition?.displayName || request.configuration?.displayName || documentTypeLabel(request.type);
  return <main className="mx-auto min-h-screen max-w-6xl bg-slate-50 p-4 sm:p-8"><PageHeader eyebrow="Official HOA document" title={title} description={`${request.documentNumber} | Generated ${shortDate(request.generatedAt!)}`} action={actions} />{query.error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{query.error}</div>}{!downloadAllowed && access.message && <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{access.message}</div>}<section className="card"><div className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3"><Info label="Official document number" value={request.documentNumber!} /><Info label="Homeowner" value={request.homeowner.user.name} /><Info label="Property" value={`Block ${request.homeowner.block}, Lot ${request.homeowner.lot}`} /><Info label="Status" value={request.status.replaceAll("_", " ")} /><Info label="Approved by" value={request.approvedByOfficer?.fullName || request.approvedBy?.name || "Authorized HOA administrator"} /><Info label="Validity" value={request.validityDate ? shortDate(request.validityDate) : "Not specified"} /><Info label="Verification code" value={request.verificationCode!} /></div><div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><iframe title={`Official rendered document ${request.documentNumber}`} className="h-[78vh] min-h-[720px] w-full bg-white" sandbox="" srcDoc={embedded.html} /></div></section><section className="card mt-5"><h2 className="font-black">Request status history</h2><div className="mt-3 space-y-2">{request.histories.map((item) => <div className="flex flex-col justify-between gap-1 rounded-xl bg-slate-50 p-3 text-sm sm:flex-row" key={item.id}><span><b>{item.status.replaceAll("_", " ")}</b>{item.note ? ` - ${item.note}` : ""}</span><span className="text-xs text-slate-500">{shortDate(item.createdAt)} | {item.actor?.name || "System"}</span></div>)}</div></section></main>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="font-bold">{value}</p></div>; }
