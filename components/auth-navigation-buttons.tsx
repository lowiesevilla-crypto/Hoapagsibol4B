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
        type="submit"
        formAction="/api/auth/logout"
        formMethod="post"
        formEncType={LOGOUT_ENCODING}
        formTarget="_self"
        onClick={(event) => {
          const button = event.currentTarget;
          const form = button.form;
          onClick?.();
          if (!form) return;

          // Prevent React/Next's delegated default form submission from seeing this
          // Route Handler POST as a Server Action. Calling the native prototype submit
          // algorithm bypasses the delegated submit event and performs exactly one
          // same-origin full-document POST. The server remains authoritative for session
          // revocation, cookie clearing, and the HTTP 303 redirect destination.
          event.preventDefault();
          button.disabled = true;
          HTMLFormElement.prototype.submit.call(form);
        }}
      >
        <LogOut className="size-4" /> {label || (allSessions ? "Log out all sessions" : "Log out")}
      </button>
    </form>
  );
}
