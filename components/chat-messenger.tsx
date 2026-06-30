"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, Bell, BellRing, FileText, ImageIcon, Paperclip, Pin, Search, Send, Smile, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";

type ChatUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  presence: { lastSeenAt: string; context: string | null; online: boolean } | null;
  homeownerProfile?: { address: string; block: string; lot: string } | null;
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

const emojis = ["\u{1F44D}", "\u{1F64F}", "\u2705", "\u2764\uFE0F", "\u{1F60A}", "\u{1F389}", "\u{1F4CC}", "\u{1F4AC}"];

export function ChatMessenger({
  basePath,
  title,
  description,
  initialData,
}: {
  basePath: string;
  title: string;
  description: string;
  initialData: ChatPayload;
}) {
  const [data, setData] = useState(initialData);
  const [selectedId, setSelectedId] = useState(initialData.selectedConversation?.id ?? "");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");
  const [visibleMessages, setVisibleMessages] = useState(50);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [chatViewportHeight, setChatViewportHeight] = useState("100dvh");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const unreadRef = useRef(totalUnread(initialData.conversations));
  const nearBottomRef = useRef(true);

  const currentUserId = data.currentUserId;
  const selectedConversation = data.selectedConversation?.id === selectedId ? data.selectedConversation : data.conversations.find((item) => item.id === selectedId) ?? data.selectedConversation;
  const acceptedTypes = data.settings.allowedMimeTypes.join(",");
  const mobileFullscreen = mobileChatOpen && Boolean(selectedConversation);
  const chatStyle = mobileFullscreen ? ({ "--chat-viewport-height": chatViewportHeight } as CSSProperties & Record<string, string>) : undefined;

  useEffect(() => {
    const timer = window.setInterval(() => refresh(false), data.settings.pollIntervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [selectedId, recipientSearch, data.settings.pollIntervalSeconds]);

  useEffect(() => {
    publishUnreadCount(initialData.conversations);
  }, [initialData.conversations]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("conversation") && initialData.selectedConversation) setMobileChatOpen(true);
  }, [initialData.selectedConversation]);

  useEffect(() => {
    if (nearBottomRef.current) scrollToBottom("auto");
  }, [selectedConversation?.id, selectedConversation?.messages.length]);

  useEffect(() => {
    setVisibleMessages(50);
    setMessageSearch("");
  }, [selectedConversation?.id]);

  useEffect(() => {
    function updateViewportHeight() {
      const height = window.visualViewport?.height ?? window.innerHeight;
      setChatViewportHeight(`${Math.max(360, Math.floor(height))}px`);
    }
    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("scroll", updateViewportHeight);
    return () => {
      window.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("scroll", updateViewportHeight);
    };
  }, []);

  useEffect(() => {
    if (!mobileFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileFullscreen]);

  async function refresh(showError = true, showLoading = false, conversationOverride?: string) {
    if (showLoading) setLoadingHistory(true);
    try {
      const params = new URLSearchParams();
      const conversationForRequest = conversationOverride ?? selectedId;
      if (conversationForRequest) params.set("conversation", conversationForRequest);
      if (recipientSearch) params.set("search", recipientSearch);
      const response = await fetch(`/api/chat?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to refresh chat.");
      const next = await response.json() as ChatPayload;
      const newUnread = totalUnread(next.conversations);
      if (newUnread > unreadRef.current) {
        playNotificationSound();
        showBrowserNotification(next);
      }
      unreadRef.current = newUnread;
      setData(next);
      publishUnreadCount(next.conversations);
      if (!selectedId && next.selectedConversation) setSelectedId(next.selectedConversation.id);
    } catch (err) {
      if (showError) setError(err instanceof Error ? err.message : "Unable to refresh chat.");
    } finally {
      if (showLoading) setLoadingHistory(false);
    }
  }

  const filteredRecipients = useMemo(() => {
    const term = recipientSearch.toLowerCase().trim();
    return data.recipients.filter((user) => !term || user.searchText.includes(term)).slice(0, 40);
  }, [data.recipients, recipientSearch]);

  const messages = useMemo(() => {
    const all = selectedConversation?.messages ?? [];
    const term = messageSearch.toLowerCase().trim();
    const filtered = term ? all.filter((message) => `${message.body ?? ""} ${message.sender.name} ${message.attachments.map((item) => item.fileName).join(" ")}`.toLowerCase().includes(term)) : all;
    return filtered.slice(Math.max(0, filtered.length - visibleMessages));
  }, [selectedConversation, messageSearch, visibleMessages]);

  async function openConversation(recipientId: string) {
    setError("");
    setLoadingHistory(true);
    try {
      const response = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Unable to open conversation.");
        return;
      }
      setSelectedId(result.conversationId);
      nearBottomRef.current = true;
      setMobileChatOpen(true);
      setData(result.payload);
      publishUnreadCount(result.payload.conversations);
      window.history.replaceState(null, "", `${basePath}?conversation=${result.conversationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open conversation.");
    } finally {
      setLoadingHistory(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const selected = Array.from(files);
    if (!selected.length) return;
    const maxBytes = data.settings.maxAttachmentMb * 1024 * 1024;
    for (const file of selected) {
      if (!data.settings.allowedMimeTypes.includes(file.type)) {
        setError(`${file.name} is not an allowed file type.`);
        return;
      }
      if (file.size > maxBytes) {
        setError(`${file.name} exceeds the ${data.settings.maxAttachmentMb}MB limit.`);
        return;
      }
    }
    setUploading(true);
    setError("");
    const formData = new FormData();
    for (const file of selected) formData.append("files", file);
    const response = await fetch("/api/chat/upload", { method: "POST", body: formData });
    const result = await response.json();
    setUploading(false);
    if (!response.ok) {
      setError(result.error || "Upload failed.");
      return;
    }
    setAttachments((current) => [...current, ...result.files]);
  }

  async function sendMessage() {
    if (!selectedConversation || sending || uploading || (!draft.trim() && attachments.length === 0)) return;
    setError("");
    setSending(true);
    try {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedConversation.id, message: draft, attachments, replyToId: replyTo?.id ?? null }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Unable to send message.");
        return;
      }
      setDraft("");
      setAttachments([]);
      setReplyTo(null);
      setShowEmoji(false);
      nearBottomRef.current = true;
      setData(result);
      publishUnreadCount(result.conversations);
      scrollToBottom();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(messageId: string) {
    const response = await fetch(`/api/chat/messages?messageId=${encodeURIComponent(messageId)}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Unable to delete message.");
      return;
    }
    setData(result);
    publishUnreadCount(result.conversations);
  }

  async function pinConversation(conversationId: string, pinned: boolean) {
    const response = await fetch("/api/chat/conversations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, pinned }) });
    const result = await response.json();
    if (response.ok) { setData(result); publishUnreadCount(result.conversations); }
  }

  async function deleteConversation(conversationId: string) {
    const response = await fetch(`/api/chat/conversations?conversationId=${encodeURIComponent(conversationId)}`, { method: "DELETE" });
    const result = await response.json();
    if (response.ok) {
      setData(result);
      publishUnreadCount(result.conversations);
      setSelectedId(result.selectedConversation?.id ?? "");
    }
  }

  function enableNotifications() {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then((permission) => setNotificationsEnabled(permission === "granted"));
  }

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const node = scrollRef.current;
        if (!node) return;
        node.scrollTo({ top: node.scrollHeight, behavior });
      });
    });
  }

  return <>
    <PageHeader
      eyebrow="Messenger-style HOA communication"
      title={title}
      description={description}
      action={<button type="button" className="btn-secondary" onClick={enableNotifications}>{notificationsEnabled ? <BellRing className="size-4" /> : <Bell className="size-4" />} Browser alerts</button>}
    />
    <section style={chatStyle} className={`${mobileFullscreen ? "fixed inset-0 z-[80] h-dvh h-[var(--chat-viewport-height,100dvh)] overflow-hidden rounded-none lg:static lg:h-auto lg:rounded-3xl" : "overflow-hidden rounded-3xl"} max-w-full border border-slate-200 bg-white shadow-soft`}>
      <div className={`${mobileFullscreen ? "h-full min-h-0 lg:min-h-[72vh]" : "min-h-[72vh]"} grid max-w-full lg:grid-cols-[360px_1fr]`}>
        <aside className={`${mobileFullscreen ? "hidden lg:block" : "block"} border-b border-slate-100 bg-slate-50/80 lg:border-b-0 lg:border-r`}>
          <div className="space-y-3 border-b border-slate-100 p-4">
            <h2 className="text-lg font-black text-ink">Conversations</h2>
            <SearchField value={recipientSearch} onChange={setRecipientSearch} placeholder="Search people, unit, employee ID" />
          </div>
          <div className="max-h-[32vh] overflow-y-auto border-b border-slate-100 p-3 lg:max-h-[260px]">
            <p className="mb-1 px-2 text-sm font-black text-ink">Start a conversation</p>
            <p className="mb-2 px-2 text-xs font-black uppercase tracking-wider text-slate-500">Online users and recipients</p>
            {filteredRecipients.map((recipient) => <button key={recipient.id} type="button" onClick={() => openConversation(recipient.id)} className="mb-1 flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-white">
              <Avatar user={recipient} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{recipient.name}</p><p className="truncate text-xs text-slate-500">{personMeta(recipient)}</p></div>
            </button>)}
            {!filteredRecipients.length && <p className="rounded-2xl bg-white p-4 text-sm text-slate-500">No people match your search.</p>}
          </div>
          <div className="max-h-[48vh] overflow-y-auto p-3 lg:max-h-[calc(72vh-300px)]">
            {data.conversations.map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} currentUserId={currentUserId} selected={conversation.id === selectedConversation?.id} onOpen={() => { nearBottomRef.current = true; setSelectedId(conversation.id); setMobileChatOpen(true); window.history.replaceState(null, "", `${basePath}?conversation=${conversation.id}`); refresh(false, true, conversation.id); }} />)}
            {!data.conversations.length && <p className="rounded-2xl bg-white p-4 text-sm text-slate-500">No conversations yet.</p>}
          </div>
        </aside>

        <main className={`${mobileFullscreen ? "flex h-full min-h-0 lg:min-h-[72vh]" : "hidden min-h-[72vh] lg:flex"} max-w-full flex-col overflow-hidden bg-white`}>
          {selectedConversation ? <>
            <header className="shrink-0 flex flex-col gap-3 border-b border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
              <div className="flex min-w-0 items-center gap-3">
                <button type="button" className="btn-secondary min-h-9 px-3 py-1 text-xs lg:hidden" onClick={() => setMobileChatOpen(false)}><ArrowLeft className="size-4" /> Back</button>
                <Avatar user={otherUsers(selectedConversation, currentUserId)[0] ?? selectedConversation.participants[0].user} />
                <div className="min-w-0"><h2 className="truncate text-lg font-black">{conversationTitle(selectedConversation, currentUserId)}</h2><p className="text-xs text-slate-500">{presenceText(otherUsers(selectedConversation, currentUserId)[0])}</p></div>
              </div>
              <div className="flex min-w-0 flex-wrap gap-2">
                <SearchField value={messageSearch} onChange={setMessageSearch} placeholder="Search messages" compact />
                <button type="button" className="btn-secondary min-h-9 px-3 py-1 text-xs" onClick={() => pinConversation(selectedConversation.id, !selectedConversation.pinned)}><Pin className="size-4" /> {selectedConversation.pinned ? "Unpin" : "Pin"}</button>
                <button type="button" className="btn-danger min-h-9 px-3 py-1 text-xs" onClick={() => deleteConversation(selectedConversation.id)}><Trash2 className="size-4" /> Delete for me</button>
              </div>
            </header>
            {error && <p className="mx-4 mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden overscroll-contain bg-gradient-to-b from-slate-50 to-white p-3 sm:p-4" onScroll={(event) => { const node = event.currentTarget; nearBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120; if (node.scrollTop < 24) setVisibleMessages((value) => Math.min(value + 30, selectedConversation.messages.length)); }}>
              {loadingHistory && <p className="sticky top-0 z-10 mx-auto w-fit rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-center text-xs font-black uppercase tracking-wider text-slate-500 shadow-sm">Loading chat history...</p>}
              {selectedConversation.messages.length > visibleMessages && <p className="text-center text-xs font-bold text-slate-400">Scroll up to load older messages</p>}
              {!loadingHistory && messages.length === 0 && <div className="grid min-h-48 place-items-center rounded-3xl border border-dashed border-slate-200 bg-white/80 p-6 text-center">
                <div>
                  <p className="text-lg font-black text-ink">{selectedConversation.messages.length ? "No messages match your search" : "No messages yet"}</p>
                  <p className="mt-1 text-sm text-slate-500">{selectedConversation.messages.length ? "Clear the message search to view the full history." : "Send the first message to start this conversation."}</p>
                </div>
              </div>}
              {messages.map((message) => <MessageBubble key={message.id} message={message} mine={message.senderId === currentUserId} participants={selectedConversation.participants} onReply={() => setReplyTo(message)} onDelete={() => deleteMessage(message.id)} />)}
              {draft && <p className="pl-2 text-xs font-bold text-slate-400">Typing...</p>}
            </div>
            <footer className="shrink-0 border-t border-slate-100 bg-white p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:p-4">
              {replyTo && <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl bg-pine-50 p-3 text-sm"><p className="min-w-0 truncate"><span className="font-black">Replying to {replyTo.sender.name}:</span> {replyTo.body || replyTo.attachments[0]?.fileName}</p><button type="button" onClick={() => setReplyTo(null)}><X className="size-4" /></button></div>}
              {attachments.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{attachments.map((attachment) => <AttachmentPreview key={attachment.url} attachment={attachment} removable onRemove={() => setAttachments((current) => current.filter((item) => item.url !== attachment.url))} />)}</div>}
              <div className="max-w-full rounded-3xl border border-slate-200 bg-slate-50 p-3" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); uploadFiles(event.dataTransfer.files); }}>
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="max-h-32 min-h-16 w-full resize-none overflow-y-auto bg-transparent p-2 text-sm outline-none" placeholder="Write a message..." disabled={sending} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(); } }} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="relative flex flex-wrap gap-2">
                    <input ref={fileInputRef} type="file" accept={acceptedTypes} multiple className="hidden" onChange={(event) => event.target.files && uploadFiles(event.target.files)} />
                    <button type="button" className="btn-secondary min-h-9 px-3 py-1 text-xs" onClick={() => fileInputRef.current?.click()}><Paperclip className="size-4" /> {uploading ? "Uploading..." : "Upload Attachment"}</button>
                    <button type="button" className="btn-secondary min-h-9 px-3 py-1 text-xs" onClick={() => setShowEmoji((value) => !value)}><Smile className="size-4" /> Emoji</button>
                    {showEmoji && <div className="absolute bottom-11 left-0 z-20 flex gap-1 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl">{emojis.map((emoji) => <button key={emoji} type="button" className="rounded-xl p-2 text-xl hover:bg-slate-50" onClick={() => setDraft((value) => `${value}${emoji}`)}>{emoji}</button>)}</div>}
                    <p className="basis-full text-xs text-slate-400">Drag and drop files here. Max {data.settings.maxAttachmentMb}MB per file.</p>
                  </div>
                  <button type="button" className="btn-primary w-full sm:w-auto" onClick={sendMessage} disabled={sending || uploading || (!draft.trim() && attachments.length === 0)}><Send className="size-4" /> {sending ? "Sending..." : "Send"}</button>
                </div>
              </div>
            </footer>
          </> : <div className="grid flex-1 place-items-center p-8 text-center"><div><p className="text-2xl font-black text-ink">Select or start a conversation</p><p className="mt-2 text-sm text-slate-500">Search people on the left, then click a name to chat.</p></div></div>}
        </main>
      </div>
    </section>
  </>;
}

function SearchField({ value, onChange, placeholder, compact = false }: { value: string; onChange: (value: string) => void; placeholder: string; compact?: boolean }) {
  return <label className={`flex max-w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 ${compact ? "h-9 w-full min-w-0 sm:min-w-48" : "h-11"}`}><Search className="size-4 text-slate-400" /><input value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={placeholder} /></label>;
}

function ConversationRow({ conversation, currentUserId, selected, onOpen }: { conversation: ChatConversation; currentUserId: string; selected: boolean; onOpen: () => void }) {
  const users = otherUsers(conversation, currentUserId);
  const latest = conversation.messages[0];
  return <button type="button" onClick={onOpen} className={`mb-2 flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${selected ? "border-pine-300 bg-pine-50" : "border-transparent bg-white hover:border-slate-200"}`}>
    <Avatar user={users[0] ?? conversation.participants[0].user} />
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-black">{conversationTitle(conversation, currentUserId)}</p>{conversation.pinned && <Pin className="size-3 text-pine-600" />}</div><p className="truncate text-xs text-slate-500">{latest?.deletedForEveryoneAt ? "Message deleted" : latest?.body || latest?.attachments[0]?.fileName || "No messages yet"}</p></div>
    <div className="text-right"><p className="text-[11px] font-bold text-slate-400">{timeLabel(conversation.lastMessageAt || conversation.createdAt)}</p>{conversation.unreadCount > 0 && <span className="mt-1 inline-grid min-w-6 place-items-center rounded-full bg-leaf-500 px-2 py-1 text-xs font-black text-white">{conversation.unreadCount}</span>}</div>
  </button>;
}

function MessageBubble({ message, mine, participants, onReply, onDelete }: { message: ChatMessage; mine: boolean; participants: ChatConversation["participants"]; onReply: () => void; onDelete: () => void }) {
  return <div className={`flex min-w-0 ${mine ? "justify-end" : "justify-start"}`}><div className={`min-w-0 max-w-[92%] overflow-hidden rounded-3xl px-4 py-3 shadow-sm sm:max-w-[75%] ${mine ? "bg-pine-700 text-white" : "bg-white text-ink"}`}>
    <div className="mb-1 flex items-center justify-between gap-3"><p className={`text-xs font-black ${mine ? "text-pine-100" : "text-slate-500"}`}>{mine ? "You" : message.sender.name}</p><p className={`text-[11px] ${mine ? "text-pine-100" : "text-slate-400"}`}>{timeLabel(message.createdAt)}</p></div>
    {message.deletedForEveryoneAt ? <p className="italic opacity-80">This message was deleted.</p> : <>
      {message.replyTo && <div className={`mb-2 rounded-2xl border-l-4 p-2 text-xs ${mine ? "border-white/50 bg-white/10" : "border-pine-300 bg-slate-50"}`}><p className="font-black">{message.replyTo.senderName}</p><p className="line-clamp-2 break-words [overflow-wrap:anywhere]">{message.replyTo.body || "Attachment"}</p></div>}
      {message.body && <p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{message.body}</p>}
      {message.attachments.length > 0 && <div className="mt-2 grid gap-2">{message.attachments.map((attachment) => <AttachmentPreview key={attachment.id || attachment.url} attachment={attachment} />)}</div>}
      <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold"><button type="button" className="underline" onClick={onReply}>Reply</button>{mine && <button type="button" className="underline" onClick={onDelete}>Delete for everyone</button>}</div>
      {mine && <p className={`mt-1 text-right text-[11px] ${mine ? "text-pine-100" : "text-slate-400"}`}>{seenByOthers(message, participants) ? "Seen" : "Sent"}</p>}
    </>}
  </div></div>;
}

function AttachmentPreview({ attachment, removable = false, onRemove }: { attachment: ChatAttachment; removable?: boolean; onRemove?: () => void }) {
  const image = attachment.contentType.startsWith("image/");
  return <div className="relative max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white/90 text-ink">
    {image ? <a href={attachment.url} target="_blank" rel="noopener noreferrer"><img src={attachment.url} alt={attachment.fileName} className="max-h-52 w-full object-cover" /></a> : <a href={attachment.url} target="_blank" rel="noopener noreferrer" download={attachment.fileName} className="flex items-center gap-3 p-3"><FileText className="size-5 text-pine-600" /><span className="min-w-0"><span className="block truncate text-sm font-black">{attachment.fileName}</span><span className="text-xs text-slate-500">{formatBytes(attachment.size)}</span></span></a>}
    {image && <div className="flex items-center gap-2 p-2 text-xs font-bold"><ImageIcon className="size-4" /><a href={attachment.url} target="_blank" rel="noopener noreferrer" download={attachment.fileName} className="truncate underline">{attachment.fileName}</a><span className="text-slate-400">{formatBytes(attachment.size)}</span></div>}
    {removable && <button type="button" onClick={onRemove} className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"><X className="size-4" /></button>}
  </div>;
}

function Avatar({ user }: { user: ChatUser }) {
  return <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pine-600 to-leaf-500 text-sm font-black text-white shadow-sm"><span>{user.initials}</span><span className={`absolute bottom-0 right-0 size-3 rounded-full border-2 border-white ${user.presence?.online ? "bg-emerald-500" : "bg-rose-500"}`} /></span>;
}

function otherUsers(conversation: ChatConversation, currentUserId: string) {
  return conversation.participants.filter((item) => item.userId !== currentUserId).map((item) => item.user);
}

function conversationTitle(conversation: ChatConversation, currentUserId: string) {
  return conversation.subject || otherUsers(conversation, currentUserId).map((user) => user.name).join(", ") || "Conversation";
}

function personMeta(user: ChatUser) {
  if (user.homeownerProfile) return `Blk ${user.homeownerProfile.block} Lot ${user.homeownerProfile.lot} - ${user.homeownerProfile.address}`;
  if (user.employeeProfile) return `${user.employeeProfile.employeeNumber} - ${user.employeeProfile.position}`;
  return user.role.replaceAll("_", " ");
}

function presenceText(user?: ChatUser) {
  if (!user?.presence) return "Offline";
  if (user.presence.online) return "Online now";
  return `Last active ${timeLabel(user.presence.lastSeenAt)}`;
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function seenByOthers(message: ChatMessage, participants: ChatConversation["participants"]) {
  const createdAt = new Date(message.createdAt).valueOf();
  return participants.filter((item) => item.userId !== message.senderId).some((item) => item.lastReadAt && new Date(item.lastReadAt).valueOf() >= createdAt);
}

function totalUnread(conversations: ChatConversation[]) {
  return conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
}

function publishUnreadCount(conversations: ChatConversation[]) {
  window.dispatchEvent(new CustomEvent("chat-unread-updated", { detail: { count: totalUnread(conversations) } }));
}

function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 660;
    gain.gain.value = 0.05;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
  } catch {}
}

function showBrowserNotification(payload: ChatPayload) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const conversation = payload.conversations.find((item) => item.unreadCount > 0);
  const latest = conversation?.messages[0];
  if (!conversation || !latest) return;
  new Notification(conversationTitle(conversation, payload.currentUserId), { body: latest.body || latest.attachments[0]?.fileName || "New message" });
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
