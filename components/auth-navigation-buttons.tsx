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

          // Next/React delegates form submit events from the application root and can
          // misclassify this Route Handler POST as a Server Action. The native submit()
          // algorithm bypasses that delegated submit event while preserving a normal
          // full-document POST. The server remains authoritative for session revocation
          // and the HTTP 303 destination. Disabling the button prevents a second default
          // activation after this programmatic native submission starts.
          button.disabled = true;
          form.submit();
        }}
      >
        <LogOut className="size-4" /> {label || (allSessions ? "Log out all sessions" : "Log out")}
      </button>
    </form>
  );
}
