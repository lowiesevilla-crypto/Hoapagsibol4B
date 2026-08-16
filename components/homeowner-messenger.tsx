"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCheck,
  FileText,
  ImageIcon,
  MoreHorizontal,
  Paperclip,
  Pin,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserRoundX,
  X,
} from "lucide-react";
import { HomeownerAvatar } from "@/components/homeowner-avatar";

type ChatUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  official?: boolean;
  avatarUrl?: string | null;
  initials: string;
  presence: { lastSeenAt: string; context: string | null; online: boolean } | null;
  homeownerProfile?: null;
  employeeProfile?: { employeeNumber: string; position: string } | null;
  searchText: string;
};

type ChatAttachment = { id?: string; url: string; fileName: string; contentType: string; size: number };
type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string | null;
  createdAt: string;
  deletedForEveryoneAt: string | null;
  sender: ChatUser;
  attachments: ChatAttachment[];
  replyTo: { id: string; body: string | null; senderName: string } | null;
};
type ChatConversation = {
  id: string;
  subject: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  pinned: boolean;
  participants: { userId: string; lastReadAt: string | null; user: ChatUser }[];
  messages: ChatMessage[];
  unreadCount: number;
};
type ChatPayload = {
  currentUserId: string;
  settings: { maxAttachmentMb: number; allowedMimeTypes: string[]; pollIntervalSeconds: number };
  recipients: ChatUser[];
  conversations: ChatConversation[];
  selectedConversation: ChatConversation | null;
};

