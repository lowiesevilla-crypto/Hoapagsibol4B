"use client";

import type { MouseEvent } from "react";
import { LogOut } from "lucide-react";

type LogoutButtonProps = {
  allSessions?: boolean;
  className?: string;
  formClassName?: string;
  label?: string;
  onClick?: () => void;
};

export function LogoutButton({ allSessions = false, className = "btn-secondary w-full", formClassName, label, onClick }: LogoutButtonProps) {
  function submitLogout(event: MouseEvent<HTMLButtonElement>) {
    onClick?.();
    const form = event.currentTarget.form;
    if (!form) return;

    // Next/React can attach delegated form listeners while hydrating client shells.
    // Bypass those listeners deliberately so logout is always a real document POST;
    // this makes cookie/session revocation and the server's 303 the sole authority.
    event.preventDefault();
    HTMLFormElement.prototype.submit.call(form);
  }

  return (
    <form
      action="/api/auth/logout"
      method="post"
      className={formClassName}
    >
      <input type="hidden" name="scope" value={allSessions ? "all" : "current"} />
      <button className={className} type="submit" onClick={submitLogout}>
        <LogOut className="size-4" /> {label || (allSessions ? "Log out all sessions" : "Log out")}
      </button>
    </form>
  );
}
