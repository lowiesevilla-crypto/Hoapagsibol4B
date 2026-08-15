"use client";

import { BadgeCheck, Ban, ChevronDown, MessageCircleMore, ShieldCheck, UserRoundCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type { ChatPrivacySnapshot, ResidentMessagingMode } from "@/lib/services/chat-privacy";

const modeCopy: Record<ResidentMessagingMode, { label: string; note: string }> = {
  INBOX: { label: "Allow directly", note: "Resident messages can appear in your Chats immediately." },
  REQUESTS: { label: "Message Requests", note: "New resident contacts wait for you to Accept or Decline." },
  NONE: { label: "Do not allow", note: "Other residents cannot start new chats with you." },
};

export function HomeownerChatPrivacyPanel({ initialData }: { initialData: ChatPrivacySnapshot }) {
  const [data, setData] = useState(initialData);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [residentSearch, setResidentSearch] = useState("");
  const visibleResidents = useMemo(() => {
    const term = residentSearch.trim().toLowerCase();
    return data.residents.filter((resident) => !term || resident.name.toLowerCase().includes(term)).slice(0, 40);
  }, [data.residents, residentSearch]);

  async function updateMode(mode: ResidentMessagingMode) {
    setBusy(`mode:${mode}`);
    setError("");
    try {
      const response = await fetch("/api/chat/privacy", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ residentMessagingMode: mode }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update privacy settings.");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update privacy settings.");
    } finally {
      setBusy("");
    }
  }

  async function respond(requestId: string, action: "ACCEPT" | "DECLINE") {
    setBusy(`request:${requestId}`);
    setError("");
    try {
      const response = await fetch("/api/chat/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update request.");
      setData(result);
      if (action === "ACCEPT") window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update request.");
    } finally {
      setBusy("");
    }
  }

  async function setBlocked(userId: string, blocked: boolean) {
    setBusy(`block:${userId}`);
    setError("");
    try {
      const response = await fetch("/api/chat/blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, action: blocked ? "BLOCK" : "UNBLOCK" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update blocked residents.");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update blocked residents.");
    } finally {
      setBusy("");
    }
  }

  return <section className="mb-5 grid gap-3 lg:grid-cols-[1.15fr_.85fr]">
    <details className="group rounded-3xl border border-slate-200 bg-white shadow-soft">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 rounded-3xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pine-500 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><ShieldCheck className="size-5" /></span>
          <div className="min-w-0"><p className="font-black text-slate-950">Message privacy</p><p className="truncate text-xs font-semibold text-slate-500">{modeCopy[data.residentMessagingMode].label} · {data.blockedUsers.length} blocked</p></div>
        </div>
        <ChevronDown className="size-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t border-slate-100 p-4">
        <div>
          <p className="text-sm font-black text-slate-900">Who can start a resident chat?</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {(Object.keys(modeCopy) as ResidentMessagingMode[]).map((mode) => <button key={mode} type="button" disabled={Boolean(busy)} onClick={() => updateMode(mode)} className={`rounded-2xl border p-3 text-left transition ${data.residentMessagingMode === mode ? "border-pine-400 bg-pine-50 ring-1 ring-pine-200" : "border-slate-200 hover:border-pine-200"}`}>
              <span className="block text-sm font-black text-slate-950">{modeCopy[mode].label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{modeCopy[mode].note}</span>
            </button>)}
          </div>
        </div>
        <div>
          <label className="text-sm font-black text-slate-900" htmlFor="resident-block-search">Block or unblock a resident</label>
          <input id="resident-block-search" value={residentSearch} onChange={(event) => setResidentSearch(event.target.value)} className="field mt-2" placeholder="Search resident name" />
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-2xl border border-slate-100 p-2">
            {visibleResidents.map((resident) => <div key={resident.userId} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-slate-50"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{resident.name}</p><p className="text-xs text-slate-500">{resident.blocked ? "Blocked" : "Resident"}</p></div><button type="button" disabled={Boolean(busy)} onClick={() => setBlocked(resident.userId, !resident.blocked)} className={resident.blocked ? "btn-secondary min-h-10" : "min-h-10 rounded-xl border border-rose-200 px-3 text-sm font-black text-rose-700 hover:bg-rose-50"}>{resident.blocked ? "Unblock" : <span className="inline-flex items-center gap-1"><Ban className="size-4" /> Block</span>}</button></div>)}
            {!visibleResidents.length && <p className="p-3 text-sm text-slate-500">No resident matches your search.</p>}
          </div>
        </div>
      </div>
    </details>

    <div className="space-y-3">
      <section className="rounded-3xl border border-blue-100 bg-blue-50/60 p-4 shadow-soft">
        <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-blue-700"><BadgeCheck className="size-5" /></span><div><p className="font-black text-blue-950">HOA Official</p><p className="mt-1 text-sm leading-6 text-blue-900">Messages from authorized HOA administrators and staff are server-verified. Resident privacy and block settings never suppress official HOA communication.</p></div></div>
      </section>
      <details className="group rounded-3xl border border-amber-200 bg-white shadow-soft" open={data.incomingRequests.length > 0}>
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 rounded-3xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 [&::-webkit-details-marker]:hidden"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-amber-50 text-amber-800"><MessageCircleMore className="size-5" /></span><div><p className="font-black text-slate-950">Message Requests</p><p className="text-xs font-semibold text-slate-500">{data.incomingRequests.length} waiting</p></div></div><ChevronDown className="size-5 text-slate-500 transition-transform group-open:rotate-180" /></summary>
        <div className="space-y-2 border-t border-amber-100 p-3">
          {data.incomingRequests.map((item) => <div key={item.id} className="rounded-2xl border border-slate-100 p-3"><div className="flex items-center gap-2"><UserRoundCheck className="size-4 text-pine-700" /><p className="font-black text-slate-900">{item.requesterName}</p></div><p className="mt-1 text-xs text-slate-500">Resident message request · {new Date(item.createdAt).toLocaleDateString()}</p><div className="mt-3 flex gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => respond(item.id, "ACCEPT")} className="btn-primary min-h-10 flex-1">Accept</button><button type="button" disabled={Boolean(busy)} onClick={() => respond(item.id, "DECLINE")} className="btn-secondary min-h-10 flex-1">Decline</button></div></div>)}
          {!data.incomingRequests.length && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No message requests waiting.</p>}
        </div>
      </details>
    </div>
    {error && <p className="lg:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800" role="alert">{error}</p>}
  </section>;
}
