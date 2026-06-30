"use client";

import { ImageIcon, PenLine, X } from "lucide-react";
import { useEffect, useState } from "react";

const allowed = ["image/jpeg", "image/png", "image/webp"];
const maxBytes = 5 * 1024 * 1024;

export function OrganizationImageUpload({ kind, currentUrl }: { kind: "photo" | "signature"; currentUrl?: string | null }) {
  const [preview, setPreview] = useState(currentUrl || "");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [remove, setRemove] = useState(false);
  const label = kind === "photo" ? "Profile photo" : "Electronic signature";
  useEffect(() => () => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);
  function select(file?: File) {
    setError("");
    if (!file) { setName(""); setPreview(remove ? "" : currentUrl || ""); return; }
    if (!allowed.includes(file.type)) { setError("Select a JPG, JPEG, PNG, or WEBP image."); setName(""); return; }
    if (file.size > maxBytes) { setError("Image must not exceed 5MB."); setName(""); return; }
    setRemove(false); setName(file.name); setPreview(URL.createObjectURL(file));
  }
  return <div className="rounded-2xl border border-slate-200 p-3">
    <label className="label" htmlFor={`organization-${kind}`}>{label} (max 5MB)</label>
    <input id={`organization-${kind}`} className="field" type="file" name={kind} accept="image/jpeg,image/png,image/webp" onChange={(event) => select(event.target.files?.[0])} />
    {error && <p className="mt-2 rounded-xl bg-rose-50 p-2 text-xs font-bold text-rose-700">{error}</p>}{name && <p className="mt-2 text-xs font-bold text-blue-700">Ready to upload: {name}</p>}
    <div className={`mt-3 grid min-h-28 place-items-center overflow-hidden rounded-xl bg-slate-50 ${kind === "photo" ? "p-2" : "p-4"}`}>{preview && !remove ? <img src={preview} alt={`${label} preview`} className={kind === "photo" ? "size-28 rounded-full object-cover" : "max-h-24 max-w-full object-contain"} onError={() => { setPreview(""); setError("The current image cannot be displayed. Upload a replacement."); }} /> : <div className="text-center text-xs text-slate-400">{kind === "photo" ? <ImageIcon className="mx-auto mb-1 size-8" /> : <PenLine className="mx-auto mb-1 size-8" />}No {label.toLowerCase()} selected</div>}</div>
    {currentUrl && <label className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" name={kind === "photo" ? "removePhoto" : "removeSignature"} checked={remove} onChange={(event) => { setRemove(event.target.checked); setName(""); setPreview(event.target.checked ? "" : currentUrl); }} /><X className="size-4" /> Remove current {kind}</label>}
  </div>;
}
