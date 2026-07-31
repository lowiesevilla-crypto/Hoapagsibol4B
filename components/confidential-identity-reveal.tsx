"use client";

import { useState } from "react";

type RevealResult = {
  publicReference: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  propertyAddress: string | null;
  block: string | null;
  lot: string | null;
  revealedAt: string;
  expiresAt: string | null;
};

export function ConfidentialIdentityReveal({ complaintId }: { complaintId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [identity, setIdentity] = useState<RevealResult | null>(null);

  async function reveal(formData: FormData) {
    setPending(true);
    setError("");
    setIdentity(null);
    try {
      const response = await fetch(`/admin/complaints/${complaintId}/identity/reveal`, { method: "POST", body: formData, cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Confidential identity could not be revealed.");
      setIdentity(payload.identity);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Confidential identity could not be revealed.");
    } finally {
      setPending(false);
    }
  }

  return <form action={reveal} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
    <input type="hidden" name="id" value={complaintId} />
    <textarea className="field min-h-20" name="reason" placeholder="Business reason for identity reveal" required />
    <label className="flex items-start gap-2 text-sm font-bold"><input className="mt-1" type="checkbox" name="confirmReveal" required /> Confirm this reveal is necessary and will be audited.</label>
    <button type="submit" className="btn-danger w-full" disabled={pending}>{pending ? "Revealing..." : "Reveal confidential identity"}</button>
    {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</p>}
    {identity && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
      <p className="font-black">Identity revealed for {identity.publicReference}</p>
      <p className="mt-2"><b>Name:</b> {identity.displayName || "Not provided"}</p>
      <p><b>Email:</b> {identity.email || "Not provided"}</p>
      <p><b>Phone:</b> {identity.phone || "Not provided"}</p>
      <p><b>Property:</b> {[identity.propertyAddress, identity.block && `Block ${identity.block}`, identity.lot && `Lot ${identity.lot}`].filter(Boolean).join(" | ") || "Not provided"}</p>
      <p className="mt-2 text-xs font-bold text-amber-900">This result is shown only in this browser interaction and is audited.</p>
    </div>}
  </form>;
}
