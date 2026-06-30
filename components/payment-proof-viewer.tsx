"use client";

import { FileText, ImageOff, Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function PaymentProofViewer({ src, alt, contentType, fileName }: { src: string; alt: string; contentType?: string | null; fileName?: string | null }) {
  const [zoom, setZoom] = useState(100);
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const pdf = contentType === "application/pdf" || src.toLowerCase().endsWith(".pdf");
  useEffect(() => {
    setFailed(false);
    const image = imageRef.current;
    if (!pdf && image?.complete && image.naturalWidth === 0) setFailed(true);
  }, [pdf, src]);
  if (pdf) return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"><div className="flex items-center gap-3 border-b border-slate-200 bg-white p-4"><FileText className="size-7 text-rose-600" /><div><p className="font-black">PDF proof of payment</p><p className="break-all text-sm text-slate-500">{fileName || "proof-of-payment.pdf"}</p></div></div><iframe src={src} title={alt} className="h-[70dvh] min-h-[480px] w-full bg-white" /></div>;
  if (failed) return <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500"><div><ImageOff className="mx-auto size-10" /><p className="mt-2 font-bold">Proof image could not be loaded.</p></div></div>;
  return <div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-2 text-sm">
      <span className="font-bold text-slate-600">Zoom: {zoom}%</span>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary min-h-8 px-3 py-1 text-xs" type="button" onClick={() => setZoom((value) => Math.max(50, value - 25))}><Minus className="size-3" /> Out</button>
        <button className="btn-secondary min-h-8 px-3 py-1 text-xs" type="button" onClick={() => setZoom(100)}><RotateCcw className="size-3" /> Reset</button>
        <button className="btn-secondary min-h-8 px-3 py-1 text-xs" type="button" onClick={() => setZoom((value) => Math.min(250, value + 25))}><Plus className="size-3" /> In</button>
      </div>
    </div>
    <div className="max-h-[720px] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <img ref={imageRef} src={src} alt={alt} className="mx-auto max-w-none rounded-xl object-contain transition-all" style={{ width: `${zoom}%` }} onError={() => setFailed(true)} />
    </div>
  </div>;
}
