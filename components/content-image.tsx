"use client";

import { ImageOff, Maximize2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ContentImage({ src, alt, className = "h-52 w-full object-contain", fallbackText = "Image unavailable" }: { src: string | null | undefined; alt: string; className?: string; fallbackText?: string }) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setFailed(false);
    setOpen(false);
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setFailed(true);
  }, [src]);
  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);
  if (!src || failed) return <div className="grid min-h-36 place-items-center bg-gradient-to-br from-slate-100 to-slate-200 p-6 text-center text-slate-500"><div><ImageOff className="mx-auto size-9" /><p className="mt-2 text-sm font-bold">{fallbackText}</p></div></div>;
  return <>
    <button type="button" className="group relative block w-full overflow-hidden bg-slate-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20" onClick={() => setOpen(true)} aria-label={`View full image: ${alt}`}>
      <img ref={imageRef} src={src} alt={alt} className={className} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-3 py-1.5 text-xs font-bold text-white opacity-90 transition group-hover:opacity-100"><Maximize2 className="size-3" /> View full image</span>
    </button>
    {open && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/85 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Full image: ${alt}`} onClick={() => setOpen(false)}>
      <button ref={closeButtonRef} type="button" className="absolute right-3 top-3 rounded-full bg-white p-2 text-slate-800 shadow-xl focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/40 sm:right-6 sm:top-6" onClick={() => setOpen(false)} aria-label="Close full image"><X className="size-5" /></button>
      <img src={src} alt={alt} className="max-h-[92dvh] max-w-[96vw] object-contain" loading="eager" decoding="async" onClick={(event) => event.stopPropagation()} onError={() => { setFailed(true); setOpen(false); }} />
    </div>}
  </>;
}
