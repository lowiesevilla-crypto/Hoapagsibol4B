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
const LOGOUT_ENDPOINT = "/api/auth/logout";

function submitNativeLogout(scope: "current" | "all") {
  const form = document.createElement("form");
  form.method = "post";
  form.action = LOGOUT_ENDPOINT;
  form.enctype = LOGOUT_ENCODING;
  form.target = "_self";
  form.hidden = true;
  form.dataset.hoahubNativeLogout = "true";

  const scopeInput = document.createElement("input");
  scopeInput.type = "hidden";
  scopeInput.name = "scope";
  scopeInput.value = scope;
  form.append(scopeInput);
  document.body.append(form);

  // This form is created outside React's managed tree, so Next/React cannot attach
  // Server Action metadata or delegated submit semantics to it. The native browser
  // submission performs one full-document same-origin POST; the route handler remains
  // authoritative for session revocation, cookie clearing, and the HTTP 303 redirect.
  HTMLFormElement.prototype.submit.call(form);
}

export function LogoutButton({ allSessions = false, className = "btn-secondary w-full", formClassName, label, onClick }: LogoutButtonProps) {
  const scope = allSessions ? "all" : "current";

  return (
    <span className={formClassName} data-hoahub-logout-control="true">
      <button
        className={className}
        type="button"
        data-hoahub-logout-button="true"
        data-hoahub-logout-scope={scope}
        onClick={(event) => {
          event.currentTarget.disabled = true;
          try {
            onClick?.();
          } finally {
            submitNativeLogout(scope);
          }
        }}
      >
        <LogOut className="size-4" /> {label || (allSessions ? "Log out all sessions" : "Log out")}
      </button>
    </span>
  );
}
