"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint } from "lucide-react";
import type { RefObject } from "react";
import { useState } from "react";
import { LOGIN_HANDOFF_STORAGE_KEY } from "@/components/post-login-brand-orbit";
import { safeReturnTo } from "@/lib/auth-return-to";

export function PasskeyLoginButton({ formRef }: { formRef: RefObject<HTMLFormElement | null> }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function loginWithPasskey() {
    setPending(true);
    setMessage("");
    try {
      const form = formRef.current;
      const data = new FormData(form ?? undefined);
      const identifier = String(data.get("identifier") || "").trim();
      const tenantSlug = String(data.get("tenantSlug") || "").trim();
      const returnTo = safeReturnTo(String(data.get("returnTo") || ""));
      const optionsResponse = await fetch("/api/auth/passkeys/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, tenantSlug }),
      });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error || "Could not start passkey login.");
      const response = await startAuthentication({ optionsJSON: options });
      const verifyResponse = await fetch("/api/auth/passkeys/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      const result = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(result.error || "Passkey login failed.");
      try {
        window.sessionStorage.setItem(LOGIN_HANDOFF_STORAGE_KEY, String(Date.now()));
      } catch { /* Storage restrictions must never block authenticated navigation. */ }
      window.location.replace(returnTo || result.redirectTo || "/portal/dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passkey login failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button className="community-pulse-passkey btn-secondary min-h-12 w-full" type="button" onClick={loginWithPasskey} disabled={pending}>
        <Fingerprint className="size-4" /> {pending ? "Checking passkey..." : "Sign in with passkey"}
      </button>
      {message && <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</p>}
    </>
  );
}
