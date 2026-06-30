"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";
import { resetPasswordAction } from "@/lib/actions/password-reset";

export function ResetPasswordForm({ token, minLength, rules }: { token: string; minLength: number; rules: string[] }) {
  const [state, action, pending] = useActionState(resetPasswordAction, {});
  const [visible, setVisible] = useState(false);
  return <form action={action} className="space-y-4">
    <input type="hidden" name="token" value={token} />
    <PasswordField id="new-password" name="password" label="New password" visible={visible} minLength={minLength} />
    <PasswordField id="confirm-password" name="confirmPassword" label="Confirm password" visible={visible} minLength={minLength} />
    <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-bold text-pine-700" onClick={() => setVisible((value) => !value)}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{visible ? "Hide passwords" : "Show passwords"}</button>
    <ul className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{rules.map((rule) => <li key={rule}>• {rule}</li>)}</ul>
    {state.error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{state.error}</p>}
    <button className="btn-primary min-h-12 w-full" disabled={pending}>{pending ? "Updating password..." : "Update password"}</button>
    <Link className="btn-secondary min-h-12 w-full" href="/login">Cancel and return to login</Link>
  </form>;
}

function PasswordField({ id, name, label, visible, minLength }: { id: string; name: string; label: string; visible: boolean; minLength: number }) {
  return <div><label className="label" htmlFor={id}>{label}</label><input id={id} className="field min-h-12" name={name} type={visible ? "text" : "password"} autoComplete="new-password" minLength={minLength} maxLength={72} required /></div>;
}
