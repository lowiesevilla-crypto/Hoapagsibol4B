"use client";

import { useActionState, useEffect } from "react";
import { LogOut } from "lucide-react";
import { logoutAllSessionsNavigationAction, logoutNavigationAction } from "@/lib/actions/auth";

type LogoutButtonProps = {
  allSessions?: boolean;
  className?: string;
  formClassName?: string;
  label?: string;
  onClick?: () => void;
};

export function LogoutButton({ allSessions = false, className = "btn-secondary w-full", formClassName, label, onClick }: LogoutButtonProps) {
  const action = allSessions ? logoutAllSessionsNavigationAction : logoutNavigationAction;
  const [state, formAction, pending] = useActionState(action, {});

  useEffect(() => {
    if (state.redirectTo) window.location.replace(state.redirectTo);
  }, [state.redirectTo]);

  return (
    <form action={formAction} className={formClassName}>
      <button className={className} type="submit" disabled={pending} onClick={onClick}>
        <LogOut className="size-4" /> {pending ? "Signing out..." : label || (allSessions ? "Log out all sessions" : "Log out")}
      </button>
      {state.error && <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
    </form>
  );
}
