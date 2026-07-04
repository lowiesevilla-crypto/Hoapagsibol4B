"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction } from "@/lib/actions/password-reset";
import { PasswordInput } from "@/components/password-input";

export function ResetPasswordForm({ token, minLength, rules }: { token: string; minLength: number; rules: string[] }) {
  const [state, action, pending] = useActionState(resetPasswordAction, {});
  return <form action={action} className="space-y-4">
    <input type="hidden" name="token" value={token} />
    <PasswordField id="new-password" name="password" label="New password" minLength={minLength} />
    <PasswordField id="confirm-password" name="confirmPassword" label="Confirm password" minLength={minLength} />
    <ul className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{rules.map((rule) => <li key={rule}>• {rule}</li>)}</ul>
    {state.error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{state.error}</p>}
    <button className="btn-primary min-h-12 w-full" disabled={pending}>{pending ? "Updating password..." : "Update password"}</button>
    <Link className="btn-secondary min-h-12 w-full" href="/login">Cancel and return to login</Link>
  </form>;
}

function PasswordField({ id, name, label, minLength }: { id: string; name: string; label: string; minLength: number }) {
  return <div><label className="label" htmlFor={id}>{label}</label><PasswordInput id={id} className="field min-h-12" name={name} autoComplete="new-password" minLength={minLength} maxLength={72} required /></div>;
}
