"use client";

import { QrCode, UploadCloud, X } from "lucide-react";
import { useEffect, useState } from "react";

const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
const gcashQrFileField = "GCASH_QR_IMAGE_FILE";
const gcashQrRemoveField = "GCASH_QR_IMAGE_REMOVE";
const maxGcashQrBytes = 5 * 1024 * 1024;

export function GcashQrUpload({ currentUrl }: { currentUrl: string }) {
  const [previewUrl, setPreviewUrl] = useState(currentUrl);
  const [selectedName, setSelectedName] = useState("");
  const [removeCurrent, setRemoveCurrent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function selectFile(file?: File) {
    setError("");
    if (!file) {
      setSelectedName("");
      setPreviewUrl(removeCurrent ? "" : currentUrl);
      return;
    }
    if (!allowedTypes.includes(file.type)) {
      setError("Select a JPG, JPEG, PNG, or WEBP image.");
      setSelectedName("");
      return;
    }
    if (file.size > maxGcashQrBytes) {
      setError("GCash QR image must not exceed 5MB.");
      setSelectedName("");
      return;
    }
    setRemoveCurrent(false);
    setSelectedName(file.name);
    setPreviewUrl(URL.createObjectURL(file));
  }

  return <div>
    <label className="label flex items-center gap-2" htmlFor={gcashQrFileField}><UploadCloud className="size-4" /> GCash QR image upload</label>
    <input id={gcashQrFileField} className="field bg-white" name={gcashQrFileField} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectFile(event.target.files?.[0])} />
    <p className="mt-1 text-xs text-slate-500">Upload JPG, JPEG, PNG, or WEBP. Maximum size: 5MB. The QR is stored by the application; no image URL is required.</p>
    {error && <p className="mt-2 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
    {selectedName && <p className="mt-2 rounded-xl bg-blue-50 p-3 text-xs font-bold text-blue-700">Ready to upload: {selectedName}</p>}

    <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3">
      {previewUrl && !removeCurrent ? <img src={previewUrl} alt="GCash QR preview" className="mx-auto aspect-square max-h-80 w-full max-w-80 object-contain" /> : <div className="grid min-h-52 place-items-center text-center text-sm text-slate-500"><div><QrCode className="mx-auto mb-2 size-10 text-slate-300" />No GCash QR image configured.</div></div>}
    </div>

    {currentUrl && <label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-bold text-slate-600">
      <input type="checkbox" name={gcashQrRemoveField} checked={removeCurrent} onChange={(event) => { setRemoveCurrent(event.target.checked); if (event.target.checked) { setPreviewUrl(""); setSelectedName(""); } else setPreviewUrl(currentUrl); }} className="size-4 accent-rose-600" />
      <X className="size-4" /> Remove current QR image
    </label>}
  </div>;
}
