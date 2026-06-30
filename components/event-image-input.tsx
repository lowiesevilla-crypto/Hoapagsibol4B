"use client";

import { UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";
import { ContentImage } from "@/components/content-image";

const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
const maxBytes = 5 * 1024 * 1024;

export function EventImageInput({ currentImage, title }: { currentImage?: string | null; title: string }) {
  const [preview, setPreview] = useState(currentImage ?? "");
  const [error, setError] = useState("");
  useEffect(() => () => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);
  function change(file?: File) {
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setError("");
    if (!file) { setPreview(currentImage ?? ""); return; }
    if (!allowedTypes.includes(file.type)) { setPreview(currentImage ?? ""); setError("Choose a JPG, JPEG, PNG, or WEBP image."); return; }
    if (file.size > maxBytes) { setPreview(currentImage ?? ""); setError("Event image must not exceed 5MB."); return; }
    setPreview(URL.createObjectURL(file));
  }
  return <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4">
    <label className="label flex items-center gap-2"><UploadCloud className="size-4" /> Uploaded image or banner picture</label>
    <input className="field bg-white" name="image" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => change(event.target.files?.[0])} />
    <p className="mt-2 text-xs text-slate-500">Supported formats: JPG, JPEG, PNG, WEBP. Maximum size: 5MB.</p>
    {error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <ContentImage src={preview} alt={title || "Event image preview"} className="max-h-72 w-full object-contain" fallbackText="No event image selected" />
      {currentImage && <label className="flex items-center gap-2 border-t border-slate-100 p-3 text-xs font-bold text-slate-600"><input type="checkbox" name="removeImage" className="accent-pine-600" /> Remove current image</label>}
    </div>
  </div>;
}
