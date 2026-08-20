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
        onClick={onClick}
      >
        <LogOut className="size-4" /> {label || (allSessions ? "Log out all sessions" : "Log out")}
      </button>
    </form>
  );
}
