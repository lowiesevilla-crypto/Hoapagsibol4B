"use client";

import { FormEvent, KeyboardEvent, useRef, useState } from "react";
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

type Suggestion = string | {
  label: string;
  prompt: string;
};

type ResidentAiAssistantProps = {
  endpoint?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  headerTitle?: string;
  headerDescription?: string;
  placeholder?: string;
  suggestions?: Suggestion[];
  rulesTitle?: string;
  rules?: string[];
  initialGreeting?: string;
};

const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { label: "Check my balance", prompt: "What is my current balance?" },
  { label: "Document requirements", prompt: "What are the requirements for a residency certificate?" },
  { label: "Request a document", prompt: "How do I request a resident document?" },
  { label: "Check request status", prompt: "How can I check the status of my document request?" },
  { label: "Ask about HOA rules", prompt: "What do our approved HOA rules and policies say?" },
];

export function ResidentAiAssistant({
  endpoint = "/api/portal/ai/ask",
  emptyTitle = "Ask a resident question",
  emptyDescription = "Choose a common task below or ask your own question.",
  headerTitle = "Ask your association",
  headerDescription = "Answers from your association's approved records and your authorized account data.",
  placeholder = "Ask your association...",
  suggestions = DEFAULT_SUGGESTIONS,
  rulesTitle = "What this assistant does",
  rules = [
    "Uses only approved, published and currently effective resident knowledge.",
    "Shows the HOA source records used for supported answers.",
    "Refuses when there is no authorized supporting source.",
    "Keeps normal HOAHub services available if the AI provider is unavailable.",
  ],
  initialGreeting,
}: ResidentAiAssistantProps) {
  const [question, setQuestion] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  function resizeComposer(element: HTMLTextAreaElement) {
    element.style.height = "52px";
    element.style.height = `${Math.min(Math.max(element.scrollHeight, 52), 128)}px`;
  }

  function chooseSuggestion(item: Suggestion) {
    const prompt = typeof item === "string" ? item : item.prompt;
    setQuestion(prompt);
    setError("");
    requestAnimationFrame(() => {
      if (!composerRef.current) return;
      resizeComposer(composerRef.current);
      composerRef.current.focus();
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = question.trim();
    if (!value || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: value, conversationId }),
      });
      const body = await response.json() as { error?: string; conversationId?: string | null; answer?: string; sources?: Source[]; requestId?: string };
      if (!response.ok || !body.answer) throw new Error(body.error || "HOAHub AI could not answer this question.");
      setTurns((current) => [...current, { id: body.requestId || `${Date.now()}`, question: value, answer: body.answer || "", sources: body.sources || [] }]);
      setConversationId(body.conversationId || conversationId);
      setQuestion("");
      if (composerRef.current) composerRef.current.style.height = "52px";
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

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
    <section className="flex min-h-[calc(100dvh-10.5rem)] min-w-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm sm:min-h-[42rem]">
      <div className="border-b p-3.5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700 sm:size-10 sm:rounded-2xl"><Bot className="size-5" /></span>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-950 sm:text-xl">{headerTitle}</h2>
            <p className="mt-0.5 text-sm leading-5 text-slate-500 sm:mt-1 sm:leading-6">{headerDescription}</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3.5 sm:p-6" aria-live="polite">
        {!turns.length && <div className="rounded-2xl border border-dashed bg-slate-50 p-3.5 sm:p-5">
          <h3 className="font-black leading-6 text-slate-900">{initialGreeting || emptyTitle}</h3>
          <p className="mt-1 text-sm leading-5 text-slate-500">{emptyDescription}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {suggestions.map((item) => {
              const label = typeof item === "string" ? item : item.label;
              const prompt = typeof item === "string" ? item : item.prompt;
              return <button
                key={`${label}-${prompt}`}
                type="button"
                onClick={() => chooseSuggestion(item)}
                className="min-h-11 rounded-xl border border-sky-100 bg-white px-3 py-2.5 text-left text-sm font-bold leading-5 text-sky-800 shadow-sm transition hover:bg-sky-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-200 sm:rounded-full sm:text-center"
                aria-label={`${label}: ${prompt}`}
              >{label}</button>;
            })}
          </div>
        </div>}

        {turns.map((turn) => <div key={turn.id} className="space-y-3">
          <div className="ml-auto max-w-[88%] rounded-2xl bg-pine-700 px-4 py-3 text-sm leading-6 text-white sm:max-w-[78%]">{turn.question}</div>
          <div className="max-w-[94%] rounded-2xl border bg-slate-50 p-4 text-sm leading-6 text-slate-800 sm:max-w-[86%]">
            <p className="whitespace-pre-wrap">{turn.answer}</p>
            {turn.sources.length > 0 && <div className="mt-4 border-t pt-3">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500"><FileText className="size-3.5" /><span>Sources used</span></div>
              <div className="mt-2 space-y-2">{turn.sources.map((source) => <div key={source.documentId} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="font-bold text-slate-800">{source.title}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">{source.category}{source.reference ? ` · ${source.reference}` : ""}{source.revision ? ` · Revision ${source.revision}` : ""}{source.effectiveAt ? ` · Effective ${new Date(source.effectiveAt).toLocaleDateString("en-PH")}` : ""}</p>
              </div>)}</div>
            </div>}
          </div>
        </div>)}
      </div>

      <form onSubmit={submit} className="sticky bottom-0 z-10 border-t bg-white/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:p-5">
        {error && <p className="mb-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800" role="alert">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            ref={composerRef}
            className="field min-h-[52px] max-h-32 flex-1 resize-none overflow-y-auto text-base leading-6"
            value={question}
            onChange={(event) => { setQuestion(event.target.value); resizeComposer(event.currentTarget); }}
            onKeyDown={handleComposerKeyDown}
            maxLength={4000}
            rows={1}
            placeholder={placeholder}
            aria-label="Question for HOAHub AI"
          />
          <button className="btn-primary h-[52px] w-[52px] shrink-0 px-0" disabled={loading || !question.trim()} aria-label="Send question">
            {loading ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
          </button>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500"><span className="font-semibold text-slate-600">Enter to send.</span> Don't share passwords, IDs, or payment proofs.</p>
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
      <section className="rounded-3xl border bg-white p-5 shadow-sm"><h2 className="font-black text-slate-900">{rulesTitle}</h2><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">{rules.map((rule) => <li key={rule}>• {rule}</li>)}</ul></section>
      <section className="rounded-3xl border bg-white p-5 shadow-sm"><h2 className="font-black text-slate-900">Human authority</h2><p className="mt-2 text-sm leading-6 text-slate-600">AI explanations are assistance, not autonomous HOA approval, denial, legal advice, medical advice, financial decisions, penalties, or disciplinary decisions. Contact your association for an official determination when needed.</p></section>
    </aside>
  </div>;
}
