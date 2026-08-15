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

  return <section className="mb-5 grid w-full min-w-0 max-w-full gap-3 overflow-x-hidden lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]">
    <details className="group w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
      <summary className="flex min-h-16 w-full min-w-0 max-w-full cursor-pointer list-none items-center justify-between gap-3 rounded-3xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pine-500 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><ShieldCheck className="size-5" /></span>
          <div className="min-w-0 flex-1"><p className="truncate font-black text-slate-950">Message privacy</p><p className="truncate text-xs font-semibold text-slate-500">{modeCopy[data.residentMessagingMode].label} · {data.blockedUsers.length} blocked</p></div>
        </div>
        <ChevronDown className="size-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="w-full min-w-0 max-w-full space-y-5 border-t border-slate-100 p-4">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-900">Who can start a resident chat?</p>
          <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-3">
            {(Object.keys(modeCopy) as ResidentMessagingMode[]).map((mode) => <button key={mode} type="button" disabled={Boolean(busy)} onClick={() => updateMode(mode)} className={`min-w-0 max-w-full rounded-2xl border p-3 text-left transition ${data.residentMessagingMode === mode ? "border-pine-400 bg-pine-50 ring-1 ring-pine-200" : "border-slate-200 hover:border-pine-200"}`}>
              <span className="block break-words text-sm font-black text-slate-950">{modeCopy[mode].label}</span><span className="mt-1 block break-words text-xs leading-5 text-slate-500">{modeCopy[mode].note}</span>
            </button>)}
          </div>
        </div>
        <div className="min-w-0 max-w-full">
          <label className="text-sm font-black text-slate-900" htmlFor="resident-block-search">Block or unblock a resident</label>
          <input id="resident-block-search" value={residentSearch} onChange={(event) => setResidentSearch(event.target.value)} className="field mt-2 w-full min-w-0 max-w-full" placeholder="Search resident name" />
          <div className="mt-2 max-h-56 w-full min-w-0 max-w-full space-y-1 overflow-y-auto overflow-x-hidden rounded-2xl border border-slate-100 p-2">
            {visibleResidents.map((resident) => <div key={resident.userId} className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-50"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{resident.name}</p><p className="truncate text-xs text-slate-500">{resident.blocked ? "Blocked" : "Resident"}</p></div><button type="button" disabled={Boolean(busy)} onClick={() => setBlocked(resident.userId, !resident.blocked)} className={resident.blocked ? "btn-secondary min-h-10 shrink-0 px-3 text-xs" : "min-h-10 shrink-0 rounded-xl border border-rose-200 px-3 text-xs font-black text-rose-700 hover:bg-rose-50"}>{resident.blocked ? "Unblock" : <span className="inline-flex items-center gap-1"><Ban className="size-4" /> Block</span>}</button></div>)}
            {!visibleResidents.length && <p className="p-3 text-sm text-slate-500">No resident matches your search.</p>}
          </div>
        </div>
      </div>
    </details>

    <div className="min-w-0 max-w-full space-y-3">
      <section className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-blue-100 bg-blue-50/60 p-4 shadow-soft">
        <div className="flex min-w-0 items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-blue-700"><BadgeCheck className="size-5" /></span><div className="min-w-0"><p className="font-black text-blue-950">HOA Official</p><p className="mt-1 break-words text-sm leading-6 text-blue-900">Messages from authorized HOA administrators and staff are server-verified. Resident privacy and block settings never suppress official HOA communication.</p></div></div>
      </section>
      <details className="group w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-soft" open={data.incomingRequests.length > 0}>
        <summary className="flex min-h-16 w-full min-w-0 max-w-full cursor-pointer list-none items-center justify-between gap-3 rounded-3xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 [&::-webkit-details-marker]:hidden"><div className="flex min-w-0 flex-1 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-800"><MessageCircleMore className="size-5" /></span><div className="min-w-0"><p className="truncate font-black text-slate-950">Message Requests</p><p className="text-xs font-semibold text-slate-500">{data.incomingRequests.length} waiting</p></div></div><ChevronDown className="size-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180" /></summary>
        <div className="w-full min-w-0 max-w-full space-y-2 border-t border-amber-100 p-3">
          {data.incomingRequests.map((item) => <div key={item.id} className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-100 p-3"><div className="flex min-w-0 items-center gap-2"><UserRoundCheck className="size-4 shrink-0 text-pine-700" /><p className="truncate font-black text-slate-900">{item.requesterName}</p></div><p className="mt-1 break-words text-xs text-slate-500">Resident message request · {new Date(item.createdAt).toLocaleDateString()}</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => respond(item.id, "ACCEPT")} className="btn-primary min-h-10 min-w-0">Accept</button><button type="button" disabled={Boolean(busy)} onClick={() => respond(item.id, "DECLINE")} className="btn-secondary min-h-10 min-w-0">Decline</button></div></div>)}
          {!data.incomingRequests.length && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No message requests waiting.</p>}
        </div>
      </details>
    </div>
    {error && <p className="min-w-0 max-w-full break-words rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800 lg:col-span-2" role="alert">{error}</p>}
  </section>;
}
