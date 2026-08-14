"use client";

import Link from "next/link";
import { Mail, Share2, UploadCloud, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { saveAnnouncementAction } from "@/lib/actions/content";
import { ContentImage } from "@/components/content-image";

const allowedImageTypes = ["image/jpeg", "image/png"];
const maxImageBytes = 5 * 1024 * 1024;

type AnnouncementFormRecord = {
  id: string;
  title: string;
  content: string;
  type: string;
  status: string;
  imageUrl: string | null;
  sendEmail: boolean;
  postToFacebook: boolean;
  createdAt: string;
  createdByName: string;
} | null;

export function AnnouncementAdminForm({
  selected,
  announcementTypes,
  statuses,
}: {
  selected: AnnouncementFormRecord;
  announcementTypes: string[];
  statuses: string[];
}) {
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState(selected?.imageUrl ?? "");
  const [selectedFileName, setSelectedFileName] = useState("");

  useEffect(() => {
    setPreviewUrl(selected?.imageUrl ?? "");
    setSelectedFileName("");
    setError("");
  }, [selected?.id, selected?.imageUrl]);

  const datePosted = useMemo(() => selected ? shortDate(selected.createdAt) : "Generated when saved", [selected]);

  function validateForm(event: FormEvent<HTMLFormElement>) {
    setError("");
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") || "").trim();
    const content = String(new FormData(form).get("content") || "").trim();
    const image = form.elements.namedItem("image") as HTMLInputElement | null;
    const file = image?.files?.[0];

    if (!title) {
      event.preventDefault();
      setError("Title is required before saving an announcement.");
      return;
    }
    if (!content) {
      event.preventDefault();
      setError("Description / content is required before saving an announcement.");
      return;
    }
    if (file) {
      const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (![".jpg", ".jpeg", ".png"].includes(extension) || !allowedImageTypes.includes(file.type)) {
        event.preventDefault();
        setError("Upload a valid JPG, JPEG, or PNG announcement image.");
        return;
      }
      if (file.size > maxImageBytes) {
        event.preventDefault();
        setError("Announcement image must not exceed 5MB.");
      }
    }
  }

  function handleImageChange(file: File | undefined) {
    setError("");
    setSelectedFileName(file?.name ?? "");
    if (!file) {
      setPreviewUrl(selected?.imageUrl ?? "");
      return;
    }
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".jpg", ".jpeg", ".png"].includes(extension) || !allowedImageTypes.includes(file.type)) {
      setPreviewUrl(selected?.imageUrl ?? "");
      setError("Upload a valid JPG, JPEG, or PNG announcement image.");
      return;
    }
    if (file.size > maxImageBytes) {
      setPreviewUrl(selected?.imageUrl ?? "");
      setError("Announcement image must not exceed 5MB.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  }

  return <form action={saveAnnouncementAction} onSubmit={validateForm} className="card mb-6">
    {selected && <input type="hidden" name="id" value={selected.id} />}
    <input type="hidden" name="existingImageUrl" value={selected?.imageUrl ?? ""} />
    <div className="mb-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
      <div>
        <h2 className="text-lg font-black">{selected ? "Edit announcement" : "Create announcement"}</h2>
        <p className="text-sm text-slate-500">Draft and archived announcements are hidden from homeowner-facing pages. Published announcements appear in the homeowner portal.</p>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
        <p><span className="font-black text-slate-700">Date posted:</span> {datePosted}</p>
        <p><span className="font-black text-slate-700">Created by:</span> {selected?.createdByName ?? "Current admin after saving"}</p>
      </div>
    </div>

    {error && <p className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}

    <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
      <div className="grid gap-4">
        <div><label className="label">Title</label><input className="field" name="title" defaultValue={selected?.title ?? ""} required maxLength={150} /></div>
        <div><label className="label">Description / Content</label><textarea className="field min-h-40 resize-y" name="content" defaultValue={selected?.content ?? ""} required maxLength={5000} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Announcement Type</label><select className="field" name="type" defaultValue={selected?.type ?? "GENERAL"}>{announcementTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></div>
          <div><label className="label">Status</label><select className="field" name="status" defaultValue={selected?.status ?? "PUBLISHED"}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-600"><input type="checkbox" name="sendEmail" defaultChecked={selected?.sendEmail ?? false} className="size-4 accent-pine-600" /><Mail className="size-4" /> Email active homeowners {selected && "(new posts only)"}</label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-600"><input type="checkbox" name="postToFacebook" defaultChecked={selected?.postToFacebook ?? false} className="size-4 accent-pine-600" /><Share2 className="size-4" /> Post automatically to Facebook {selected && "(use retry below)"}</label>
        </div>
      </div>
      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4">
        <label className="label flex items-center gap-2"><UploadCloud className="size-4" /> Uploaded image or banner picture</label>
        <input className="field bg-white" name="image" type="file" accept=".jpg,.jpeg,.png" onChange={(event) => handleImageChange(event.target.files?.[0])} />
        <p className="mt-2 text-xs text-slate-500">Supported formats: JPG, JPEG, PNG. Maximum size: 5MB.</p>
        {selectedFileName && <p className="mt-2 rounded-xl bg-white p-2 text-xs font-bold text-slate-600">Ready to upload: {selectedFileName}</p>}
        {previewUrl && <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <ContentImage src={previewUrl} alt={selected?.title || "Announcement preview"} className="max-h-72 w-full object-contain" />
          {selected?.imageUrl && <label className="flex items-center gap-2 p-3 text-xs font-bold text-slate-600"><input type="checkbox" name="removeImage" className="accent-pine-600" /> Remove current image</label>}
        </div>}
        {!previewUrl && <div className="mt-4 grid h-44 place-items-center rounded-2xl border border-dashed border-slate-200 bg-white text-center text-sm text-slate-500">No announcement image selected.</div>}
      </div>
    </div>
    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <AnnouncementSubmitButton editing={Boolean(selected)} />
      {selected && <Link className="btn-secondary" href="/admin/announcements"><X className="size-4" /> Cancel</Link>}
    </div>
  </form>;
}

function AnnouncementSubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Saving and uploading..." : editing ? "Save changes" : "Create announcement"}</button>;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
