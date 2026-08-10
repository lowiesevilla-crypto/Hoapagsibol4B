"use client";

import { FormEvent, useState } from "react";
import { Bot, FileText, Loader2, Send, ShieldCheck } from "lucide-react";

type Source = {
  documentId: string;
  title: string;
  category: string;
  reference: string | null;
  revision: number;
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

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
    <section className="min-w-0 rounded-3xl border bg-white shadow-sm">
      <div className="border-b p-5 sm:p-6"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-700"><Bot className="size-5" /></span><div><h2 className="text-xl font-black text-slate-950">Ask your association</h2><p className="mt-1 text-sm leading-6 text-slate-500">Answers are limited to this HOA’s approved, current, resident-visible AI knowledge sources.</p></div></div></div>
      <div className="max-h-[56vh] space-y-5 overflow-y-auto p-5 sm:p-6" aria-live="polite">
        {!turns.length && <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-center"><Bot className="mx-auto size-7 text-indigo-600" /><h3 className="mt-3 font-black text-slate-900">Try a policy or service question</h3><p className="mt-1 text-sm leading-6 text-slate-500">For example: “What does our published parking policy say?” or “What are the requirements for a residency certificate?”</p></div>}
        {turns.map((turn) => <div key={turn.id} className="space-y-3">
          <div className="ml-auto max-w-[90%] rounded-2xl bg-pine-700 px-4 py-3 text-sm leading-6 text-white sm:max-w-[78%]">{turn.question}</div>
          <div className="max-w-[96%] rounded-2xl border bg-slate-50 p-4 text-sm leading-6 text-slate-800 sm:max-w-[88%]">
            <p className="whitespace-pre-wrap">{turn.answer}</p>
            {turn.sources.length > 0 && <div className="mt-4 border-t pt-3"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Authoritative sources</p><div className="mt-2 space-y-2">{turn.sources.map((source) => <div key={source.documentId} className="flex items-start gap-2 rounded-xl bg-white p-3"><FileText className="mt-0.5 size-4 shrink-0 text-indigo-600" /><div><p className="font-bold text-slate-800">{source.title}</p><p className="text-xs text-slate-500">{source.category}{source.reference ? ` · ${source.reference}` : ""} · Revision {source.revision}{source.effectiveAt ? ` · Effective ${new Date(source.effectiveAt).toLocaleDateString("en-PH")}` : ""}</p></div></div>)}</div></div>}
          </div>
        </div>)}
      </div>
      <form onSubmit={submit} className="border-t p-4 sm:p-5">
        {error && <p className="mb-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p>}
        <div className="flex gap-2"><textarea className="field min-h-12 flex-1 resize-none" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={4000} rows={2} placeholder="Ask about an approved HOA policy, bylaw, document requirement, or community service..." aria-label="Question for HOAHub AI" /><button className="btn-primary min-h-12 self-end px-4" disabled={loading || !question.trim()} aria-label="Send question">{loading ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}</button></div>
        <p className="mt-2 text-xs leading-5 text-slate-500">Do not enter passwords, API keys, account numbers, contact details, IDs, payment proofs, medical information, or other sensitive personal data in this knowledge assistant.</p>
      </form>
    </section>

    <aside className="space-y-4">
      <section className="rounded-3xl border border-indigo-100 bg-indigo-50/40 p-5"><ShieldCheck className="size-6 text-indigo-700" /><h2 className="mt-3 font-black text-indigo-950">Tenant-scoped by design</h2><p className="mt-2 text-sm leading-6 text-indigo-900/80">Your signed-in HOA membership determines the tenant. Typing another association’s name cannot switch the AI tenant or grant access to its documents.</p></section>
      <section className="rounded-3xl border bg-white p-5 shadow-sm"><h2 className="font-black text-slate-900">What this assistant does</h2><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600"><li>• Uses only approved, published and currently effective resident knowledge.</li><li>• Shows the HOA source records used for supported answers.</li><li>• Refuses when there is no authorized supporting source.</li><li>• Keeps normal HOAHub services available if the AI provider is unavailable.</li></ul></section>
      <section className="rounded-3xl border bg-white p-5 shadow-sm"><h2 className="font-black text-slate-900">Human authority</h2><p className="mt-2 text-sm leading-6 text-slate-600">AI explanations are assistance, not autonomous HOA approval, denial, legal advice, medical advice, financial decisions, penalties, or disciplinary decisions. Contact your association for an official determination when needed.</p></section>
    </aside>
  </div>;
}
