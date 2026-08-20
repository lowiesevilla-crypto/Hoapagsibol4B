"use client";

import { LogOut } from "lucide-react";

type LogoutButtonProps = {
  allSessions?: boolean;
  className?: string;
  formClassName?: string;
  label?: string;
  onClick?: () => void;
};

const LOGOUT_ENCODING = "application/x-www-form-urlencoded";

export function LogoutButton({ allSessions = false, className = "btn-secondary w-full", formClassName, label, onClick }: LogoutButtonProps) {
  return (
    <form
      action="/api/auth/logout"
      method="post"
      encType={LOGOUT_ENCODING}
      target="_self"
      className={formClassName}
      data-hoahub-native-logout="true"
    >
      <input type="hidden" name="scope" value={allSessions ? "all" : "current"} />
      <button
        className={className}
        type="button"
        data-hoahub-logout-button="true"
        onClick={(event) => {
          const button = event.currentTarget;
          const form = button.form;
          onClick?.();
          if (!form) return;

          // This control is intentionally not a submit button. React/Next therefore
          // receives no default submit activation to reinterpret as a Server Action.
          // Calling the native prototype submit algorithm bypasses delegated submit
          // events and performs exactly one same-origin full-document POST. The server
          // remains authoritative for session revocation, cookie clearing, and the
          // HTTP 303 redirect destination.
          button.disabled = true;
          HTMLFormElement.prototype.submit.call(form);
        }}
      >
        <LogOut className="size-4" /> {label || (allSessions ? "Log out all sessions" : "Log out")}
      </button>
    </form>
  );
}
