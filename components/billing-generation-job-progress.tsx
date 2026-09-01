"use client";

import { AlertTriangle, CheckCircle2, LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type BillingJob = {
  id: string;
  reference: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED";
  coverageYear: number;
  coverageMonth: number;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  percent: number;
  retryOfJobId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  canRetry: boolean;
};

const terminalStatuses = new Set<BillingJob["status"]>(["SUCCEEDED", "PARTIAL", "FAILED"]);

export function BillingGenerationJobProgress({ jobId, retryEnabled }: { jobId: string; retryEnabled: boolean }) {
  const router = useRouter();
  const [job, setJob] = useState<BillingJob | null>(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const refreshedJobRef = useRef("");
  const retryKeyRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let resumeTimer: ReturnType<typeof setInterval> | null = null;

    async function resume() {
      await fetch(`/api/admin/billing/jobs/${encodeURIComponent(jobId)}`, {
        method: "POST",
        cache: "no-store",
      }).catch(() => undefined);
    }

    async function load() {
      try {
        const response = await fetch(`/api/admin/billing/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
        const payload = await response.json() as BillingJob | { error?: string };
        if (!response.ok || !("status" in payload)) throw new Error("error" in payload && payload.error ? payload.error : "Billing progress could not be loaded.");
        if (cancelled) return;
        setJob(payload);
        setError("");
        if (terminalStatuses.has(payload.status)) {
          if (refreshedJobRef.current !== payload.id) {
            refreshedJobRef.current = payload.id;
            router.refresh();
          }
          return;
        }
        timer = setTimeout(load, 2_000);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Billing progress could not be loaded.");
        timer = setTimeout(load, 4_000);
      }
    }

    void resume();
    void load();
    resumeTimer = setInterval(() => void resume(), 15_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (resumeTimer) clearInterval(resumeTimer);
    };
  }, [jobId, router]);

  async function retryFailed() {
    if (!job || retrying || !retryEnabled) return;
    setRetrying(true);
    setError("");
    if (!retryKeyRef.current) retryKeyRef.current = window.crypto.randomUUID();
    try {
      const response = await fetch(`/api/admin/billing/jobs/${encodeURIComponent(job.id)}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: retryKeyRef.current }),
      });
      const payload = await response.json() as { jobId?: string; error?: string };
      if (!response.ok || !payload.jobId) throw new Error(payload.error || "Failed records could not be retried.");
      router.push(`/admin/billing?billingJob=${encodeURIComponent(payload.jobId)}`);
      router.refresh();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Failed records could not be retried.");
      setRetrying(false);
    }
  }

  if (!job) {
    return <section className="card mb-6" aria-live="polite">
      <div className="flex items-center gap-3 text-sm font-semibold text-slate-600"><LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" /> Loading billing job progress…</div>
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{error}</p>}
    </section>;
  }

  const terminal = terminalStatuses.has(job.status);
  const month = new Date(Date.UTC(job.coverageYear, job.coverageMonth - 1, 1)).toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
  return <section className="card mb-6" aria-labelledby="billing-job-title">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-pine-700">Durable billing job</p>
        <h2 id="billing-job-title" className="mt-1 text-lg font-black">{job.reference}</h2>
        <p className="mt-1 text-sm text-slate-500">{month} · Progress is stored in the tenant database and can be reopened after refresh or navigation.</p>
      </div>
      <div className="flex items-center gap-2 text-sm font-black">
        {terminal ? job.status === "SUCCEEDED" ? <CheckCircle2 className="size-5 text-emerald-600" /> : <AlertTriangle className="size-5 text-amber-600" /> : <LoaderCircle className="size-5 animate-spin text-pine-700 motion-reduce:animate-none" />}
        {statusLabel(job.status)}
      </div>
    </div>

    <div className="mt-5" aria-live="polite">
      <div className="mb-2 flex items-center justify-between gap-4 text-sm font-bold"><span>{job.completed.toLocaleString()} of {job.total.toLocaleString()} records completed</span><span>{job.percent}%</span></div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Billing generation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.percent}>
        <div className="h-full rounded-full bg-pine-700 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${job.percent}%` }} />
      </div>
    </div>

    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <ProgressStat label="Succeeded" value={job.succeeded} />
      <ProgressStat label="Failed" value={job.failed} />
      <ProgressStat label="Skipped after preview" value={job.skipped} />
      <ProgressStat label="Total target records" value={job.total} />
    </div>

    {job.lastError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{job.lastError}</p>}
    {error && <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{error}</p>}

    {job.canRetry && <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-500">Retry creates a new job containing only the failed homeowner records. Successful and skipped records are not submitted again.</p>
      <button type="button" className="btn-secondary min-h-10 shrink-0 px-4" disabled={retrying || !retryEnabled} onClick={retryFailed}>
        {retrying ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <RotateCcw className="size-4" />}
        {retryEnabled ? retrying ? "Starting retry…" : `Retry ${job.failed.toLocaleString()} failed` : "Retry disabled by rollout"}
      </button>
    </div>}
  </section>;
}

function ProgressStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-slate-900">{value.toLocaleString()}</p></div>;
}

function statusLabel(status: BillingJob["status"]) {
  if (status === "QUEUED") return "Queued";
  if (status === "RUNNING") return "Processing";
  if (status === "SUCCEEDED") return "Completed";
  if (status === "PARTIAL") return "Completed with failures";
  return "Failed";
}
