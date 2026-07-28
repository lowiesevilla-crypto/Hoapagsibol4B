"use client";

import Link from "next/link";
import { useActionState } from "react";
import { activateHomeownerAction } from "@/lib/actions/homeowner-activation";
import { PasswordInput } from "@/components/password-input";

export function HomeownerActivationForm() {
  const [state, action, pending] = useActionState(activateHomeownerAction, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label text-slate-700" htmlFor="accountNumber">11-digit account number</label>
        <input className="field min-h-12 border-slate-300 bg-white text-[#10354c]" id="accountNumber" name="accountNumber" inputMode="numeric" autoComplete="off" pattern="[0-9]{11}" maxLength={11} required />
      </div>
      <div>
        <label className="label text-slate-700" htmlFor="email">Registered email</label>
        <input className="field min-h-12 border-slate-300 bg-white text-[#10354c]" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label text-slate-700" htmlFor="temporaryPassword">Temporary password</label>
        <PasswordInput className="field min-h-12 border-slate-300 bg-white pr-12 text-[#10354c]" id="temporaryPassword" name="temporaryPassword" autoComplete="one-time-code" required />
      </div>
      <div>
        <label className="label text-slate-700" htmlFor="password">Permanent password</label>
        <PasswordInput className="field min-h-12 border-slate-300 bg-white pr-12 text-[#10354c]" id="password" name="password" autoComplete="new-password" minLength={6} maxLength={24} required />
      </div>
      <div>
        <label className="label text-slate-700" htmlFor="confirmPassword">Confirm password</label>
        <PasswordInput className="field min-h-12 border-slate-300 bg-white pr-12 text-[#10354c]" id="confirmPassword" name="confirmPassword" autoComplete="new-password" minLength={6} maxLength={24} required />
      </div>
      {state.error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      <button className="btn-primary min-h-12 w-full text-base" disabled={pending}>{pending ? "Activating..." : "Activate account"}</button>
      <Link className="btn-secondary min-h-12 w-full" href="/login">Back to login</Link>
    </form>
  );
}
