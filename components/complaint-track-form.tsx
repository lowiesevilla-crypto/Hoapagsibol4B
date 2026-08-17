"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { LogOut, MessageCircle, Send, ShieldCheck } from "lucide-react";

const ACTIVE_POLL_MS = 5_000;
const IDLE_POLL_MS = 12_000;
const MAX_MESSAGE_LENGTH = 2_000;

type ConversationMessage = {
  id: string;
  body: string;
  createdAt: string;
  sender: "ANONYMOUS_COMPLAINANT" | "HOA_STAFF" | "SYSTEM";
  authorDisplayName: string;
};

type Conversation = {
  publicReference: string;
  title: string;
  requestedAction: string | null;
  status: string;
  submittedAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
  nextCursor: string | null;
};

type ApiError = { error?: string };

function mergeMessages(current: ConversationMessage[], incoming: ConversationMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => {
    const time = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return time || left.id.localeCompare(right.id);
  });
}

function safeClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ComplaintTrackForm() {
  const [trackingCode, setTrackingCode] = useState("");
  const [pin, setPin] = useState("");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [message, setMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [sendError, setSendError] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [sending, setSending] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const cursorRef = useRef<string | null>(null);
  const emptyPollsRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const pendingMessageRef = useRef<{ body: string; clientMessageId: string } | null>(null);
  const sessionActive = Boolean(conversation);

  const applyConversation = useCallback((next: Conversation, replaceMessages = false) => {
    cursorRef.current = next.nextCursor ?? cursorRef.current;
    setConversation((current) => ({
      ...next,
      messages: replaceMessages || !current ? next.messages : mergeMessages(current.messages, next.messages),
      nextCursor: next.nextCursor ?? current?.nextCursor ?? null,
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/complaints/anonymous/messages", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json() as { conversation: Conversation };
        if (!cancelled) applyConversation(payload.conversation, true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => { cancelled = true; };
  }, [applyConversation]);

  useEffect(() => {
    if (!sessionActive) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (cancelled) return;
      if (document.hidden) {
        timer = setTimeout(poll, IDLE_POLL_MS);
        return;
      }
      try {
        const after = cursorRef.current ? `?after=${encodeURIComponent(cursorRef.current)}` : "";
        const response = await fetch(`/api/complaints/anonymous/messages${after}`, { cache: "no-store" });
        if (response.status === 401) {
          if (!cancelled) {
            setConversation(null);
            cursorRef.current = null;
            pendingMessageRef.current = null;
            setAuthError("Your anonymous complaint session expired. Enter the tracking code and PIN again.");
          }
          return;
        }
        if (response.ok) {
          const payload = await response.json() as { conversation: Conversation };
          if (payload.conversation.messages.length > 0) {
            emptyPollsRef.current = 0;
            if (!cancelled) applyConversation(payload.conversation);
          } else {
            emptyPollsRef.current += 1;
            cursorRef.current = payload.conversation.nextCursor ?? cursorRef.current;
            if (!cancelled) {
              setConversation((current) => current ? {
                ...current,
                status: payload.conversation.status,
                updatedAt: payload.conversation.updatedAt,
                nextCursor: payload.conversation.nextCursor ?? current.nextCursor,
              } : current);
            }
          }
        } else {
          emptyPollsRef.current += 1;
        }
      } catch {
        emptyPollsRef.current += 1;
      } finally {
        if (!cancelled) {
          timer = setTimeout(poll, emptyPollsRef.current >= 3 ? IDLE_POLL_MS : ACTIVE_POLL_MS);
        }
      }
    }

    const onVisibility = () => {
      if (!document.hidden) {
        if (timer) clearTimeout(timer);
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    timer = setTimeout(poll, ACTIVE_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [applyConversation, sessionActive]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
  }, [conversation?.messages.length]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setAuthenticating(true);
    try {
      const response = await fetch("/api/complaints/anonymous/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingCode, pin }),
      });
      const payload = await response.json() as { conversation?: Conversation } & ApiError;
      if (!response.ok || !payload.conversation) throw new Error(payload.error || "Complaint could not be found.");
      emptyPollsRef.current = 0;
      pendingMessageRef.current = null;
      applyConversation(payload.conversation, true);
      setPin("");
      setTrackingCode("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Complaint could not be found.");
    } finally {
      setAuthenticating(false);
      setCheckingSession(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = message.trim();
    if (body.length < 2 || body.length > MAX_MESSAGE_LENGTH) return;
    setSending(true);
    setSendError("");
    const existingPending = pendingMessageRef.current;
    const clientMessageId = existingPending?.body === body ? existingPending.clientMessageId : safeClientMessageId();
    pendingMessageRef.current = { body, clientMessageId };
    try {
      const response = await fetch("/api/complaints/anonymous/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: body, clientMessageId }),
      });
      const payload = await response.json() as { message?: ConversationMessage } & ApiError;
      const sentMessage = payload.message;
      if (!response.ok || !sentMessage) throw new Error(payload.error || "Message could not be sent.");
      setConversation((current) => current ? { ...current, messages: mergeMessages(current.messages, [sentMessage]) } : current);
      pendingMessageRef.current = null;
      setMessage("");
      emptyPollsRef.current = 0;
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  async function endSession() {
    try {
      await fetch("/api/complaints/anonymous/session", { method: "DELETE" });
    } finally {
      setConversation(null);
      setMessage("");
      setSendError("");
      pendingMessageRef.current = null;
      cursorRef.current = null;
      emptyPollsRef.current = 0;
    }
  }

  if (checkingSession && !conversation) {
    return <section className="card mx-auto max-w-xl py-12 text-center" aria-live="polite">
      <ShieldCheck className="mx-auto size-7 text-pine-700" aria-hidden="true" />
      <p className="mt-3 text-sm font-bold text-slate-600">Checking your secure complaint session…</p>
    </section>;
  }

  if (!conversation) {
    return <form onSubmit={authenticate} className="card mx-auto max-w-xl space-y-4" autoComplete="off">
      <div className="rounded-xl border border-pine-100 bg-pine-50/70 p-4 text-sm text-pine-950">
        <p className="font-black">Private anonymous access</p>
        <p className="mt-1 text-pine-800">Your tracking code and PIN are used only to establish a short-lived complaint session. The PIN is not sent again while you read or reply.</p>
      </div>
      <label className="block">
        <span className="label">Tracking code</span>
        <input className="field min-h-12 font-mono uppercase" value={trackingCode} onChange={(event) => setTrackingCode(event.target.value)} placeholder="ANON-..." required autoCapitalize="characters" />
      </label>
      <label className="block">
        <span className="label">PIN</span>
        <input className="field min-h-12 font-mono" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="off" />
      </label>
      {authError && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800" role="alert">{authError}</p>}
      <button type="submit" disabled={authenticating} className="btn btn-primary min-h-12 w-full disabled:opacity-60">
        {authenticating ? "Opening secure conversation…" : "Open complaint conversation"}
      </button>
    </form>;
  }

  return <section className="mx-auto flex min-h-[65dvh] max-w-3xl min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="flex min-w-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <p className="font-mono text-xs font-bold text-slate-500">{conversation.publicReference}</p>
        <h2 className="truncate text-lg font-black text-slate-950">{conversation.title}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="badge badge-info">{complaintStatusLabel(conversation.status)}</span>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-pine-700"><ShieldCheck className="size-3.5" aria-hidden="true" />Anonymous session</span>
        </div>
      </div>
      <button type="button" onClick={() => void endSession()} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50" aria-label="End anonymous complaint session">
        <LogOut className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">End session</span>
      </button>
    </header>

    {conversation.requestedAction && <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm sm:px-5">
      <span className="font-black text-slate-800">Requested action: </span>
      <span className="text-slate-700">{conversation.requestedAction}</span>
    </div>}

    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5" aria-live="polite">
      {conversation.messages.length === 0 ? <div className="py-12 text-center text-sm text-slate-500">
        <MessageCircle className="mx-auto mb-2 size-6" aria-hidden="true" />
        No public messages yet.
      </div> : <div className="space-y-3">
        {conversation.messages.map((item) => {
          const mine = item.sender === "ANONYMOUS_COMPLAINANT";
          return <div key={item.id} className={`flex min-w-0 ${mine ? "justify-end" : "justify-start"}`}>
            <article className={`max-w-[88%] min-w-0 rounded-2xl px-3.5 py-3 text-sm sm:max-w-[75%] ${mine ? "bg-pine-800 text-white" : "bg-slate-100 text-slate-800"}`}>
              <p className={`text-xs font-black ${mine ? "text-pine-100" : "text-slate-600"}`}>{item.authorDisplayName}</p>
              <p className="mt-1 whitespace-pre-wrap break-words">{item.body}</p>
              <time className={`mt-1.5 block text-[11px] ${mine ? "text-pine-100" : "text-slate-500"}`} dateTime={item.createdAt}>{formatMessageTime(item.createdAt)}</time>
            </article>
          </div>;
        })}
        <div ref={bottomRef} />
      </div>}
    </div>

    <form onSubmit={sendMessage} className="border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
      {sendError && <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800" role="alert">{sendError}</p>}
      <div className="flex min-w-0 items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Reply to HOA</span>
          <textarea
            className="field min-h-12 max-h-36 resize-y py-3"
            value={message}
            onChange={(event) => {
              const nextMessage = event.target.value.slice(0, MAX_MESSAGE_LENGTH);
              setMessage(nextMessage);
              if (pendingMessageRef.current && pendingMessageRef.current.body !== nextMessage.trim()) pendingMessageRef.current = null;
            }}
            placeholder="Reply to the HOA…"
            maxLength={MAX_MESSAGE_LENGTH}
            rows={1}
          />
        </label>
        <button type="submit" disabled={sending || message.trim().length < 2} className="btn btn-primary min-h-12 min-w-12 shrink-0 px-3 disabled:opacity-50" aria-label="Send anonymous reply">
          <Send className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{sending ? "Sending…" : "Send"}</span>
        </button>
      </div>
      <p className="mt-1.5 text-right text-[11px] text-slate-500">{message.length}/{MAX_MESSAGE_LENGTH} · Text only</p>
    </form>
  </section>;
}

function complaintStatusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}