export function HomeownerMessenger({ initialData }: { initialData: ChatPayload }) {
  const [data, setData] = useState(initialData);
  const [selectedId, setSelectedId] = useState(initialData.selectedConversation?.id ?? "");
  const [query, setQuery] = useState("");
  const [directory, setDirectory] = useState<ChatUser[]>(initialData.recipients.filter((item) => item.role === "HOMEOWNER"));
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selected = data.selectedConversation?.id === selectedId
    ? data.selectedConversation
    : data.conversations.find((item) => item.id === selectedId) ?? null;
  const currentUserId = data.currentUserId;
  const other = selected ? otherUsers(selected, currentUserId)[0] ?? selected.participants[0]?.user : null;
  const mobileThreadOpen = Boolean(selectedId && selected);

  const recipients = useMemo(() => {
    const merged = new Map<string, ChatUser>();
    for (const resident of directory) merged.set(resident.id, resident);
    for (const recipient of data.recipients) merged.set(recipient.id, recipient);
    return [...merged.values()].sort((a, b) => {
      if (a.role === "HOMEOWNER" && b.role !== "HOMEOWNER") return -1;
      if (a.role !== "HOMEOWNER" && b.role === "HOMEOWNER") return 1;
      if (Boolean(a.presence?.online) !== Boolean(b.presence?.online)) return a.presence?.online ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [data.recipients, directory]);

  const normalizedQuery = query.trim().toLowerCase();
  const conversations = useMemo(() => data.conversations.filter((conversation) => {
    if (!normalizedQuery) return true;
    const latest = conversation.messages[0];
    return [conversationTitle(conversation, currentUserId), latest?.body, ...conversation.participants.map((item) => item.user.searchText)]
      .filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery);
  }), [currentUserId, data.conversations, normalizedQuery]);
  const people = useMemo(() => recipients.filter((person) => !normalizedQuery || person.searchText.toLowerCase().includes(normalizedQuery)), [normalizedQuery, recipients]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("search", query.trim());
        const response = await fetch(`/api/chat/homeowners?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const result = await response.json() as { homeowners?: ChatUser[] };
        if (Array.isArray(result.homeowners)) setDirectory(result.homeowners);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError("Unable to refresh the homeowner directory.");
      }
    }, query.trim() ? 180 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(false), Math.max(5, data.settings.pollIntervalSeconds) * 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, data.settings.pollIntervalSeconds]);

  useEffect(() => {
    if (!selected) return;
    window.requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" }));
  }, [selected?.id, selected?.messages.length]);

  async function refresh(showError = true, conversationId = selectedId) {
    try {
      const params = new URLSearchParams();
      if (conversationId) params.set("conversation", conversationId);
      const response = await fetch(`/api/chat?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to refresh messages.");
      const next = await response.json() as ChatPayload;
      setData(next);
      if (conversationId) setSelectedId(next.selectedConversation?.id ?? conversationId);
      publishUnread(next.conversations);
    } catch (caught) {
      if (showError) setError(caught instanceof Error ? caught.message : "Unable to refresh messages.");
    }
  }

  async function openPerson(userId: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/chat/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId: userId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to open conversation.");
      setSelectedId(result.conversationId);
      setData(result.payload);
      publishUnread(result.payload.conversations);
      window.history.replaceState(null, "", `/portal/chat?conversation=${result.conversationId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open conversation.");
    } finally {
      setLoading(false);
    }
  }

  async function openConversation(conversationId: string) {
    setSelectedId(conversationId);
    setLoading(true);
    setError("");
    window.history.replaceState(null, "", `/portal/chat?conversation=${conversationId}`);
    await refresh(true, conversationId);
    setLoading(false);
  }

  function closeThread() {
    setSelectedId("");
    setMenuOpen(false);
    setError("");
    window.history.replaceState(null, "", "/portal/chat");
  }

  async function sendMessage() {
    if (!selected || sending || uploading || (!draft.trim() && attachments.length === 0)) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selected.id, message: draft, attachments }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to send message.");
      setDraft("");
      setAttachments([]);
      setData(result);
      publishUnread(result.conversations);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  async function uploadFiles(files: FileList) {
    const selectedFiles = Array.from(files);
    if (!selectedFiles.length) return;
    const maxBytes = data.settings.maxAttachmentMb * 1024 * 1024;
    const invalid = selectedFiles.find((file) => !data.settings.allowedMimeTypes.includes(file.type) || file.size > maxBytes);
    if (invalid) {
      setError(`Use an allowed file type up to ${data.settings.maxAttachmentMb}MB.`);
      return;
    }
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      selectedFiles.forEach((file) => form.append("files", file));
      const response = await fetch("/api/chat/upload", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      setAttachments((current) => [...current, ...result.files]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function togglePin() {
    if (!selected) return;
    const response = await fetch("/api/chat/conversations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: selected.id, pinned: !selected.pinned }) });
    if (response.ok) setData(await response.json());
    setMenuOpen(false);
  }

  async function deleteConversation() {
    if (!selected) return;
    const response = await fetch(`/api/chat/conversations?conversationId=${encodeURIComponent(selected.id)}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) { setError(result.error || "Unable to delete conversation."); return; }
    setData(result);
    closeThread();
  }

  async function blockResident() {
    if (!other || other.role !== "HOMEOWNER") return;
    const response = await fetch("/api/chat/blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: other.id, action: "BLOCK" }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || "Unable to block resident."); return; }
    setMenuOpen(false);
    setError("Resident blocked. New resident messages are disabled until you unblock them in Message Privacy.");
  }

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-soft lg:grid lg:min-h-[720px] lg:grid-cols-[360px_minmax(0,1fr)]">
      <input ref={fileInput} type="file" multiple accept={data.settings.allowedMimeTypes.join(",")} className="hidden" onChange={(event) => event.target.files && void uploadFiles(event.target.files)} />

      <aside className={`${mobileThreadOpen ? "hidden lg:flex" : "flex"} min-h-[calc(100dvh-10rem)] min-w-0 flex-col border-slate-100 bg-white lg:min-h-0 lg:border-r`}>
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 pb-3 pt-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[11px] font-black uppercase tracking-[.14em] text-pine-700">HOAHub</p><h1 className="text-2xl font-black tracking-tight text-slate-950">Messages</h1></div>
            <span className="rounded-full bg-pine-50 px-3 py-1.5 text-xs font-black text-pine-700">{data.conversations.reduce((sum, item) => sum + item.unreadCount, 0)} unread</span>
          </div>
          <label className="mt-4 flex h-11 items-center gap-2 rounded-full bg-slate-100 px-4">
            <Search className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400" placeholder="Search name, block or lot" />
            {query && <button type="button" onClick={() => setQuery("")} className="grid size-7 place-items-center rounded-full bg-white text-slate-500" aria-label="Clear search"><X className="size-4" /></button>}
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-8 pt-3">
          <SectionLabel label="Chats" value={conversations.length} />
          <div className="space-y-0.5">
            {conversations.map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} currentUserId={currentUserId} active={conversation.id === selectedId} onClick={() => void openConversation(conversation.id)} />)}
            {!conversations.length && <CompactEmpty text={query ? "No chats match your search." : "No conversations yet."} />}
          </div>

          <SectionLabel label="People" value={people.length} className="mt-5" />
          <div className="space-y-0.5">
            {people.map((person) => <PersonRow key={person.id} person={person} onClick={() => void openPerson(person.id)} />)}
            {!people.length && <CompactEmpty text="No homeowners match your search." />}
          </div>
        </div>
        {error && !mobileThreadOpen && <p className="m-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
      </aside>

      <div className={`${mobileThreadOpen ? "fixed inset-0 z-[90] flex lg:static lg:z-auto" : "hidden lg:flex"} min-h-0 min-w-0 flex-col bg-white`}>
        {selected ? (
          <>
            <header className="relative flex min-h-16 shrink-0 items-center gap-2 border-b border-slate-100 bg-white px-2 pb-2 pt-[calc(.5rem+env(safe-area-inset-top))] lg:px-4 lg:pt-2">
              <button type="button" onClick={closeThread} className="grid size-10 shrink-0 place-items-center rounded-full text-pine-700 active:bg-slate-100 lg:hidden" aria-label="Back to messages"><ArrowLeft className="size-5" /></button>
              {other && <HomeownerAvatar name={other.name} src={other.avatarUrl} className="size-11 text-sm" />}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5"><h2 className="truncate text-[15px] font-black text-slate-950">{conversationTitle(selected, currentUserId)}</h2>{other?.official && <ShieldCheck className="size-4 shrink-0 text-blue-600" aria-label="HOA Official" />}</div>
                <p className="truncate text-xs font-semibold text-slate-400">{other?.official ? "HOA Official" : presenceLabel(other)}</p>
              </div>
              <button type="button" onClick={() => setMenuOpen((open) => !open)} className="grid size-10 shrink-0 place-items-center rounded-full text-slate-600 active:bg-slate-100" aria-label="Conversation options"><MoreHorizontal className="size-5" /></button>
              {menuOpen && <div className="absolute right-3 top-[calc(4rem+env(safe-area-inset-top))] z-20 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl lg:top-14">
                <MenuAction icon={Pin} label={selected.pinned ? "Unpin chat" : "Pin chat"} onClick={() => void togglePin()} />
                {other?.role === "HOMEOWNER" && <MenuAction icon={UserRoundX} label="Block resident" danger onClick={() => void blockResident()} />}
                <MenuAction icon={Trash2} label="Delete for me" danger onClick={() => void deleteConversation()} />
              </div>}
            </header>

            {error && <p className="mx-3 mt-2 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 sm:px-5">
              {loading && <p className="mx-auto mb-4 w-fit rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Loading</p>}
              {!selected.messages.length ? <ThreadEmpty user={other} /> : <div className="space-y-2">{selected.messages.map((message) => <MessageBubble key={message.id} message={message} mine={message.senderId === currentUserId} />)}</div>}
            </div>

            <footer className="shrink-0 border-t border-slate-100 bg-white px-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-2 sm:px-4">
              {attachments.length > 0 && <div className="mb-2 flex gap-2 overflow-x-auto">{attachments.map((attachment) => <AttachmentChip key={attachment.url} attachment={attachment} onRemove={() => setAttachments((items) => items.filter((item) => item.url !== attachment.url))} />)}</div>}
              <div className="flex items-end gap-1.5">
                <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="grid size-10 shrink-0 place-items-center rounded-full text-pine-700 active:bg-slate-100 disabled:opacity-40" aria-label="Attach file"><Paperclip className="size-5" /></button>
                <div className="flex min-h-11 min-w-0 flex-1 items-end rounded-[1.4rem] bg-slate-100 px-3">
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={1} placeholder="Message" className="max-h-28 min-h-11 w-full resize-none bg-transparent py-2.5 text-[15px] leading-6 outline-none placeholder:text-slate-400" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(); } }} />
                </div>
                <button type="button" onClick={() => void sendMessage()} disabled={sending || uploading || (!draft.trim() && attachments.length === 0)} className="grid size-10 shrink-0 place-items-center rounded-full bg-pine-700 text-white shadow-sm disabled:bg-slate-200 disabled:text-slate-400" aria-label="Send message"><Send className="size-4" /></button>
              </div>
            </footer>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-full bg-pine-50 text-pine-700"><Send className="size-7" /></span><p className="mt-4 text-lg font-black text-slate-900">Select a conversation</p><p className="mt-1 text-sm text-slate-500">Choose a chat or homeowner to start messaging.</p></div></div>
        )}
      </div>
    </section>
  );
}

