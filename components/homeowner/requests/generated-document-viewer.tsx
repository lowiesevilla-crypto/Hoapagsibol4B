"use client";

import { Download, Maximize2, Minus, Plus, Printer, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import Link from "next/link";

export function GeneratedDocumentViewer({ html, title, documentNumber, printHref, pdfHref, htmlHref, canDownload }: { html: string; title: string; documentNumber: string; printHref: string; pdfHref: string; htmlHref: string; canDownload: boolean }) {
  const [zoom, setZoom] = useState(100);
  const scaled = useMemo(() => ({ transform: `scale(${zoom / 100})`, transformOrigin: "top center", height: `${100 / (zoom / 100)}%` }), [zoom]);
  async function share() {
    if (!navigator.share) return;
    await navigator.share({ title, text: documentNumber, url: window.location.href }).catch(() => undefined);
  }
  return (
    <section className="rounded-3xl border border-pine-100 bg-white p-3 shadow-soft sm:p-5">
      <div className="print-hidden mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-h-11 items-center gap-2 rounded-2xl bg-pine-50 px-3 text-sm font-black text-pine-900">
          <Maximize2 className="size-4" aria-hidden="true" />
          {zoom}%
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary min-h-11 px-3" onClick={() => setZoom((value) => Math.max(70, value - 10))} aria-label="Zoom out"><Minus className="size-4" /></button>
          <button type="button" className="btn-secondary min-h-11 px-3" onClick={() => setZoom((value) => Math.min(130, value + 10))} aria-label="Zoom in"><Plus className="size-4" /></button>
          {canDownload && <Link className="btn-secondary min-h-11 px-3" href={printHref}><Printer className="size-4" /> Print</Link>}
          {canDownload && <a className="btn-primary min-h-11 px-3" href={pdfHref}><Download className="size-4" /> PDF</a>}
          {canDownload && <a className="btn-secondary min-h-11 px-3 max-sm:hidden" href={htmlHref}><Download className="size-4" /> HTML</a>}
          <button type="button" className="btn-secondary min-h-11 px-3" onClick={share}><Share2 className="size-4" /> Share</button>
        </div>
      </div>
      <div className="overflow-auto rounded-2xl border border-slate-200 bg-slate-100 p-2 sm:p-4">
        <div className="mx-auto min-w-[320px] max-w-[960px]" style={scaled}>
          <iframe title={`Official rendered document ${documentNumber}`} className="h-[72vh] min-h-[520px] w-full bg-white shadow-sm sm:min-h-[720px]" sandbox="" srcDoc={html} />
        </div>
      </div>
    </section>
  );
}
