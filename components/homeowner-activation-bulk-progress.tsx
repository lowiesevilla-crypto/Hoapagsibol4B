"use client";

import { CheckCircle2, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Job = {
  id: string;
  status: string;
  totalTargets: number;
  eligibleCount: number;
  queuedCount: number;
  processedCount: number;
  acceptedCount: number;
  skippedCount: number;
  failedCount: number;
  lastError?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
};

type Props = {
  jobId?: string;
};

const terminal = new Set(["SUCCEEDED", "PARTIAL", "FAILED"]);

export function HomeownerActivationBulkProgress({ jobId }: Props) {
  const [job, setJob] = useState<Job | null>(null);
  const [loadError, setLoadError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const retryKeyRef = useRef("");

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: number | undefined;

    const load = async () => {
      try {
        const response = await fetch(`/api/admin/homeowners/activation-jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load activation job progress.");
        const payload = await response.json() as { job: Job };
        if (cancelled) return;
        setJob(payload.job);
        setLoadError("");
        if (!terminal.has(payload.job.status)) timer = window.setTimeout(load, 2500);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Unable to load activation job progress.");
        timer = window.setTimeout(load, 5000);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [jobId]);

  const percent = useMemo(() => {
    if (!job?.totalTargets) return 100;
    return Math.min(100, Math.round((job.processedCount / job.totalTargets) * 100));
  }, [job]);

  if (!jobId) return null;
  if (!job && !loadError) return <div className="mb-4 flex items-center gap-2 rounded-xl border bg-white p-4 text-sm font-semibold text-slate-600"><LoaderCircle className="size-4 animate-spin" /> Loading activation job progress…</div>;
  if (!job) return <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">{loadError}</div>;

  const isTerminal = terminal.has(job.status);
  const reviewCount = job.failedCount + job.skippedCount;
  const canRetryReview = isTerminal && reviewCount > 0;
  const Icon = job.status === "SUCCEEDED" ? CheckCircle2 : job.status === "FAILED" || job.status === "PARTIAL" ? TriangleAlert : LoaderCircle;
  async function retryReview() {
    if (!job || retrying || !canRetryReview) return;
    setRetrying(true);
    setLoadError("");
    if (!retryKeyRef.current) retryKeyRef.current = window.crypto.randomUUID();
    try {
      const response = await fetch(`/api/admin/homeowners/activation-jobs/${encodeURIComponent(job.id)}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: retryKeyRef.current }),
      });
      const payload = await response.json() as { jobId?: string; error?: string };
      if (!response.ok || !payload.jobId) throw new Error(payload.error || "Activation records requiring review could not be retried.");
      window.location.href = `/admin/homeowners?activationJob=${encodeURIComponent(payload.jobId)}&success=bulkActivationRetry&message=${encodeURIComponent(`Retry queued for ${reviewCount} skipped or failed activation record${reviewCount === 1 ? "" : "s"}.`)}`;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Activation records requiring review could not be retried.");
      setRetrying(false);
    }
  }

  return <section className="mb-5 rounded-xl border bg-white p-4" aria-live="polite">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-slate-400">Homeowner activation bulk job</p>
        <p className="mt-1 flex items-center gap-2 font-black text-pine-800"><Icon className={`size-4 ${isTerminal ? "" : "animate-spin"}`} /> {statusLabel(job.status)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canRetryReview && <button type="button" className="btn-secondary min-h-10 px-4" disabled={retrying} onClick={retryReview}>
          {retrying ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <RotateCcw className="size-4" />}
          {retrying ? "Starting retry..." : `Retry ${reviewCount.toLocaleString("en-PH")} review item${reviewCount === 1 ? "" : "s"}`}
        </button>}
        <p className="text-2xl font-black text-pine-800">{percent}%</p>
      </div>
    </div>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className="h-full rounded-full bg-pine-600 transition-[width]" style={{ width: `${percent}%` }} />
    </div>
    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Processed" value={`${job.processedCount.toLocaleString("en-PH")} / ${job.totalTargets.toLocaleString("en-PH")}`} />
      <Metric label="Provider accepted" value={job.acceptedCount.toLocaleString("en-PH")} />
      <Metric label="Queued" value={job.queuedCount.toLocaleString("en-PH")} />
      <Metric label="Skipped" value={job.skippedCount.toLocaleString("en-PH")} />
      <Metric label="Failed / review" value={job.failedCount.toLocaleString("en-PH")} />
    </div>
    <p className="mt-3 text-xs font-semibold text-slate-500">Provider accepted means the configured mail provider accepted the message; it does not claim mailbox delivery unless delivery webhooks confirm it. Retry creates a new job containing skipped or failed records only; provider-accepted recipients are never resubmitted by this control.</p>
    {job.lastError && <p className="mt-2 text-xs font-semibold text-rose-700">{job.lastError}</p>}
    {loadError && <p className="mt-2 text-xs font-semibold text-amber-700">Progress refresh warning: {loadError}</p>}
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-2"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="font-black text-slate-700">{value}</p></div>;
}

function statusLabel(status: string) {
  if (status === "QUEUED") return "Queued";
  if (status === "RUNNING") return "Sending in safe batches";
  if (status === "SUCCEEDED") return "Completed";
  if (status === "PARTIAL") return "Completed with items requiring review";
  if (status === "FAILED") return "Failed";
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}
