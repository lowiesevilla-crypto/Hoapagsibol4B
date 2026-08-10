"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { Bot, FileText, Loader2, Send, ShieldCheck } from "lucide-react";

type Source = {
  documentId: string;
  title: string;
  category: string;
  reference: string | null;
  revision?: number;
  effectiveAt: string | Date | null;
};

type Turn = {
  id: string;
  question: string;
  answer: string;
  sources: Source[];
};

export function ResidentAiAssistant() {
  const [question, setQuestion] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = question.trim();
    if (!value || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/portal/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: value, conversationId }),
      });
      const body = await response.json() as { error?: string; conversationId?: string | null; answer?: string; sources?: Source[]; requestId?: string };
      if (!response.ok || !body.answer) throw new Error(body.error || "HOAHub AI could not answer this question.");
      setTurns((current) => [...current, { id: body.requestId || `${Date.now()}`, question: value, answer: body.answer || "", sources: body.sources || [] }]);
      setConversationId(body.conversationId || conversationId);
      setQuestion("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "HOAHub AI could not answer this question.");
    } finally {
      setLoading(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!loading && question.trim()) event.currentTarget.form?.requestSubmit();
  }

  const suggestions = ["What is my current balance?", "What are the requirements for a residency certificate?", "What does our approved policy say?"];

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
    <section className="flex min-h-[calc(100dvh-10.5rem)] min-w-0 flex-col rounded-2xl border bg-white shadow-sm sm:min-h-[42rem]">
      <div className="border-b p-4 sm:p-6"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-700"><Bot className="size-5" /></span><div><h2 className="text-lg font-black text-slate-950 sm:text-xl">Ask your association</h2><p className="mt-1 text-sm leading-6 text-slate-500">Answers use your own HOA records or approved resident knowledge sources.</p></div></div></div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" aria-live="polite">
        {!turns.length && <div className="rounded-2xl border border-dashed bg-slate-50 p-4 text-center sm:p-6"><Bot className="mx-auto size-7 text-sky-600" /><h3 className="mt-3 font-black text-slate-900">Ask a resident question</h3><p className="mt-1 text-sm leading-6 text-slate-500">Start with your balance, document requirements, services, or an approved policy.</p><div className="mt-4 flex flex-wrap justify-center gap-2">{suggestions.map((item) => <button key={item} type="button" onClick={() => setQuestion(item)} className="rounded-full border border-sky-100 bg-white px-3 py-2 text-xs font-black text-sky-800 shadow-sm transition hover:bg-sky-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-200">{item}</button>)}</div></div>}
        {turns.map((turn) => <div key={turn.id} className="space-y-3">
          <div className="ml-auto max-w-[88%] rounded-2xl bg-pine-700 px-4 py-3 text-sm leading-6 text-white sm:max-w-[78%]">{turn.question}</div>
          <div className="max-w-[94%] rounded-2xl border bg-slate-50 p-4 text-sm leading-6 text-slate-800 sm:max-w-[86%]">
            <p className="whitespace-pre-wrap">{turn.answer}</p>
            {turn.sources.length > 0 && <div className="mt-4 border-t pt-3"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Authoritative sources</p><div className="mt-2 space-y-2">{turn.sources.map((source) => <div key={source.documentId} className="flex items-start gap-2 rounded-xl bg-white p-3"><FileText className="mt-0.5 size-4 shrink-0 text-indigo-600" /><div><p className="font-bold text-slate-800">{source.title}</p><p className="text-xs text-slate-500">{source.category}{source.reference ? ` · ${source.reference}` : ""}{source.revision ? ` · Revision ${source.revision}` : ""}{source.effectiveAt ? ` · Effective ${new Date(source.effectiveAt).toLocaleDateString("en-PH")}` : ""}</p></div></div>)}</div></div>}
          </div>
        </div>)}
      </div>
      <form onSubmit={submit} className="border-t bg-white p-3 sm:p-5">
        {error && <p className="mb-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p>}
        <div className="flex gap-2"><textarea className="field min-h-12 flex-1 resize-none text-base sm:text-sm" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={handleComposerKeyDown} maxLength={4000} rows={2} placeholder="Ask about your balance, a requirement, service, or approved HOA policy..." aria-label="Question for HOAHub AI" /><button className="btn-primary min-h-12 w-14 shrink-0 self-end px-0" disabled={loading || !question.trim()} aria-label="Send question">{loading ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}</button></div>
        <p className="mt-2 text-xs leading-5 text-slate-500"><span className="font-semibold text-slate-600">Enter to send.</span> Avoid passwords, IDs, payment proofs, and other sensitive personal data.</p>
      </form>
    </section>

    <details className="rounded-2xl border bg-white p-4 shadow-sm xl:hidden">
      <summary className="cursor-pointer text-sm font-black text-slate-900">Assistant rules and privacy</summary>
      <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
        <p>Tenant, role, publication, privacy, lifecycle and AI-policy checks are enforced before retrieval.</p>
        <p>Policy answers cite approved sources. Own-record answers use your authenticated HOAHub records only.</p>
        <p>AI explanations are assistance, not official approval, legal advice, or financial decisions.</p>
      </div>
    </details>

    <aside className="hidden space-y-4 xl:block">
      <section className="rounded-3xl border border-indigo-100 bg-indigo-50/40 p-5"><ShieldCheck className="size-6 text-indigo-700" /><h2 className="mt-3 font-black text-indigo-950">Tenant-scoped by design</h2><p className="mt-2 text-sm leading-6 text-indigo-900/80">Your signed-in HOA membership determines the tenant. Typing another association’s name cannot switch the AI tenant or grant access to its documents.</p></section>
      <section className="rounded-3xl border bg-white p-5 shadow-sm"><h2 className="font-black text-slate-900">What this assistant does</h2><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600"><li>• Uses only approved, published and currently effective resident knowledge.</li><li>• Shows the HOA source records used for supported answers.</li><li>• Refuses when there is no authorized supporting source.</li><li>• Keeps normal HOAHub services available if the AI provider is unavailable.</li></ul></section>
      <section className="rounded-3xl border bg-white p-5 shadow-sm"><h2 className="font-black text-slate-900">Human authority</h2><p className="mt-2 text-sm leading-6 text-slate-600">AI explanations are assistance, not autonomous HOA approval, denial, legal advice, medical advice, financial decisions, penalties, or disciplinary decisions. Contact your association for an official determination when needed.</p></section>
    </aside>
  </div>;
}
