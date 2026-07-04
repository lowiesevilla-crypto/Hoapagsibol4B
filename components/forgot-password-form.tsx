"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction } from "@/lib/actions/password-reset";

export function ForgotPasswordForm({ tenantSlug }: { tenantSlug: string }) {
  const [state, action, pending] = useActionState(forgotPasswordAction, {});
  return <form action={action} className="space-y-5">
    <input type="hidden" name="tenantSlug" value={tenantSlug} />
    <div><label className="label" htmlFor="recovery-email">Registered email address</label><input id="recovery-email" className="field min-h-12" name="email" type="email" autoComplete="email" placeholder="name@example.com" required /></div>
    {state.error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{state.error}</p>}
    {state.success && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-3 text-sm font-semibold leading-6 text-emerald-800">{state.success}</p>}
    <button className="btn-primary min-h-12 w-full" disabled={pending}>{pending ? "Sending secure link..." : "Send reset link"}</button>
    <Link className="btn-secondary min-h-12 w-full" href={`/${tenantSlug}/login`}>Back to login</Link>
  </form>;
}
