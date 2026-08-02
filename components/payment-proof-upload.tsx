"use client";

import { FileText, ImageIcon, Paperclip, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const maxBytes = 5 * 1024 * 1024;

export function PaymentProofUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [contentType, setContentType] = useState("");
  const [fileSizeLabel, setFileSizeLabel] = useState("");
  const [error, setError] = useState("");

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function clear() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (inputRef.current) inputRef.current.value = "";
    setPreviewUrl(""); setFileName(""); setContentType(""); setFileSizeLabel(""); setError("");
  }

  function change(file?: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(""); setFileName(""); setContentType(""); setFileSizeLabel(""); setError("");
    if (!file) return;
    if (!allowedTypes.includes(file.type)) { if (inputRef.current) inputRef.current.value = ""; setError("Choose a JPG, JPEG, PNG, WEBP, or PDF file."); return; }
    if (file.size > maxBytes) { if (inputRef.current) inputRef.current.value = ""; setError("Proof of payment must not exceed 5MB."); return; }
    setFileName(file.name);
    setContentType(file.type);
    setFileSizeLabel(formatFileSize(file.size));
    if (file.type.startsWith("image/")) setPreviewUrl(URL.createObjectURL(file));
  }

  return <div className="sm:col-span-2 rounded-3xl border border-dashed border-pine-200 bg-pine-50/50 p-4">
    <label className="label flex items-center gap-2" htmlFor="proofFile"><Paperclip className="size-4" /> Proof of payment <span className="font-normal text-slate-400">(optional)</span></label>
    <label htmlFor="proofFile" className="mt-2 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border border-pine-100 bg-white p-4 text-center shadow-sm transition hover:border-pine-300 focus-within:outline focus-within:outline-4 focus-within:outline-pine-500/20">
      <Paperclip className="size-7 text-pine-700" aria-hidden="true" />
      <span className="mt-2 text-sm font-black text-ink">{fileName ? "Replace proof" : "Choose photo, camera capture, PDF, or screenshot"}</span>
      <span className="mt-1 text-xs font-semibold text-slate-500">JPG, PNG, WEBP, or PDF up to 5MB</span>
      <input ref={inputRef} id="proofFile" className="sr-only" name="proofFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => change(event.target.files?.[0])} />
    </label>
    <p className="mt-2 text-xs text-slate-500">The file is uploaded only when you submit the payment request. Storage paths are never shown.</p>
    {error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700" role="alert">{error}</p>}
    {fileName && <div className="relative mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {previewUrl ? <img src={previewUrl} alt="Proof of payment preview" className="mx-auto max-h-72 w-full object-contain" /> : <div className="flex items-center gap-3 p-5"><FileText className="size-8 text-rose-600" /><div><p className="font-black">PDF proof selected</p><p className="break-all text-sm text-slate-500">{fileName}</p></div></div>}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-3 text-xs font-bold text-slate-600">{previewUrl ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}<span className="min-w-0 flex-1 truncate">{fileName}</span><span>{contentType === "application/pdf" ? "PDF" : "Image"}</span><span>{fileSizeLabel}</span><button type="button" className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 hover:bg-slate-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20" onClick={clear} aria-label="Remove proof attachment"><X className="size-4" /> Remove</button></div>
    </div>}
  </div>;
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
