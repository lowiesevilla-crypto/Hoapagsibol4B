"use client";

import { LogOut } from "lucide-react";

type LogoutButtonProps = {
  allSessions?: boolean;
  className?: string;
  formClassName?: string;
  label?: string;
  onClick?: () => void;
};

export function LogoutButton({ allSessions = false, className = "btn-secondary w-full", formClassName, label, onClick }: LogoutButtonProps) {
  return (
    <form
      action="/api/auth/logout"
      method="post"
      className={formClassName}
    >
      <input type="hidden" name="scope" value={allSessions ? "all" : "current"} />
      <button className={className} type="submit" onClick={onClick}>
        <LogOut className="size-4" /> {label || (allSessions ? "Log out all sessions" : "Log out")}
      </button>
    </form>
  );
}
