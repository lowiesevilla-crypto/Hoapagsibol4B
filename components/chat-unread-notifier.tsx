"use client";

import Link from "next/link";
import { BellRing, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ChatUnreadNotifier({ initialUnreadCount = 0, chatHref }: { initialUnreadCount?: number; chatHref: string }) {
  const [popupCount, setPopupCount] = useState(0);
  const previousCountRef = useRef(Math.max(0, initialUnreadCount));
  const dismissTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    function scheduleDismiss() {
      if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = window.setTimeout(() => setPopupCount(0), 6500);
    }

    function applyUnreadCount(nextValue: number) {
      const nextCount = Math.max(0, Number(nextValue) || 0);
      const previousCount = previousCountRef.current;
      previousCountRef.current = nextCount;
      if (nextCount > previousCount) {
        setPopupCount(nextCount - previousCount);
        scheduleDismiss();
      }
    }

    async function refreshUnread() {
      try {
        const response = await fetch("/api/chat/unread", { cache: "no-store" });
        if (!response.ok || !active) return;
        const result = await response.json() as { unreadCount?: number };
        applyUnreadCount(Number(result.unreadCount) || 0);
      } catch {
        // Silent retry: chat availability must never interrupt the authenticated shell.
      }
    }

    function handleUnread(event: Event) {
      const count = Number((event as CustomEvent<{ count?: number }>).detail?.count);
      if (Number.isFinite(count)) applyUnreadCount(count);
      else void refreshUnread();
    }

    const timer = window.setInterval(refreshUnread, 12_000);
    window.addEventListener("chat-unread-updated", handleUnread);
    window.addEventListener("focus", refreshUnread);

    return () => {
      active = false;
      window.clearInterval(timer);
      if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
      window.removeEventListener("chat-unread-updated", handleUnread);
      window.removeEventListener("focus", refreshUnread);
    };
  }, []);

  if (popupCount <= 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[90] flex justify-center sm:inset-x-auto sm:right-5 sm:top-5 sm:justify-end" role="status" aria-live="polite">
      <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-3xl border border-blue-200 bg-white shadow-2xl">
        <div className="flex items-start gap-3 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700"><BellRing className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[.14em] text-blue-700">New message</p>
            <p className="mt-1 font-black text-slate-950">{popupCount === 1 ? "You received a new HOAHub message." : `You received ${popupCount} new HOAHub messages.`}</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Open Chat to view the tenant-authorized conversation.</p>
            <Link href={chatHref} className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-blue-700 px-4 text-sm font-black text-white">Open Chat</Link>
          </div>
          <button type="button" onClick={() => setPopupCount(0)} className="grid size-9 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Dismiss new message notification"><X className="size-4" /></button>
        </div>
      </div>
    </div>
  );
}