function ConversationRow({ conversation, currentUserId, active, onClick }: { conversation: ChatConversation; currentUserId: string; active: boolean; onClick: () => void }) {
  const other = otherUsers(conversation, currentUserId)[0] ?? conversation.participants[0]?.user;
  const latest = conversation.messages[0];
  return <button type="button" onClick={onClick} className={`flex w-full min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${active ? "bg-pine-50" : "active:bg-slate-50"}`}>
    <HomeownerAvatar name={other?.name || "Conversation"} src={other?.avatarUrl} className="size-12 text-sm" />
    <span className="min-w-0 flex-1"><span className="flex min-w-0 items-center gap-1.5"><span className={`truncate text-sm ${conversation.unreadCount ? "font-black text-slate-950" : "font-bold text-slate-800"}`}>{conversationTitle(conversation, currentUserId)}</span>{other?.official && <ShieldCheck className="size-3.5 shrink-0 text-blue-600" />}</span><span className={`mt-0.5 block truncate text-xs ${conversation.unreadCount ? "font-bold text-slate-700" : "text-slate-400"}`}>{latest?.body || latest?.attachments[0]?.fileName || "Start a conversation"}</span></span>
    <span className="shrink-0 text-right"><span className="block text-[10px] font-semibold text-slate-400">{shortTime(conversation.lastMessageAt || conversation.createdAt)}</span>{conversation.unreadCount > 0 && <span className="ml-auto mt-1 grid size-5 place-items-center rounded-full bg-pine-700 text-[10px] font-black text-white">{conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}</span>}</span>
  </button>;
}

