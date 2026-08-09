import { formatRepositoryStorage, type RepositoryQuotaState } from "@/lib/document-repository/quota";

const stateLabel: Record<RepositoryQuotaState, string> = {
  UNLIMITED: "No configured limit",
  HEALTHY: "Storage available",
  WARNING: "Storage is nearing the plan limit",
  CRITICAL: "Storage is close to the plan limit",
  AT_LIMIT: "Storage limit reached",
  OVER_LIMIT: "Storage is over the plan limit",
};

export function RepositoryStorageMeter({
  usedBytes,
  limitBytes,
  state,
}: {
  usedBytes: bigint;
  limitBytes: bigint | null;
  state: RepositoryQuotaState;
}) {
  const percentage = limitBytes && limitBytes > 0n
    ? Math.min(100, Math.max(0, Math.round((Number(usedBytes) / Number(limitBytes)) * 100)))
    : null;
  const warning = state === "WARNING" || state === "CRITICAL" || state === "AT_LIMIT" || state === "OVER_LIMIT";

  return <section className="card h-full" aria-label="Document Management storage usage">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Storage</p>
        <p className="mt-1 text-2xl font-black text-ink">{formatRepositoryStorage(usedBytes)}</p>
        <p className="mt-1 text-sm text-slate-500">
          {limitBytes === null ? "Document repository usage" : `of ${formatRepositoryStorage(limitBytes)} plan storage`}
        </p>
      </div>
      {percentage !== null && <span className={`rounded-full border px-2.5 py-1 text-xs font-extrabold ${warning ? "border-amber-200 bg-amber-50 text-amber-800" : "border-pine-100 bg-pine-50 text-pine-800"}`}>{percentage}%</span>}
    </div>

    {percentage !== null && <div className="mt-4">
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} aria-label="Document storage utilization">
        <div className={`h-full rounded-full transition-[width] ${warning ? "bg-amber-500" : "bg-pine-600"}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>}

    <p className={`mt-3 text-xs font-bold ${warning ? "text-amber-800" : "text-slate-500"}`}>{stateLabel[state]}</p>
  </section>;
}
