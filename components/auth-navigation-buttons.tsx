"use client";

import { LogOut } from "lucide-react";

type LogoutButtonProps = {
  allSessions?: boolean;
  className?: string;
  formClassName?: string;
  label?: string;
  onClick?: () => void;
};

const LOGOUT_TRANSITION_ENDPOINT = "/api/auth/logout-transition";

export function LogoutButton({ allSessions = false, className = "btn-secondary w-full", formClassName, label, onClick }: LogoutButtonProps) {
  const scope = allSessions ? "all" : "current";
  const href = `${LOGOUT_TRANSITION_ENDPOINT}?scope=${scope}`;

  return (
    <span className={formClassName} data-hoahub-logout-control="true">
      <a
        className={className}
        href={href}
        rel="nofollow"
        data-hoahub-logout-button="true"
        data-hoahub-logout-scope={scope}
        onClick={() => onClick?.()}
      >
        <LogOut className="size-4" /> {label || (allSessions ? "Log out all sessions" : "Log out")}
      </a>
    </span>
  );
}
