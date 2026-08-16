"use client";

import { Camera, LoaderCircle, Trash2, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 5 * 1024 * 1024;

export function ProfilePhotoUploader({ name, initialVersion }: { name: string; initialVersion: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(initialVersion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const hasPhoto = Boolean(version) && !imageFailed;

  async function upload(file: File) {
    setError("");
    if (!allowedTypes.has(file.type)) {
      setError("Use JPG, PNG, or WebP.");
      return;
    }
    if (file.size > maxBytes) {
      setError("Photo must be 5MB or smaller.");
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/profile/photo", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to upload photo.");
      setImageFailed(false);
      setVersion(result.version || new Date().toISOString());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload photo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removePhoto() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/profile/photo", { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to remove photo.");
      setVersion(null);
      setImageFailed(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-label="Choose profile photo"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="group relative grid size-20 place-items-center overflow-hidden rounded-full bg-pine-50 text-pine-700 ring-2 ring-white shadow-md transition active:scale-95 disabled:opacity-60"
        aria-label={hasPhoto ? "Change profile photo" : "Add profile photo"}
      >
        {hasPhoto ? (
          // Authenticated profile photos are intentionally served through an API route, so next/image optimization is not used.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/profile/photo?v=${encodeURIComponent(version || "")}`}
            alt={`${name} profile`}
            className="size-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <UserRound className="size-9" aria-hidden="true" />
        )}
        <span className="absolute bottom-0 right-0 grid size-7 place-items-center rounded-full bg-[#0A7CFF] text-white ring-2 ring-white">
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Camera className="size-4" aria-hidden="true" />}
        </span>
      </button>
      <div className="flex items-center gap-2 text-xs font-bold">
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="text-pine-700 disabled:opacity-50">
          {hasPhoto ? "Change photo" : "Add photo"}
        </button>
        {hasPhoto && (
          <button type="button" disabled={busy} onClick={() => void removePhoto()} className="inline-flex items-center gap-1 text-rose-600 disabled:opacity-50">
            <Trash2 className="size-3.5" aria-hidden="true" /> Remove
          </button>
        )}
      </div>
      {error && <p className="max-w-40 text-center text-xs font-semibold text-rose-600" role="alert">{error}</p>}
    </div>
  );
}
