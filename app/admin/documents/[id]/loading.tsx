export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading document request details">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-3 w-32 animate-pulse rounded-full bg-slate-100" />
            <div className="h-8 max-w-xl animate-pulse rounded-2xl bg-slate-100" />
            <div className="h-4 max-w-md animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="h-10 w-32 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-10 w-24 animate-pulse rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-3 w-20 animate-pulse rounded-full bg-slate-100" />
            <div className="mt-3 h-6 w-28 animate-pulse rounded-xl bg-slate-100" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="h-6 w-56 animate-pulse rounded-xl bg-slate-100" />
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 9 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded-full bg-slate-100" />
                  <div className="h-5 w-full animate-pulse rounded-lg bg-slate-100" />
                </div>
              ))}
            </div>
          </div>
          <div className="h-72 animate-pulse rounded-3xl border border-slate-200 bg-slate-50" />
        </div>
        <div className="space-y-6">
          <div className="h-56 animate-pulse rounded-3xl border border-slate-200 bg-slate-50" />
          <div className="h-72 animate-pulse rounded-3xl border border-slate-200 bg-slate-50" />
        </div>
      </div>

      <p className="text-center text-sm text-slate-500">Loading document request details...</p>
    </div>
  );
}
