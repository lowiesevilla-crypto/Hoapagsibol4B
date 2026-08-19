"use client";

import { FormEvent, useState } from "react";
import { LogOut } from "lucide-react";

type LogoutButtonProps = {
  allSessions?: boolean;
  className?: string;
  formClassName?: string;
  label?: string;
  onClick?: () => void;
};

type LogoutNavigationResponse = {
  redirectTo?: unknown;
};

function safeLogoutDestination(destinationValue: string) {
  try {
    const destination = new URL(destinationValue, window.location.origin);
    if (destination.origin !== window.location.origin) return "/login?loggedOut=1";
    if (destination.pathname === "/login" || destination.pathname.endsWith("/login")) {
      return `${destination.pathname}${destination.search}${destination.hash}`;
    }
  } catch {
    // Fall through to the universal safe login surface.
  }
  return "/login?loggedOut=1";
}

export function LogoutButton({ allSessions = false, className = "btn-secondary w-full", formClassName, label, onClick }: LogoutButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submitLogout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");

    try {
      const form = event.currentTarget;
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        credentials: "same-origin",
        redirect: "manual",
        headers: {
          Accept: "application/json",
          "X-HOA-Logout-Navigation": "fetch",
        },
      });
      if (!response.ok) throw new Error("Logout request failed");

      const result = await response.json() as LogoutNavigationResponse;
      if (typeof result.redirectTo !== "string") throw new Error("Logout redirect was not returned");

      // The server has already revoked/deleted the signed session and completed the
      // cookie-clearing response. Replace the current protected history entry only
      // after that response is complete so Back cannot revive it as the current page.
      window.location.replace(safeLogoutDestination(result.redirectTo));
    } catch {
      setPending(false);
      setError("We couldn't sign you out. Please try again.");
    }
  }

  return (
    <form
      action="/api/auth/logout"
      method="post"
      className={formClassName}
      onSubmit={submitLogout}
    >
      <input type="hidden" name="scope" value={allSessions ? "all" : "current"} />
      <button className={className} type="submit" disabled={pending} onClick={onClick}>
        <LogOut className="size-4" /> {pending ? "Signing out..." : label || (allSessions ? "Log out all sessions" : "Log out")}
      </button>
      {error && <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">{error}</p>}
    </form>
  );
}
