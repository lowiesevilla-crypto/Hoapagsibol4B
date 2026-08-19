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

const LOGOUT_NAVIGATION_WATCHDOG_MS = 5_000;

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

function submitNativeLogout(form: HTMLFormElement) {
  // Bypass React's onSubmit handler so the browser performs the progressive-enhancement
  // POST directly. The endpoint revokes the session and answers with an HTTP 303.
  HTMLFormElement.prototype.submit.call(form);
}

export function LogoutButton({ allSessions = false, className = "btn-secondary w-full", formClassName, label, onClick }: LogoutButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submitLogout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    setPending(true);
    setError("");

    // A client-side/hydration/network failure must never leave the user trapped on a
    // protected screen. If the interactive path does not complete quickly, fall back
    // to the same secure full-document POST/303 flow.
    const watchdog = window.setTimeout(() => {
      try {
        submitNativeLogout(form);
      } catch {
        setPending(false);
        setError("We couldn't sign you out. Please refresh this page and try again.");
      }
    }, LOGOUT_NAVIGATION_WATCHDOG_MS);

    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "X-HOA-Logout-Navigation": "fetch",
        },
      });
      if (!response.ok) throw new Error("Logout request failed");

      const result = await response.json() as LogoutNavigationResponse;
      if (typeof result.redirectTo !== "string") throw new Error("Logout redirect was not returned");

      const destination = safeLogoutDestination(result.redirectTo);
      onClick?.();

      // The server has already revoked/deleted the signed session and completed the
      // cookie-clearing response. Replace the protected entry so browser Back cannot
      // restore it as the current authenticated document. The watchdog remains armed;
      // if replacement fails to commit, native POST/303 recovery takes over.
      window.location.replace(destination);
    } catch {
      window.clearTimeout(watchdog);
      try {
        submitNativeLogout(form);
      } catch {
        setPending(false);
        setError("We couldn't sign you out. Please refresh this page and try again.");
      }
    }
  }

  return (
    <form
      action="/api/auth/logout"
      method="post"
      className={formClassName}
      onSubmit={submitLogout}
      data-hoahub-logout-form="true"
    >
      <input type="hidden" name="scope" value={allSessions ? "all" : "current"} />
      <button
        className={className}
        type="submit"
        disabled={pending}
        onClick={onClick}
        data-hoahub-logout-button="true"
      >
        <LogOut className="size-4" /> {pending ? "Signing out..." : label || (allSessions ? "Log out all sessions" : "Log out")}
      </button>
      {error && <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">{error}</p>}
    </form>
  );
}
