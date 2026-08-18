"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

type LogoutButtonProps = {
  allSessions?: boolean;
  className?: string;
  formClassName?: string;
  label?: string;
  onClick?: () => void;
};

export function LogoutButton({ allSessions = false, className = "btn-secondary w-full", formClassName, label, onClick }: LogoutButtonProps) {
  const [pending, setPending] = useState(false);

  return (
    <form
      action="/api/auth/logout"
      method="post"
      className={formClassName}
      onSubmit={() => setPending(true)}
    >
      <input type="hidden" name="scope" value={allSessions ? "all" : "current"} />
      <button className={className} type="submit" disabled={pending} onClick={onClick}>
        <LogOut className="size-4" /> {pending ? "Signing out..." : label || (allSessions ? "Log out all sessions" : "Log out")}
      </button>
    </form>
  );
}
