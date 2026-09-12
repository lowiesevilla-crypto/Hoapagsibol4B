export default function EmailDeliveryLoading() {
  return <div className="animate-pulse" aria-busy="true" aria-label="Loading email delivery records">
    <div className="mb-6 h-24 rounded-3xl bg-slate-100" />
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 rounded-3xl bg-slate-100" />)}
    </div>
    <div className="mb-6 h-28 rounded-3xl bg-slate-100" />
    <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white">
      <div className="h-20 border-b border-slate-100 bg-slate-50" />
      <div className="h-16 border-b border-slate-100 bg-slate-50/60" />
      {Array.from({ length: 8 }, (_, index) => <div key={index} className="grid grid-cols-[48px_1fr_1.4fr_.5fr_1fr_1.2fr_.6fr] gap-4 border-b border-slate-100 px-5 py-5">
        {Array.from({ length: 7 }, (_, cell) => <div key={cell} className="h-4 rounded bg-slate-100" />)}
      </div>)}
    </div>
  </div>;
}
