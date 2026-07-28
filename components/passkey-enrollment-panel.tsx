"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint } from "lucide-react";
import { useState } from "react";

export function PasskeyEnrollmentPanel({ passkeyCount }: { passkeyCount: number }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function enroll() {
    setPending(true);
    setMessage("");
    try {
      const optionsResponse = await fetch("/api/auth/passkeys/register/options", { method: "POST" });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error || "Could not start passkey registration.");
      const response = await startRegistration({ optionsJSON: options });
      const verifyResponse = await fetch("/api/auth/passkeys/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response, deviceName: navigator.platform || "Passkey" }),
      });
      const result = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(result.error || "Passkey registration failed.");
      setMessage("Passkey enrolled successfully.");
      window.setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passkey registration failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400"><Fingerprint className="size-4" />Passkeys</p>
      <p className="break-words font-bold">{passkeyCount ? `${passkeyCount} enrolled` : "Not enrolled"}</p>
      <button className="btn-secondary mt-3 min-h-10 w-full" type="button" onClick={enroll} disabled={pending}>
        <Fingerprint className="size-4" /> {pending ? "Opening passkey..." : "Enroll passkey"}
      </button>
      {message && <p className="mt-2 text-sm font-semibold text-slate-600">{message}</p>}
    </div>
  );
}
