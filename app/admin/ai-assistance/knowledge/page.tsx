import { AiPrivacyClassification, Role } from "@prisma/client";
import { Bot, DatabaseZap, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { indexDocumentForAiAction, purgeDocumentFromAiAction, updateDocumentAiEligibilityAction } from "@/lib/actions/ai-knowledge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

function stateClass(value: string) {
  if (value === "INDEXED") return "bg-emerald-100 text-emerald-800";
  if (value === "FAILED") return "bg-rose-100 text-rose-800";
  if (value === "PENDING") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-600";
}

export default async function AdminAiKnowledgePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser(Role.ADMIN);
  const query = await searchParams;
  const [documents, bindings] = await Promise.all([
    prisma.repositoryDocument.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ updatedAt: "desc" }],
      select: { id: true, title: true, documentReference: true, visibility: true, status: true, aiEnabled: true, privacyClassification: true, currentRevision: true, checksumSha256: true, effectiveAt: true, expiresAt: true, malwareScanStatus: true, category: { select: { name: true } } },
    }),
    prisma.aiKnowledgeBinding.findMany({ where: { tenantId: user.tenantId }, select: { documentId: true, indexStatus: true, indexedChecksumSha256: true, indexedAt: true, lastError: true } }),
  ]);
  const bindingByDocument = new Map(bindings.map((binding) => [binding.documentId, binding]));
  const success = one(query.success);
  const error = one(query.error);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-indigo-700">Approved tenant knowledge</p><h1 className="mt-1 text-3xl font-black text-slate-950">AI knowledge sources</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Publishing a document does not automatically expose it to AI. Classify it, explicitly enable AI use, then index it into this tenant’s isolated provider namespace. Personal, sensitive, and restricted records are excluded from the general knowledge index.</p></div><Link className="btn-secondary" href="/admin/ai-assistance">AI governance</Link></div>
    {success && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{success}</p>}
    {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p>}

    <section className="rounded-3xl border border-indigo-100 bg-indigo-50/40 p-5 sm:p-6"><div className="flex items-start gap-3"><Bot className="mt-0.5 size-5 shrink-0 text-indigo-700" /><div><h2 className="font-black text-indigo-950">Retrieval boundary</h2><p className="mt-1 text-sm leading-6 text-indigo-900/80">Resident AI can retrieve only documents that are <b>Published + Tenant Public + Public privacy classification + AI Enabled + effective + not expired + malware-safe</b>. Staff AI may also use approved Internal knowledge, but never Personal, Sensitive, or Restricted documents through general RAG.</p></div></div></section>

    <section className="grid gap-4">
      {documents.map((document) => {
        const binding = bindingByDocument.get(document.id);
        const checksumCurrent = binding?.indexedChecksumSha256 === document.checksumSha256;
        const readyForIndex = document.aiEnabled && document.status === "PUBLISHED" && !["PERSONAL", "SENSITIVE", "RESTRICTED"].includes(document.privacyClassification) && document.visibility !== "RESTRICTED" && !["PENDING", "FAILED", "BLOCKED"].includes(document.malwareScanStatus);
        return <article key={document.id} className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{document.category.name}</span><span className={`rounded-full px-2.5 py-1 text-xs font-black ${stateClass(binding?.indexStatus ?? "NOT_INDEXED")}`}>{label(binding?.indexStatus ?? "NOT_INDEXED")}</span>{binding?.indexStatus === "INDEXED" && !checksumCurrent && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-900">REINDEX REQUIRED</span>}</div><h2 className="mt-3 text-lg font-black text-slate-950">{document.title}</h2><p className="mt-1 text-sm text-slate-500">{document.documentReference || "No reference"} · Rev {document.currentRevision} · {label(document.status)} · {label(document.visibility)}</p>{binding?.lastError && <p className="mt-2 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-800">{binding.lastError}</p>}</div>
            <div className="flex flex-wrap gap-2"><Link className="btn-secondary min-h-10" href={`/admin/document-management/${document.id}`}>Repository record</Link>{binding?.indexStatus === "INDEXED" && <form action={purgeDocumentFromAiAction}><input type="hidden" name="documentId" value={document.id} /><button className="btn-secondary min-h-10">Purge from AI</button></form>}{readyForIndex && (binding?.indexStatus !== "INDEXED" || !checksumCurrent) && <form action={indexDocumentForAiAction}><input type="hidden" name="documentId" value={document.id} /><button className="btn-primary min-h-10 inline-flex items-center gap-2"><DatabaseZap className="size-4" /> Index approved source</button></form>}</div>
          </div>

          <form action={updateDocumentAiEligibilityAction} className="mt-5 grid gap-4 border-t pt-5 sm:grid-cols-[minmax(200px,.65fr)_minmax(220px,.7fr)_minmax(0,1fr)_auto] sm:items-end">
            <input type="hidden" name="documentId" value={document.id} />
            <label><span className="label">Privacy classification</span><select className="field" name="privacyClassification" defaultValue={document.privacyClassification}>{Object.values(AiPrivacyClassification).map((classification) => <option key={classification} value={classification}>{label(classification)}</option>)}</select></label>
            <label className="flex min-h-12 items-center gap-3 rounded-xl border px-4 text-sm font-bold"><input className="size-5" type="checkbox" name="aiEnabled" defaultChecked={document.aiEnabled} /> Explicitly enable for AI</label>
            <div className="text-xs leading-5 text-slate-500"><p>Effective: {document.effectiveAt ? document.effectiveAt.toLocaleDateString("en-PH") : "No start date"}</p><p>Expires: {document.expiresAt ? document.expiresAt.toLocaleDateString("en-PH") : "No expiration"}</p><p>Malware state: {label(document.malwareScanStatus)}</p></div>
            <button className="btn-secondary min-h-11">Save AI policy</button>
          </form>
          {document.aiEnabled && !readyForIndex && <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><p>This record cannot be indexed until publication, privacy classification, visibility, malware, and lifecycle requirements permit it.</p></div>}
        </article>;
      })}
      {!documents.length && <article className="rounded-3xl border border-dashed bg-white p-8 text-center"><h2 className="font-black text-slate-900">No repository documents yet</h2><p className="mt-2 text-sm text-slate-500">Upload and govern tenant documents in Document Management before enabling approved knowledge for AI.</p><Link className="btn-primary mt-4 inline-flex" href="/admin/document-management/upload">Upload document</Link></article>}
    </section>
  </div>;
}