function PersonRow({ person, onClick }: { person: ChatUser; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex w-full min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-left active:bg-slate-50">
    <HomeownerAvatar name={person.name} src={person.avatarUrl} className="size-11 text-xs" />
    <span className="min-w-0 flex-1"><span className="flex min-w-0 items-center gap-1.5"><span className="truncate text-sm font-bold text-slate-900">{person.name}</span>{person.official && <ShieldCheck className="size-3.5 shrink-0 text-blue-600" />}</span><span className="mt-0.5 block text-xs font-semibold text-slate-400">{person.official ? "HOA Official" : person.presence?.online ? "Active now" : "Resident"}</span></span>
  </button>;
}

function MessageBubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  if (message.deletedForEveryoneAt) return <p className="text-center text-[11px] italic text-slate-400">Message deleted</p>;
  return <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
    <div className={`max-w-[82%] rounded-[1.25rem] px-3 py-2 text-[15px] leading-5 ${mine ? "rounded-br-md bg-pine-700 text-white" : "rounded-bl-md bg-slate-100 text-slate-900"}`}>
      {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
      {message.attachments.map((attachment) => <a key={attachment.url} href={attachment.url} target="_blank" rel="noopener noreferrer" className={`mt-1 flex items-center gap-2 rounded-xl p-2 text-xs font-bold ${mine ? "bg-white/10" : "bg-white"}`}>{attachment.contentType.startsWith("image/") ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}<span className="truncate">{attachment.fileName}</span></a>)}
      <span className={`mt-1 flex items-center justify-end gap-1 text-[9px] ${mine ? "text-white/70" : "text-slate-400"}`}>{shortTime(message.createdAt)}{mine && <CheckCheck className="size-3" />}</span>
    </div>
  </div>;
}

function AttachmentChip({ attachment, onRemove }: { attachment: ChatAttachment; onRemove: () => void }) {
  return <span className="flex max-w-56 shrink-0 items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"><span className="truncate">{attachment.fileName}</span><button type="button" onClick={onRemove} aria-label={`Remove ${attachment.fileName}`}><X className="size-3.5" /></button></span>;
}

function ThreadEmpty({ user }: { user: ChatUser | null }) {
  return <div className="grid min-h-[45vh] place-items-center px-6 text-center"><div>{user && <HomeownerAvatar name={user.name} src={user.avatarUrl} className="mx-auto size-20 text-xl" />}<p className="mt-4 text-lg font-black text-slate-900">{user?.name || "New conversation"}</p><p className="mt-1 text-sm text-slate-400">Send a message to start the conversation.</p></div></div>;
}

function MenuAction({ icon: Icon, label, onClick, danger = false }: { icon: typeof Pin; label: string; onClick: () => void; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-bold ${danger ? "text-rose-700 active:bg-rose-50" : "text-slate-700 active:bg-slate-50"}`}><Icon className="size-4" />{label}</button>;
}

function SectionLabel({ label, value, className = "" }: { label: string; value: number; className?: string }) {
  return <div className={`mb-1 flex items-center justify-between px-3 ${className}`}><h2 className="text-[11px] font-black uppercase tracking-[.14em] text-slate-400">{label}</h2><span className="text-[11px] font-bold text-slate-300">{value}</span></div>;
}

function CompactEmpty({ text }: { text: string }) {
  return <p className="px-3 py-4 text-sm font-medium text-slate-400">{text}</p>;
}

function otherUsers(conversation: ChatConversation, currentUserId: string) {
  return conversation.participants.filter((item) => item.userId !== currentUserId).map((item) => item.user);
}

function conversationTitle(conversation: ChatConversation, currentUserId: string) {
  return conversation.subject || otherUsers(conversation, currentUserId).map((user) => user.name).join(", ") || "Conversation";
}

function presenceLabel(user?: ChatUser | null) {
  if (!user?.presence) return "Resident";
  if (user.presence.online) return "Active now";
  return `Last active ${shortTime(user.presence.lastSeenAt)}`;
}

function shortTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(date);
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(date);
}

function publishUnread(conversations: ChatConversation[]) {
  window.dispatchEvent(new CustomEvent("chat-unread-updated", { detail: { count: conversations.reduce((sum, item) => sum + item.unreadCount, 0) } }));
}
