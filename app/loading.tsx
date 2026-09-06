import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return <div className="grid min-h-[35vh] place-items-center px-4" role="status" aria-live="polite" aria-atomic="true">
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-700 shadow-lg">
      <LoaderCircle className="size-5 animate-spin text-sky-600 motion-reduce:animate-none" aria-hidden="true" />
      <span>Loading HOAHub…</span>
    </div>
  </div>;
}
