"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function EmailDeliveryLiveStatus({ enabled, queuedCount }: { enabled: boolean; queuedCount: number }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!enabled || queuedCount < 1) return;
    const timer = window.setInterval(() => {
      setRefreshing(true);
      router.refresh();
      window.setTimeout(() => setRefreshing(false), 800);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [enabled, queuedCount, router]);

  return <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
    {enabled && queuedCount > 0 && <span>{refreshing ? "Refreshing delivery results…" : "Queued delivery results auto-refresh every 20 seconds."}</span>}
    <button
      type="button"
      className="btn-secondary px-3 py-2 text-xs"
      onClick={() => {
        setRefreshing(true);
        router.refresh();
        window.setTimeout(() => setRefreshing(false), 800);
      }}
    >
      {refreshing ? "Refreshing…" : "Refresh status"}
    </button>
  </div>;
}
