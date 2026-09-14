import { AiPrivacyClassification, Role } from "@prisma/client";
import { Bot, CheckCircle2, DatabaseZap, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import {
  indexDocumentForAiAction,
  purgeDocumentFromAiAction,
  recordDocumentMalwareValidationAction,
  updateDocumentAiEligibilityAction,
} from "@/lib/actions/ai-knowledge";
import { isAiRepositoryDocumentMalwareValidated } from "@/lib/ai-assistance/knowledge-eligibility";
import { requireUser } from "@/lib/auth";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

function stateClass(value: string) {
  if (value === "INDEXED_BLOCKED") return "bg-rose-100 text-rose-800";
  if (value === "INDEXED_STALE") return "bg-amber-100 text-amber-900";
  if (value === "INDEXED") return "bg-emerald-100 text-emerald-800";
  if (value === "FAILED") return "bg-rose-100 text-rose-800";
  if (value === "PENDING") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-600";
}

export default async function AdminAiKnowledgePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser(Role.ADMIN);
  if (!user.permissions.includes(Permission.AI_KNOWLEDGE_MANAGE)) throw new Error("AI knowledge-management permission is required.");
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
  const now = new Date();

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-indigo-700">Approved tenant knowledge</p><h1 className="mt-1 text-3xl font-black text-slate-950">AI knowledge sources</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Publishing a document does not automatically expose it to AI. Classify it, explicitly enable AI use, record approved malware-validation evidence, then index it into this tenant&apos;s isolated provider namespace. Personal, sensitive, and restricted records are excluded from the general knowledge index.</p></div><Link className="btn-secondary" href="/admin/ai-assistance">AI governance</Link></div>
    {success && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{success}</p>}
    {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p>}

    <section className="rounded-3xl border border-blue-100 bg-blue-50/50 p-5 sm:p-6">
      <div className="flex items-start gap-3"><DatabaseZap className="mt-0.5 size-5 shrink-0 text-blue-700" /><div><h2 className="font-black text-blue-950">How a document becomes AI knowledge</h2><p className="mt-1 text-sm leading-6 text-blue-900/80">1. Publish the repository record. 2. Choose an allowed privacy classification and explicitly enable AI. 3. Record malware/antivirus validation evidence. 4. Index the approved source. 5. Test the Resident Assistant or Staff Copilot with a question answered by that source.</p><p className="mt-2 text-xs font-semibold leading-5 text-blue-900/70">“Validated indexed knowledge” means at least one source has completed these controls. HOAHub does not silently mark existing tenant files safe and does not bypass the malware gate.</p></div></div>
    </section>

    <section className="rounded-3xl border border-indigo-100 bg-indigo-50/40 p-5 sm:p-6"><div className="flex items-start gap-3"><Bot className="mt-0.5 size-5 shrink-0 text-indigo-700" /><div><h2 className="font-black text-indigo-950">Retrieval boundary</h2><p className="mt-1 text-sm leading-6 text-indigo-900/80">Resident AI can retrieve only documents that are <b>Published + Tenant Public + Public privacy classification + AI Enabled + effective + not expired + malware-safe</b>. Staff AI may also use approved Internal knowledge, but never Personal, Sensitive, or Restricted documents through general RAG.</p></div></div></section>

    <section className="grid gap-4">
      {documents.map((document) => {
        const binding = bindingByDocument.get(document.id);
        const checksumCurrent = binding?.indexedChecksumSha256 === document.checksumSha256;
        const blockers: string[] = [];
        if (!document.aiEnabled) blockers.push("Explicitly enable this document for AI.");
        if (document.status !== "PUBLISHED") blockers.push("Publish the repository document.");
        if (["PERSONAL", "SENSITIVE", "RESTRICTED"].includes(document.privacyClassification)) blockers.push("Use Public or Internal privacy classification; Personal, Sensitive, and Restricted are excluded from general AI knowledge.");
        if (document.visibility === "RESTRICTED") blockers.push("Restricted repository visibility cannot enter the general AI knowledge index.");
        if (!isAiRepositoryDocumentMalwareValidated(document.malwareScanStatus)) blockers.push(`Record a Passed malware-validation result. Current state: ${label(document.malwareScanStatus)}.`);
        if (document.effectiveAt && document.effectiveAt > now) blockers.push("The document is future-effective and cannot be active knowledge yet.");
        if (document.expiresAt && document.expiresAt <= now) blockers.push("The document is expired and cannot be active knowledge.");
        const readyForIndex = blockers.length === 0;
        const retrievableNow = Boolean(binding?.indexStatus === "INDEXED" && checksumCurrent && readyForIndex);
        const statusLabel = binding?.indexStatus === "INDEXED" && !retrievableNow
          ? checksumCurrent ? "INDEXED_BLOCKED" : "INDEXED_STALE"
          : binding?.indexStatus ?? "NOT_INDEXED";
        const needsIndex = binding?.indexStatus !== "INDEXED" || !checksumCurrent;

        return <article key={document.id} className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{document.category.name}</span><span className={`rounded-full px-2.5 py-1 text-xs font-black ${stateClass(statusLabel)}`}>{label(statusLabel)}</span>{binding?.indexStatus === "INDEXED" && !checksumCurrent && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-900">REINDEX REQUIRED</span>}</div><h2 className="mt-3 text-lg font-black text-slate-950">{document.title}</h2><p className="mt-1 text-sm text-slate-500">{document.documentReference || "No reference"} · Rev {document.currentRevision} · {label(document.status)} · {label(document.visibility)}</p>{binding?.lastError && <p className="mt-2 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-800">{binding.lastError}</p>}</div>
            <div className="flex flex-wrap gap-2">
              <Link className="btn-secondary min-h-10" href={`/admin/document-management/${document.id}`}>Repository record</Link>
              {binding?.indexStatus === "INDEXED" && <form action={purgeDocumentFromAiAction}><input type="hidden" name="documentId" value={document.id} /><button className="btn-secondary min-h-10">Purge from AI</button></form>}
              {readyForIndex && needsIndex && <form action={indexDocumentForAiAction}><input type="hidden" name="documentId" value={document.id} /><button className="btn-primary min-h-10 inline-flex items-center gap-2"><DatabaseZap className="size-4" /> Index approved source</button></form>}
              {!readyForIndex && needsIndex && <button className="btn-secondary min-h-10 cursor-not-allowed opacity-60" type="button" disabled>Index blocked</button>}
            </div>
          </div>

          <div className={`mt-5 rounded-2xl border p-4 ${readyForIndex ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-start gap-3">{readyForIndex ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" /> : <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-800" />}<div><h3 className={`text-sm font-black ${readyForIndex ? "text-emerald-900" : "text-amber-950"}`}>{readyForIndex ? "Ready to index" : "Index readiness"}</h3>{readyForIndex ? <p className="mt-1 text-xs leading-5 text-emerald-800">All repository, privacy, lifecycle, and malware-validation gates pass. Use <b>Index approved source</b> above if this revision is not yet indexed.</p> : <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-900">{blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}</ul>}</div></div>
          </div>

          <form action={updateDocumentAiEligibilityAction} className="mt-5 grid gap-4 border-t pt-5 sm:grid-cols-[minmax(200px,.65fr)_minmax(220px,.7fr)_minmax(0,1fr)_auto] sm:items-end">
            <input type="hidden" name="documentId" value={document.id} />
            <label><span className="label">Privacy classification</span><select className="field" name="privacyClassification" defaultValue={document.privacyClassification}>{Object.values(AiPrivacyClassification).map((classification) => <option key={classification} value={classification}>{label(classification)}</option>)}</select></label>
            <label className="flex min-h-12 items-center gap-3 rounded-xl border px-4 text-sm font-bold"><input className="size-5" type="checkbox" name="aiEnabled" defaultChecked={document.aiEnabled} /> Explicitly enable for AI</label>
            <div className="text-xs leading-5 text-slate-500"><p>Effective: {document.effectiveAt ? document.effectiveAt.toLocaleDateString("en-PH") : "No start date"}</p><p>Expires: {document.expiresAt ? document.expiresAt.toLocaleDateString("en-PH") : "No expiration"}</p><p>Malware state: {label(document.malwareScanStatus)}</p></div>
            <button className="btn-secondary min-h-11">Save AI policy</button>
          </form>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-slate-700" /><div className="min-w-0 flex-1"><h3 className="text-sm font-black text-slate-900">Record malware-validation evidence</h3><p className="mt-1 text-xs leading-5 text-slate-600">Use this only after the file has been checked by your approved malware/antivirus process. This action records the result and evidence reference for audit; it does not pretend that HOAHub performed an antivirus scan. A replacement file resets validation to Not Configured and purges stale AI knowledge.</p>
              <form action={recordDocumentMalwareValidationAction} className="mt-3 grid gap-3 lg:grid-cols-[190px_minmax(260px,1fr)_auto] lg:items-end">
                <input type="hidden" name="documentId" value={document.id} />
                <label><span className="label">Validation result</span><select className="field" name="validationResult" defaultValue="" required><option value="" disabled>Select result</option><option value="PASSED">Passed</option><option value="FAILED">Failed</option></select></label>
                <label><span className="label">Evidence reference</span><input className="field" name="evidenceReference" maxLength={500} placeholder="AV tool / scan date / ticket / evidence record" required /></label>
                <button className="btn-secondary min-h-11">Record validation</button>
                <label className="flex items-start gap-2 text-xs leading-5 text-slate-600 lg:col-span-3"><input className="mt-0.5 size-4" type="checkbox" name="validationConfirmed" required /> I confirm this file was validated using the HOA&apos;s approved malware/antivirus process and the underlying evidence is retained according to the association&apos;s records policy.</label>
              </form>
            </div></div>
          </div>

          {document.aiEnabled && !readyForIndex && <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><p>This record is not retrievable by AI until publication, privacy classification, visibility, malware, and lifecycle requirements permit it. If malware state is Not Configured, record approved validation evidence above before expecting resident/staff answers from this source.</p></div>}
        </article>;
      })}
      {!documents.length && <article className="rounded-3xl border border-dashed bg-white p-8 text-center"><h2 className="font-black text-slate-900">No repository documents yet</h2><p className="mt-2 text-sm text-slate-500">Upload and govern tenant documents in Document Management before enabling approved knowledge for AI.</p><Link className="btn-primary mt-4 inline-flex" href="/admin/document-management/upload">Upload document</Link></article>}
    </section>
  </div>;
}
