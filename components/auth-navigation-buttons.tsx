"use client";

import { useEffect, useRef } from "react";
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
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    // React/Next delegates submit handling from the application root. This logout
    // is intentionally a normal document POST to a Route Handler, not a Server
    // Action. Stop the submit event before it reaches the delegated handler while
    // leaving the browser default action untouched (no preventDefault/manual submit).
    const keepNativeDocumentSubmit = (event: SubmitEvent) => {
      event.stopImmediatePropagation();
    };

    form.addEventListener("submit", keepNativeDocumentSubmit);
    return () => form.removeEventListener("submit", keepNativeDocumentSubmit);
  }, []);

  return (
    <form
      ref={formRef}
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
        onClick={onClick}
      >
        <LogOut className="size-4" /> {label || (allSessions ? "Log out all sessions" : "Log out")}
      </button>
    </form>
  );
}
