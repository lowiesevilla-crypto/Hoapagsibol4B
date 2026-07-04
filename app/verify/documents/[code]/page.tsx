import { notFound } from "next/navigation";
import { AssociationLogo } from "@/components/association-logo";
import { platformPrisma } from "@/lib/db";
import { documentTypeLabel } from "@/lib/services/documents";
import { getAssociationSettings } from "@/lib/system-settings";
import { shortDate } from "@/lib/utils";

export default async function VerifyDocumentPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const request = await platformPrisma.documentRequest.findUnique({ where: { verificationCode: code.toUpperCase() }, include: { homeowner: { include: { user: true } }, processedBy: true, approvedBy: true } });
  if (!request?.generatedContent || !request.documentNumber) notFound();
  const association = await getAssociationSettings(request.tenantId);
  const archived = Boolean(request.archivedAt);
  return <main className="grid min-h-screen place-items-center bg-gradient-to-b from-pine-900 to-pine-700 p-4"><section className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl sm:p-9">
    <div className="flex items-center gap-4 border-b border-slate-200 pb-5"><AssociationLogo className="size-20" src={association.logoUrl} alt={`${association.name} logo`} /><div><p className="text-xs font-black uppercase tracking-widest text-pine-700">Verified HOA document</p><h1 className="text-xl font-black">{association.name}</h1></div></div>
    <div className={`mt-6 rounded-2xl border p-5 ${archived ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><p className={`text-sm font-black ${archived ? "text-amber-900" : "text-emerald-800"}`}>{archived ? "ARCHIVED DIGITAL RECORD" : "VALID DIGITAL RECORD"}</p><p className={`mt-1 text-sm ${archived ? "text-amber-800" : "text-emerald-700"}`}>{archived ? "This document has been archived and is no longer the current active copy." : "This verification code matches an official document stored in the HOA Digital Hub."}</p></div>
    <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2"><Item label="Document number" value={request.documentNumber} /><Item label="Document type" value={documentTypeLabel(request.type)} /><Item label="Document status" value={request.status.replaceAll("_", " ")} /><Item label="Homeowner" value={request.homeowner.user.name} /><Item label="Property" value={`Block ${request.homeowner.block}, Lot ${request.homeowner.lot}`} /><Item label="Approval date" value={shortDate(request.approvedAt!)} /><Item label="Valid until" value={request.validityDate ? shortDate(request.validityDate) : "Not specified"} /><Item label="Processed by" value={request.processedBy?.name || "Authorized HOA officer"} /><Item label="Approved by" value={request.approvedBy?.name || "Authorized HOA officer"} /><Item label="Verification code" value={request.verificationCode!} /></dl>
    <p className="mt-6 text-xs text-slate-500">For privacy and fraud prevention, this page confirms metadata only. Contact the HOA office if the printed document details do not match this record.</p>
  </section></main>;
}

function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-bold uppercase text-slate-500">{label}</dt><dd className="mt-1 font-bold text-ink">{value}</dd></div>; }
