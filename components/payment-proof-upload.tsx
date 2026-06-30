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
  const [error, setError] = useState("");

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function clear() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (inputRef.current) inputRef.current.value = "";
    setPreviewUrl(""); setFileName(""); setContentType(""); setError("");
  }

  function change(file?: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(""); setFileName(""); setContentType(""); setError("");
    if (!file) return;
    if (!allowedTypes.includes(file.type)) { if (inputRef.current) inputRef.current.value = ""; setError("Choose a JPG, JPEG, PNG, WEBP, or PDF file."); return; }
    if (file.size > maxBytes) { if (inputRef.current) inputRef.current.value = ""; setError("Proof of payment must not exceed 5MB."); return; }
    setFileName(file.name);
    setContentType(file.type);
    if (file.type.startsWith("image/")) setPreviewUrl(URL.createObjectURL(file));
  }

  return <div className="sm:col-span-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
    <label className="label flex items-center gap-2" htmlFor="proofFile"><Paperclip className="size-4" /> Proof of payment <span className="font-normal text-slate-400">(optional)</span></label>
    <input ref={inputRef} id="proofFile" className="field bg-white" name="proofFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => change(event.target.files?.[0])} />
    <p className="mt-2 text-xs text-slate-500">Accepted: JPG, JPEG, PNG, WEBP, PDF. Maximum 5MB. You may submit without an attachment.</p>
    {error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700" role="alert">{error}</p>}
    {fileName && <div className="relative mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {previewUrl ? <img src={previewUrl} alt="Proof of payment preview" className="mx-auto max-h-72 w-full object-contain" /> : <div className="flex items-center gap-3 p-5"><FileText className="size-8 text-rose-600" /><div><p className="font-black">PDF proof selected</p><p className="break-all text-sm text-slate-500">{fileName}</p></div></div>}
      <div className="flex items-center gap-2 border-t border-slate-100 p-3 text-xs font-bold text-slate-600">{previewUrl ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}<span className="min-w-0 flex-1 truncate">{fileName}</span><span>{contentType === "application/pdf" ? "PDF" : "Image"}</span><button type="button" className="rounded-lg p-1 hover:bg-slate-100" onClick={clear} aria-label="Remove proof attachment"><X className="size-4" /></button></div>
    </div>}
  </div>;
}
