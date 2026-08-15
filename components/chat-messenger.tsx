"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BellRing,
  Edit3,
  FileText,
  ImageIcon,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Pin,
  Plus,
  Search,
  Send,
  Smile,
  Trash2,
  X,
} from "lucide-react";
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

const emojis = ["👍", "🙏", "✅", "❤️", "😊", "🎉", "📌", "💬"];

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
  const [mobileMessageSearchOpen, setMobileMessageSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [visibleMessages, setVisibleMessages] = useState(50);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [online, setOnline] = useState(true);
  const [chatViewportHeight, setChatViewportHeight] = useState("100dvh");
  const [homeowners, setHomeowners] = useState<ChatUser[]>(initialData.recipients.filter((user) => user.role === "HOMEOWNER"));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const unreadRef = useRef(totalUnread(initialData.conversations));
  const nearBottomRef = useRef(true);

  const currentUserId = data.currentUserId;
  const selectedConversation = data.selectedConversation?.id === selectedId
    ? data.selectedConversation
    : data.conversations.find((item) => item.id === selectedId) ?? null;
  const acceptedTypes = data.settings.allowedMimeTypes.join(",");
  const mobileFullscreen = mobileChatOpen && Boolean(selectedConversation);

  const allRecipients = useMemo(() => {
    const merged = new Map<string, ChatUser>();
    for (const resident of homeowners) merged.set(resident.id, resident);
    for (const recipient of data.recipients) merged.set(recipient.id, recipient);
    return [...merged.values()].sort((a, b) => {
      if (a.role === "HOMEOWNER" && b.role !== "HOMEOWNER") return -1;
      if (a.role !== "HOMEOWNER" && b.role === "HOMEOWNER") return 1;
      if (Boolean(a.presence?.online) !== Boolean(b.presence?.online)) return a.presence?.online ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [data.recipients, homeowners]);

  const filteredRecipients = useMemo(() => {
    const term = normalizeSearch(recipientSearch);
    return allRecipients.filter((user) => !term || normalizeSearch(user.searchText).includes(term));
  }, [allRecipients, recipientSearch]);

  const homeownerRecipients = useMemo(
    () => filteredRecipients.filter((user) => user.role === "HOMEOWNER"),
    [filteredRecipients],
  );

  const officialRecipients = useMemo(
    () => filteredRecipients.filter((user) => user.role !== "HOMEOWNER"),
    [filteredRecipients],
  );

  const filteredConversations = useMemo(() => {
    const term = normalizeSearch(recipientSearch);
    if (!term) return data.conversations;
    return data.conversations.filter((conversation) => {
      const latest = conversation.messages[0];
      const haystack = [
        conversationTitle(conversation, currentUserId),
        latest?.body,
        latest?.attachments[0]?.fileName,
        ...conversation.participants.map((participant) => participant.user.searchText),
      ].filter(Boolean).join(" ");
      return normalizeSearch(haystack).includes(term);
    });
  }, [currentUserId, data.conversations, recipientSearch]);

  const messages = useMemo(() => {
    const all = selectedConversation?.messages ?? [];
    const term = normalizeSearch(messageSearch);
    const filtered = term
      ? all.filter((message) => normalizeSearch(`${message.body ?? ""} ${message.sender.name} ${message.attachments.map((item) => item.fileName).join(" ")}`).includes(term))
      : all;
    return filtered.slice(Math.max(0, filtered.length - visibleMessages));
  }, [selectedConversation, messageSearch, visibleMessages]);

  useEffect(() => {
    const timer = window.setInterval(() => refresh(false), data.settings.pollIntervalSeconds * 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setMobileMessageSearchOpen(false);
    setMobileMenuOpen(false);
    setActiveMessageId(null);
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

  useEffect(() => {
    function updateOnlineState() {
      setOnline(navigator.onLine);
    }
    updateOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setDirectoryLoading(true);
      try {
        const params = new URLSearchParams();
        if (recipientSearch.trim()) params.set("search", recipientSearch.trim());
        const response = await fetch(`/api/chat/homeowners?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const result = await response.json() as { homeowners?: ChatUser[] };
        if (Array.isArray(result.homeowners)) setHomeowners(result.homeowners);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          // The existing chat payload remains a safe fallback if directory refresh fails.
        }
      } finally {
        setDirectoryLoading(false);
      }
    }, recipientSearch.trim() ? 220 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [recipientSearch]);

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

  function openExistingConversation(conversationId: string) {
    nearBottomRef.current = true;
    setSelectedId(conversationId);
    setMobileChatOpen(true);
    window.history.replaceState(null, "", `${basePath}?conversation=${conversationId}`);
    void refresh(false, true, conversationId);
  }

  function closeMobileConversation() {
    setMobileChatOpen(false);
    setMobileMenuOpen(false);
    setMobileMessageSearchOpen(false);
    setActiveMessageId(null);
    window.history.replaceState(null, "", basePath);
  }

  async function uploadFiles(files: FileList | File[]) {
    const selected = Array.from(files);
    if (!selected.length) return;
    if (!online) {
      setError("Reconnect before uploading an attachment.");
      return;
    }
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
    if (!online) {
      setError("Reconnect before sending a message.");
      return;
    }
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
    setActiveMessageId(null);
    setData(result);
    publishUnreadCount(result.conversations);
  }

  async function pinConversation(conversationId: string, pinned: boolean) {
    const response = await fetch("/api/chat/conversations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, pinned }),
    });
    const result = await response.json();
    if (response.ok) {
      setData(result);
      publishUnreadCount(result.conversations);
    }
  }

  async function deleteConversation(conversationId: string) {
    const response = await fetch(`/api/chat/conversations?conversationId=${encodeURIComponent(conversationId)}`, { method: "DELETE" });
    const result = await response.json();
    if (response.ok) {
      setData(result);
      publishUnreadCount(result.conversations);
      setSelectedId(result.selectedConversation?.id ?? "");
      setMobileChatOpen(false);
      window.history.replaceState(null, "", basePath);
    }
  }

  function enableNotifications() {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then((permission) => setNotificationsEnabled(permission === "granted"));
  }

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        for (const node of [mobileScrollRef.current, desktopScrollRef.current]) {
          node?.scrollTo({ top: node.scrollHeight, behavior });
        }
      });
    });
  }

  return <>
    <input
      ref={fileInputRef}
      type="file"
      accept={acceptedTypes}
      multiple
      className="hidden"
      onChange={(event) => event.target.files && uploadFiles(event.target.files)}
    />

    <div className="lg:hidden">
      {!mobileChatOpen || !selectedConversation ? (
        <section className="relative min-h-[calc(100dvh-7rem)] overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-soft">
          <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-4 pb-3 pt-4 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#0A7CFF] text-white shadow-sm">
                  <MessageCircle className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">HOAHub</p>
                  <h1 className="truncate text-2xl font-black tracking-tight text-slate-950">Messages</h1>
                </div>
              </div>
              <button
                type="button"
                aria-label="Enable message notifications"
                onClick={enableNotifications}
                className="grid size-11 place-items-center rounded-full bg-slate-100 text-slate-800 transition active:scale-95"
              >
                {notificationsEnabled ? <BellRing className="size-5" /> : <Bell className="size-5" />}
              </button>
            </div>

            <label className="mt-4 flex h-12 items-center gap-3 rounded-full bg-slate-100 px-4 text-slate-500">
              <Search className="size-5 shrink-0" />
              <input
                id="mobile-chat-search"
                value={recipientSearch}
                onChange={(event) => setRecipientSearch(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-slate-900 outline-none placeholder:text-slate-500"
                placeholder="Search homeowners or chats"
              />
              {recipientSearch && (
                <button type="button" aria-label="Clear search" onClick={() => setRecipientSearch("")} className="grid size-7 place-items-center rounded-full bg-slate-300/70 text-slate-700">
                  <X className="size-4" />
                </button>
              )}
            </label>
          </header>

          <div className="max-h-[calc(100dvh-14rem)] overflow-y-auto pb-28">
            {!recipientSearch && homeownerRecipients.length > 0 && (
              <section className="border-b border-slate-100 px-4 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-black text-slate-900">People</h2>
                  <span className="text-xs font-bold text-slate-400">Homeowners</span>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {homeownerRecipients.slice(0, 10).map((resident) => (
                    <button key={resident.id} type="button" onClick={() => openConversation(resident.id)} className="w-16 shrink-0 text-center">
                      <span className="mx-auto block w-fit"><Avatar user={resident} size="large" /></span>
                      <span className="mt-1.5 block truncate text-xs font-bold text-slate-700">{firstName(resident.name)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="px-3 py-4">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-base font-black text-slate-950">Chats</h2>
                <span className="text-xs font-bold text-slate-400">{filteredConversations.length}</span>
              </div>
              <div className="space-y-1">
                {filteredConversations.map((conversation) => (
                  <MobileConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    currentUserId={currentUserId}
                    onOpen={() => openExistingConversation(conversation.id)}
                  />
                ))}
                {!filteredConversations.length && (
                  <p className="rounded-2xl bg-slate-50 px-4 py-5 text-sm font-medium text-slate-500">
                    {recipientSearch ? "No conversations match your search." : "No conversations yet. Choose a homeowner below to start one."}
                  </p>
                )}
              </div>
            </section>

            <section className="border-t border-slate-100 px-3 py-4">
              <div className="mb-2 flex items-center justify-between px-1">
                <div>
                  <h2 className="text-base font-black text-slate-950">Homeowners</h2>
                  <p className="text-xs font-medium text-slate-500">Verified residents in this HOA</p>
                </div>
                <span className="text-xs font-bold text-slate-400">{directoryLoading ? "Searching…" : homeownerRecipients.length}</span>
              </div>
              <div className="space-y-1">
                {homeownerRecipients.map((resident) => (
                  <MobileContactRow key={resident.id} user={resident} onOpen={() => openConversation(resident.id)} />
                ))}
                {!homeownerRecipients.length && (
                  <p className="rounded-2xl bg-slate-50 px-4 py-5 text-sm font-medium text-slate-500">
                    {directoryLoading ? "Searching homeowners…" : "No homeowners match your search."}
                  </p>
                )}
              </div>
            </section>

            {officialRecipients.length > 0 && (
              <section className="border-t border-slate-100 px-3 py-4">
                <div className="mb-2 px-1">
                  <h2 className="text-base font-black text-slate-950">HOA officials</h2>
                  <p className="text-xs font-medium text-slate-500">Admins and employees</p>
                </div>
                <div className="space-y-1">
                  {officialRecipients.map((official) => (
                    <MobileContactRow key={official.id} user={official} onOpen={() => openConversation(official.id)} />
                  ))}
                </div>
              </section>
            )}
          </div>

          {error && <p className="absolute bottom-20 left-3 right-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 shadow-lg">{error}</p>}

          <button
            type="button"
            aria-label="Start a new message"
            onClick={() => document.getElementById("mobile-chat-search")?.focus()}
            className="absolute bottom-5 right-5 grid size-14 place-items-center rounded-full bg-[#0A7CFF] text-white shadow-xl transition active:scale-95"
          >
            <Edit3 className="size-6" />
          </button>
        </section>
      ) : (
        <section style={{ height: chatViewportHeight }} className="fixed inset-0 z-[90] flex min-h-0 flex-col bg-white">
          <header className="shrink-0 border-b border-slate-100 bg-white px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.35rem)] shadow-[0_1px_0_rgba(15,23,42,0.04)]">
            <div className="flex h-14 items-center gap-2">
              <button type="button" aria-label="Back to conversations" onClick={closeMobileConversation} className="grid size-11 shrink-0 place-items-center rounded-full text-[#0A7CFF] active:bg-slate-100">
                <ArrowLeft className="size-6" />
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <Avatar user={otherUsers(selectedConversation, currentUserId)[0] ?? selectedConversation.participants[0].user} />
                <div className="min-w-0">
                  <h2 className="truncate text-[16px] font-black text-slate-950">{conversationTitle(selectedConversation, currentUserId)}</h2>
                  <p className="truncate text-xs font-medium text-slate-500">{presenceText(otherUsers(selectedConversation, currentUserId)[0])}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Search this conversation"
                onClick={() => setMobileMessageSearchOpen((value) => !value)}
                className="grid size-10 shrink-0 place-items-center rounded-full text-[#0A7CFF] active:bg-slate-100"
              >
                <Search className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Conversation options"
                onClick={() => setMobileMenuOpen((value) => !value)}
                className="grid size-10 shrink-0 place-items-center rounded-full text-[#0A7CFF] active:bg-slate-100"
              >
                <MoreHorizontal className="size-6" />
              </button>
            </div>

            {mobileMessageSearchOpen && (
              <label className="mb-1 flex h-10 items-center gap-2 rounded-full bg-slate-100 px-3">
                <Search className="size-4 text-slate-500" />
                <input
                  autoFocus
                  value={messageSearch}
                  onChange={(event) => setMessageSearch(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                  placeholder="Search in conversation"
                />
                {messageSearch && <button type="button" onClick={() => setMessageSearch("")}><X className="size-4 text-slate-500" /></button>}
              </label>
            )}

            {mobileMenuOpen && (
              <div className="mb-1 grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-2">
                <button type="button" onClick={() => pinConversation(selectedConversation.id, !selectedConversation.pinned)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white text-sm font-black text-slate-700 shadow-sm">
                  <Pin className="size-4" /> {selectedConversation.pinned ? "Unpin" : "Pin"}
                </button>
                <button type="button" onClick={() => deleteConversation(selectedConversation.id)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-50 text-sm font-black text-rose-700">
                  <Trash2 className="size-4" /> Delete chat
                </button>
              </div>
            )}
          </header>

          {!online && <p className="mx-3 mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">You are offline. Messages and attachments are not queued.</p>}
          {error && <p className="mx-3 mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}

          <div
            ref={mobileScrollRef}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-white px-3 py-4"
            onScroll={(event) => {
              const node = event.currentTarget;
              nearBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
              if (node.scrollTop < 24) setVisibleMessages((value) => Math.min(value + 30, selectedConversation.messages.length));
            }}
          >
            {loadingHistory && <p className="mx-auto w-fit rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500">Loading…</p>}
            {selectedConversation.messages.length > visibleMessages && <p className="text-center text-xs font-semibold text-slate-400">Scroll up for older messages</p>}
            {!loadingHistory && messages.length === 0 && (
              <div className="grid min-h-[45vh] place-items-center px-8 text-center">
                <div>
                  <Avatar user={otherUsers(selectedConversation, currentUserId)[0] ?? selectedConversation.participants[0].user} size="xlarge" />
                  <p className="mt-3 text-lg font-black text-slate-950">{conversationTitle(selectedConversation, currentUserId)}</p>
                  <p className="mt-1 text-sm font-medium text-slate-500">{messageSearch ? "No messages match your search." : "Start the conversation with a message."}</p>
                </div>
              </div>
            )}
            {messages.map((message) => (
              <MobileMessageBubble
                key={message.id}
                message={message}
                mine={message.senderId === currentUserId}
                participants={selectedConversation.participants}
                active={activeMessageId === message.id}
                onToggle={() => setActiveMessageId((current) => current === message.id ? null : message.id)}
                onReply={() => {
                  setReplyTo(message);
                  setActiveMessageId(null);
                }}
                onDelete={() => void deleteMessage(message.id)}
              />
            ))}
          </div>

          <footer className="shrink-0 border-t border-slate-100 bg-white px-2 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-2">
            {replyTo && (
              <div className="mx-1 mb-2 flex items-center justify-between gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-xs">
                <p className="min-w-0 truncate"><span className="font-black">Replying to {replyTo.sender.name}:</span> {replyTo.body || replyTo.attachments[0]?.fileName}</p>
                <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)} className="grid size-7 shrink-0 place-items-center rounded-full bg-white"><X className="size-4" /></button>
              </div>
            )}
            {attachments.length > 0 && (
              <div className="mb-2 flex max-h-28 gap-2 overflow-x-auto px-1">
                {attachments.map((attachment) => (
                  <AttachmentPreview key={attachment.url} attachment={attachment} removable onRemove={() => setAttachments((current) => current.filter((item) => item.url !== attachment.url))} />
                ))}
              </div>
            )}
            <div className="flex items-end gap-1.5">
              <button
                type="button"
                aria-label="Add attachment"
                onClick={() => fileInputRef.current?.click()}
                disabled={!online || uploading}
                className="mb-0.5 grid size-10 shrink-0 place-items-center rounded-full text-[#0A7CFF] active:bg-slate-100 disabled:opacity-40"
              >
                {uploading ? <span className="text-[10px] font-black">…</span> : <Plus className="size-6" />}
              </button>
              <div className="relative flex min-h-11 min-w-0 flex-1 items-end rounded-[1.4rem] bg-slate-100 pl-3 pr-10">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={1}
                  className="max-h-28 min-h-11 w-full resize-none overflow-y-auto bg-transparent py-2.5 text-[15px] leading-6 text-slate-900 outline-none placeholder:text-slate-500"
                  placeholder="Message"
                  disabled={sending || !online}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <button type="button" aria-label="Emoji" onClick={() => setShowEmoji((value) => !value)} className="absolute bottom-1 right-1 grid size-9 place-items-center rounded-full text-[#0A7CFF] active:bg-white">
                  <Smile className="size-5" />
                </button>
                {showEmoji && (
                  <div className="absolute bottom-12 right-0 z-30 flex max-w-[82vw] gap-1 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl">
                    {emojis.map((emoji) => <button key={emoji} type="button" className="rounded-xl p-2 text-xl active:bg-slate-100" onClick={() => setDraft((value) => `${value}${emoji}`)}>{emoji}</button>)}
                  </div>
                )}
              </div>
              <button
                type="button"
                aria-label="Send message"
                onClick={() => void sendMessage()}
                disabled={!online || sending || uploading || (!draft.trim() && attachments.length === 0)}
                className="mb-0.5 grid size-10 shrink-0 place-items-center rounded-full text-[#0A7CFF] active:bg-slate-100 disabled:text-slate-300"
              >
                <Send className="size-6" />
              </button>
            </div>
          </footer>
        </section>
      )}
    </div>

    <div className="hidden lg:block">
      <PageHeader
        eyebrow="Messenger-style HOA communication"
        title={title}
        description={description}
        action={<button type="button" className="btn-secondary" onClick={enableNotifications}>{notificationsEnabled ? <BellRing className="size-4" /> : <Bell className="size-4" />} Browser alerts</button>}
      />
      <section className="max-w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
        <div className="grid min-h-[72vh] max-w-full lg:grid-cols-[360px_1fr]">
          <aside className="border-r border-slate-100 bg-slate-50/80">
            <div className="space-y-3 border-b border-slate-100 p-4">
              <h2 className="text-lg font-black text-ink">Conversations</h2>
              <SearchField value={recipientSearch} onChange={setRecipientSearch} placeholder="Search homeowners, unit or chats" />
            </div>
            <div className="max-h-[32vh] overflow-y-auto border-b border-slate-100 p-3 lg:max-h-[260px]">
              <p className="mb-1 px-2 text-sm font-black text-ink">Start a conversation</p>
              <p className="mb-2 px-2 text-xs font-black uppercase tracking-wider text-slate-500">Homeowners</p>
              {homeownerRecipients.slice(0, 80).map((recipient) => (
                <button key={recipient.id} type="button" onClick={() => openConversation(recipient.id)} className="mb-1 flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-white">
                  <Avatar user={recipient} />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{recipient.name}</p><p className="truncate text-xs text-slate-500">{personMeta(recipient)}</p></div>
                </button>
              ))}
              {!homeownerRecipients.length && <p className="rounded-2xl bg-white p-4 text-sm text-slate-500">No homeowners match your search.</p>}
            </div>
            <div className="max-h-[48vh] overflow-y-auto p-3 lg:max-h-[calc(72vh-300px)]">
              {filteredConversations.map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} currentUserId={currentUserId} selected={conversation.id === selectedConversation?.id} onOpen={() => openExistingConversation(conversation.id)} />)}
              {!filteredConversations.length && <p className="rounded-2xl bg-white p-4 text-sm text-slate-500">No conversations yet.</p>}
            </div>
          </aside>

          <main className="flex min-h-[72vh] max-w-full flex-col overflow-hidden bg-white">
            {selectedConversation ? <>
              <header className="shrink-0 flex items-center justify-between gap-3 border-b border-slate-100 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar user={otherUsers(selectedConversation, currentUserId)[0] ?? selectedConversation.participants[0].user} />
                  <div className="min-w-0"><h2 className="truncate text-lg font-black">{conversationTitle(selectedConversation, currentUserId)}</h2><p className="text-xs text-slate-500">{presenceText(otherUsers(selectedConversation, currentUserId)[0])}</p></div>
                </div>
                <div className="flex min-w-0 flex-wrap gap-2">
                  <SearchField value={messageSearch} onChange={setMessageSearch} placeholder="Search messages" compact />
                  <button type="button" className="btn-secondary min-h-9 px-3 py-1 text-xs" onClick={() => pinConversation(selectedConversation.id, !selectedConversation.pinned)}><Pin className="size-4" /> {selectedConversation.pinned ? "Unpin" : "Pin"}</button>
                  <button type="button" className="btn-danger min-h-9 px-3 py-1 text-xs" onClick={() => deleteConversation(selectedConversation.id)}><Trash2 className="size-4" /> Delete for me</button>
                </div>
              </header>
              {!online && <p className="mx-4 mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900" role="status">You are offline. Messages and attachments are not queued.</p>}
              {error && <p className="mx-4 mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
              <div
                ref={desktopScrollRef}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden overscroll-contain bg-gradient-to-b from-slate-50 to-white p-4"
                onScroll={(event) => {
                  const node = event.currentTarget;
                  nearBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
                  if (node.scrollTop < 24) setVisibleMessages((value) => Math.min(value + 30, selectedConversation.messages.length));
                }}
              >
                {loadingHistory && <p className="sticky top-0 z-10 mx-auto w-fit rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-center text-xs font-black uppercase tracking-wider text-slate-500 shadow-sm">Loading chat history...</p>}
                {selectedConversation.messages.length > visibleMessages && <p className="text-center text-xs font-bold text-slate-400">Scroll up to load older messages</p>}
                {!loadingHistory && messages.length === 0 && <div className="grid min-h-48 place-items-center rounded-3xl border border-dashed border-slate-200 bg-white/80 p-6 text-center"><div><p className="text-lg font-black text-ink">{selectedConversation.messages.length ? "No messages match your search" : "No messages yet"}</p><p className="mt-1 text-sm text-slate-500">{selectedConversation.messages.length ? "Clear the message search to view the full history." : "Send the first message to start this conversation."}</p></div></div>}
                {messages.map((message) => <MessageBubble key={message.id} message={message} mine={message.senderId === currentUserId} participants={selectedConversation.participants} onReply={() => setReplyTo(message)} onDelete={() => deleteMessage(message.id)} />)}
              </div>
              <footer className="shrink-0 border-t border-slate-100 bg-white p-4">
                {replyTo && <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl bg-pine-50 p-3 text-sm"><p className="min-w-0 truncate"><span className="font-black">Replying to {replyTo.sender.name}:</span> {replyTo.body || replyTo.attachments[0]?.fileName}</p><button type="button" onClick={() => setReplyTo(null)}><X className="size-4" /></button></div>}
                {attachments.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{attachments.map((attachment) => <AttachmentPreview key={attachment.url} attachment={attachment} removable onRemove={() => setAttachments((current) => current.filter((item) => item.url !== attachment.url))} />)}</div>}
                <div className="max-w-full rounded-3xl border border-slate-200 bg-slate-50 p-3">
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="max-h-32 min-h-16 w-full resize-none overflow-y-auto bg-transparent p-2 text-sm outline-none" placeholder="Write a message..." disabled={sending || !online} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(); } }} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="relative flex flex-wrap gap-2">
                      <button type="button" className="btn-secondary min-h-9 px-3 py-1 text-xs" onClick={() => fileInputRef.current?.click()} disabled={!online}><Paperclip className="size-4" /> {uploading ? "Uploading..." : "Upload Attachment"}</button>
                      <button type="button" className="btn-secondary min-h-9 px-3 py-1 text-xs" onClick={() => setShowEmoji((value) => !value)}><Smile className="size-4" /> Emoji</button>
                      {showEmoji && <div className="absolute bottom-11 left-0 z-20 flex gap-1 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl">{emojis.map((emoji) => <button key={emoji} type="button" className="rounded-xl p-2 text-xl hover:bg-slate-50" onClick={() => setDraft((value) => `${value}${emoji}`)}>{emoji}</button>)}</div>}
                      <p className="basis-full text-xs text-slate-400">Max {data.settings.maxAttachmentMb}MB per file.</p>
                    </div>
                    <button type="button" className="btn-primary" onClick={() => void sendMessage()} disabled={!online || sending || uploading || (!draft.trim() && attachments.length === 0)}><Send className="size-4" /> {sending ? "Sending..." : "Send"}</button>
                  </div>
                </div>
              </footer>
            </> : <div className="grid flex-1 place-items-center p-8 text-center"><div><p className="text-2xl font-black text-ink">Select or start a conversation</p><p className="mt-2 text-sm text-slate-500">Search homeowners on the left, then choose a name to chat.</p></div></div>}
          </main>
        </div>
      </section>
    </div>
  </>;
}

function SearchField({ value, onChange, placeholder, compact = false }: { value: string; onChange: (value: string) => void; placeholder: string; compact?: boolean }) {
  return <label className={`flex max-w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 ${compact ? "h-9 w-full min-w-0 sm:min-w-48" : "h-11"}`}><Search className="size-4 text-slate-400" /><input value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={placeholder} /></label>;
}

function MobileConversationRow({ conversation, currentUserId, onOpen }: { conversation: ChatConversation; currentUserId: string; onOpen: () => void }) {
  const other = otherUsers(conversation, currentUserId)[0] ?? conversation.participants[0].user;
  const latest = conversation.messages[0];
  const preview = latest?.deletedForEveryoneAt ? "Message deleted" : latest?.body || latest?.attachments[0]?.fileName || "Start a conversation";
  return <button type="button" onClick={onOpen} className="flex min-h-[72px] w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition active:bg-slate-100">
    <Avatar user={other} size="large" />
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2"><p className={`truncate text-[15px] ${conversation.unreadCount ? "font-black text-slate-950" : "font-bold text-slate-900"}`}>{conversationTitle(conversation, currentUserId)}</p>{conversation.pinned && <Pin className="size-3.5 shrink-0 text-slate-400" />}</div>
      <p className={`mt-0.5 truncate text-[13px] ${conversation.unreadCount ? "font-bold text-slate-800" : "font-medium text-slate-500"}`}>{preview}</p>
    </div>
    <div className="shrink-0 text-right">
      <p className={`text-[11px] ${conversation.unreadCount ? "font-black text-[#0A7CFF]" : "font-semibold text-slate-400"}`}>{shortTimeLabel(conversation.lastMessageAt || conversation.createdAt)}</p>
      {conversation.unreadCount > 0 && <span className="mt-2 inline-block size-2.5 rounded-full bg-[#0A7CFF]" />}
    </div>
  </button>;
}

function MobileContactRow({ user, onOpen }: { user: ChatUser; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="flex min-h-[68px] w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition active:bg-slate-100">
    <Avatar user={user} />
    <div className="min-w-0 flex-1"><p className="truncate text-[15px] font-black text-slate-900">{user.name}</p><p className="mt-0.5 truncate text-xs font-medium text-slate-500">{personMeta(user)}</p></div>
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${user.presence?.online ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{user.presence?.online ? "Online" : "Message"}</span>
  </button>;
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

function MobileMessageBubble({ message, mine, participants, active, onToggle, onReply, onDelete }: { message: ChatMessage; mine: boolean; participants: ChatConversation["participants"]; active: boolean; onToggle: () => void; onReply: () => void; onDelete: () => void }) {
  return <div className={`flex min-w-0 flex-col ${mine ? "items-end" : "items-start"}`}>
    <button type="button" onClick={onToggle} className={`max-w-[78%] overflow-hidden rounded-[1.25rem] px-3.5 py-2 text-left text-[15px] leading-5 shadow-[0_1px_1px_rgba(15,23,42,0.04)] ${mine ? "rounded-br-md bg-[#0A7CFF] text-white" : "rounded-bl-md bg-slate-100 text-slate-950"}`}>
      {message.deletedForEveryoneAt ? <span className="italic opacity-75">This message was deleted.</span> : <>
        {message.replyTo && <span className={`mb-1.5 block rounded-xl px-2 py-1.5 text-xs ${mine ? "bg-white/15" : "bg-white"}`}><span className="block font-black">{message.replyTo.senderName}</span><span className="block truncate opacity-80">{message.replyTo.body || "Attachment"}</span></span>}
        {message.body && <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.body}</span>}
        {message.attachments.length > 0 && <span className="mt-2 grid gap-2">{message.attachments.map((attachment) => <AttachmentPreview key={attachment.id || attachment.url} attachment={attachment} />)}</span>}
      </>}
    </button>
    <div className={`mt-1 flex items-center gap-2 px-1 text-[10px] font-semibold ${mine ? "flex-row-reverse text-slate-400" : "text-slate-400"}`}>
      <span>{shortTimeLabel(message.createdAt)}</span>
      {mine && !message.deletedForEveryoneAt && <span>{seenByOthers(message, participants) ? "Seen" : "Sent"}</span>}
    </div>
    {active && !message.deletedForEveryoneAt && (
      <div className={`mt-1 flex items-center gap-1 rounded-full bg-white p-1 shadow-lg ring-1 ring-slate-200 ${mine ? "mr-1" : "ml-1"}`}>
        <button type="button" onClick={onReply} className="rounded-full px-3 py-1.5 text-xs font-black text-slate-700 active:bg-slate-100">Reply</button>
        {mine && <button type="button" onClick={onDelete} className="rounded-full px-3 py-1.5 text-xs font-black text-rose-600 active:bg-rose-50">Delete</button>}
      </div>
    )}
  </div>;
}

function MessageBubble({ message, mine, participants, onReply, onDelete }: { message: ChatMessage; mine: boolean; participants: ChatConversation["participants"]; onReply: () => void; onDelete: () => void }) {
  return <div className={`flex min-w-0 ${mine ? "justify-end" : "justify-start"}`}><div className={`min-w-0 max-w-[92%] overflow-hidden rounded-3xl px-4 py-3 shadow-sm sm:max-w-[75%] ${mine ? "bg-pine-700 text-white" : "bg-white text-ink"}`}>
    <div className="mb-1 flex items-center justify-between gap-3"><p className={`text-xs font-black ${mine ? "text-pine-100" : "text-slate-500"}`}>{mine ? "You" : message.sender.name}</p><p className={`text-[11px] ${mine ? "text-pine-100" : "text-slate-400"}`}>{timeLabel(message.createdAt)}</p></div>
    {message.deletedForEveryoneAt ? <p className="italic opacity-80">This message was deleted.</p> : <>
      {message.replyTo && <div className={`mb-2 rounded-2xl border-l-4 p-2 text-xs ${mine ? "border-white/50 bg-white/10" : "border-pine-300 bg-slate-50"}`}><p className="font-black">{message.replyTo.senderName}</p><p className="line-clamp-2 break-words [overflow-wrap:anywhere]">{message.replyTo.body || "Attachment"}</p></div>}
      {message.body && <p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{message.body}</p>}
      {message.attachments.length > 0 && <div className="mt-2 grid gap-2">{message.attachments.map((attachment) => <AttachmentPreview key={attachment.id || attachment.url} attachment={attachment} />)}</div>}
      <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold"><button type="button" className="underline" onClick={onReply}>Reply</button>{mine && <button type="button" className="underline" onClick={onDelete}>Delete for everyone</button>}</div>
      {mine && <p className="mt-1 text-right text-[11px] text-pine-100">{seenByOthers(message, participants) ? "Seen" : "Sent"}</p>}
    </>}
  </div></div>;
}

function AttachmentPreview({ attachment, removable = false, onRemove }: { attachment: ChatAttachment; removable?: boolean; onRemove?: () => void }) {
  const image = attachment.contentType.startsWith("image/");
  return <span className="relative block max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white/95 text-slate-900">
    {image ? <a href={attachment.url} target="_blank" rel="noopener noreferrer"><img src={attachment.url} alt={attachment.fileName} className="max-h-52 w-full object-cover" /></a> : <a href={attachment.url} target="_blank" rel="noopener noreferrer" download={attachment.fileName} className="flex items-center gap-3 p-3"><FileText className="size-5 text-pine-600" /><span className="min-w-0"><span className="block truncate text-sm font-black">{attachment.fileName}</span><span className="text-xs text-slate-500">{formatBytes(attachment.size)}</span></span></a>}
    {image && <span className="flex items-center gap-2 p-2 text-xs font-bold"><ImageIcon className="size-4" /><a href={attachment.url} target="_blank" rel="noopener noreferrer" download={attachment.fileName} className="truncate underline">{attachment.fileName}</a><span className="text-slate-400">{formatBytes(attachment.size)}</span></span>}
    {removable && <button type="button" onClick={onRemove} className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"><X className="size-4" /></button>}
  </span>;
}

function Avatar({ user, size = "normal" }: { user: ChatUser; size?: "normal" | "large" | "xlarge" }) {
  const sizeClass = size === "xlarge" ? "size-20 text-xl" : size === "large" ? "size-14 text-base" : "size-11 text-sm";
  const presenceClass = size === "xlarge" ? "size-4" : size === "large" ? "size-3.5" : "size-3";
  return <span className={`relative grid ${sizeClass} shrink-0 place-items-center rounded-full bg-gradient-to-br from-pine-600 to-leaf-500 font-black text-white shadow-sm`}><span>{user.initials}</span><span className={`absolute bottom-0 right-0 ${presenceClass} rounded-full border-2 border-white ${user.presence?.online ? "bg-emerald-500" : "bg-slate-400"}`} /></span>;
}

function otherUsers(conversation: ChatConversation, currentUserId: string) {
  return conversation.participants.filter((item) => item.userId !== currentUserId).map((item) => item.user);
}

function conversationTitle(conversation: ChatConversation, currentUserId: string) {
  return conversation.subject || otherUsers(conversation, currentUserId).map((user) => user.name).join(", ") || "Conversation";
}

function personMeta(user: ChatUser) {
  if (user.homeownerProfile) return `Blk ${user.homeownerProfile.block} Lot ${user.homeownerProfile.lot} · ${user.homeownerProfile.address}`;
  if (user.employeeProfile) return `${user.employeeProfile.employeeNumber} · ${user.employeeProfile.position}`;
  return user.role.replaceAll("_", " ");
}

function presenceText(user?: ChatUser) {
  if (!user?.presence) return "Offline";
  if (user.presence.online) return "Active now";
  return `Last active ${shortTimeLabel(user.presence.lastSeenAt)}`;
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function shortTimeLabel(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(date);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(date);
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

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || value;
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
