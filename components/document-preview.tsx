"use client";

import Link from "next/link";
import { ArrowLeft, Download, Maximize2, Minus, Plus, Printer } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

const MIN_SCALE = 0.25;
const MAX_SCALE = 1.5;
const ZOOM_STEP = 0.1;

export function DocumentPreview({ children, backHref, downloadHref }: { children: React.ReactNode; backHref: string; downloadHref: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const fitModeRef = useRef(true);
  const [scale, setScale] = useState(1);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [fitMode, setFitMode] = useState(true);

  const fitToScreen = useCallback(() => {
    const viewport = viewportRef.current;
    const page = pageRef.current;
    if (!viewport || !page) return;
    const width = page.offsetWidth;
    const height = page.offsetHeight;
    const availableWidth = Math.max(1, viewport.clientWidth - 24);
    setPageSize({ width, height });
    setScale(Math.min(1, availableWidth / width));
  }, []);

  useLayoutEffect(() => {
    fitToScreen();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (fitModeRef.current) fitToScreen();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitToScreen]);

  function changeZoom(delta: number) {
    fitModeRef.current = false;
    setFitMode(false);
    setScale((current) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number((current + delta).toFixed(2)))));
  }

  function resetFit() {
    fitModeRef.current = true;
    setFitMode(true);
    fitToScreen();
  }

  return <main className="document-preview-page">
    <nav className="document-preview-toolbar print-hidden" aria-label="Document preview actions">
      <Link className="document-preview-action" href={backHref}><ArrowLeft className="size-4" />Back</Link>
      <div className="document-preview-zoom" aria-label="Preview zoom controls">
        <button type="button" onClick={() => changeZoom(-ZOOM_STEP)} disabled={scale <= MIN_SCALE} aria-label="Zoom out"><Minus className="size-4" /></button>
        <output aria-live="polite">{Math.round(scale * 100)}%</output>
        <button type="button" onClick={() => changeZoom(ZOOM_STEP)} disabled={scale >= MAX_SCALE} aria-label="Zoom in"><Plus className="size-4" /></button>
        <button type="button" className={fitMode ? "is-active" : ""} onClick={resetFit}><Maximize2 className="size-4" />Fit</button>
      </div>
      <a className="document-preview-action" href={downloadHref}><Download className="size-4" />Download PDF</a>
      <button type="button" className="document-preview-action document-preview-print" onClick={() => window.print()}><Printer className="size-4" />Print</button>
    </nav>
    <div className="document-preview-viewport" ref={viewportRef}>
      <div className="document-preview-stage" style={pageSize.width ? { width: `${pageSize.width * scale}px`, height: `${pageSize.height * scale}px` } : undefined}>
        <div className="official-document-page" ref={pageRef} style={{ transform: `scale(${scale})` }}>{children}</div>
      </div>
    </div>
  </main>;
}
