"use client";

import Link from "next/link";
import { useActionState } from "react";
import { activateHomeownerAction } from "@/lib/actions/homeowner-activation";
import { PasswordInput } from "@/components/password-input";

type HandoffDetails = {
  accountNumber: string;
  email: string;
  tenantName: string;
  tenantSlug: string;
  propertyLabel: string;
  temporaryPassword: string;
};

export function HomeownerActivationForm({ handoffDetails }: { handoffDetails?: HandoffDetails }) {
  const [state, action, pending] = useActionState(activateHomeownerAction, {});
  const secureHandoff = Boolean(handoffDetails);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="activationMode" value={secureHandoff ? "handoff" : "legacy"} />
      {secureHandoff && handoffDetails ? (
        <div className="space-y-3 rounded-2xl border border-pine-100 bg-pine-50/60 p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.12em] text-pine-700">Association</p>
            <p className="mt-1 font-black text-[#10354c]">{handoffDetails.tenantName}</p>
          </div>
          <div>
            <label className="label text-slate-700" htmlFor="accountNumber">11-digit account number</label>
            <input className="field min-h-12 border-pine-200 bg-white font-mono text-[#10354c]" id="accountNumber" name="accountNumber" value={handoffDetails.accountNumber} readOnly />
          </div>
          <div>
            <label className="label text-slate-700" htmlFor="temporaryPassword">Temporary password</label>
            {handoffDetails.temporaryPassword ? (
              <input className="field min-h-12 border-pine-200 bg-white font-mono text-[#10354c]" id="temporaryPassword" name="temporaryPassword" value={handoffDetails.temporaryPassword} readOnly />
            ) : (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">This older invitation cannot securely prefill its temporary password. Ask HOA staff to resend the activation invitation if you need the password displayed here.</p>
            )}
          </div>
          <p className="rounded-xl bg-white px-3 py-2 text-xs font-semibold leading-5 text-slate-600">{handoffDetails.propertyLabel}. The account number and temporary password are shown only after the email verification link is validated.</p>
        </div>
      ) : (
        <>
          <div>
            <label className="label text-slate-700" htmlFor="accountNumber">11-digit account number</label>
            <input className="field min-h-12 border-slate-300 bg-white text-[#10354c]" id="accountNumber" name="accountNumber" inputMode="numeric" autoComplete="off" pattern="[0-9]{11}" maxLength={11} required />
          </div>
          <div>
            <label className="label text-slate-700" htmlFor="temporaryPassword">Temporary password</label>
            <PasswordInput className="field min-h-12 border-slate-300 bg-white pr-12 text-[#10354c]" id="temporaryPassword" name="temporaryPassword" autoComplete="one-time-code" required />
          </div>
        </>
      )}
      <div>
        <label className="label text-slate-700" htmlFor="email">Registered email</label>
        <input className="field min-h-12 border-slate-300 bg-white text-[#10354c]" id="email" name="email" type="email" autoComplete="email" defaultValue={handoffDetails?.email || ""} required />
      </div>
      <div>
        <label className="label text-slate-700" htmlFor="password">Permanent password</label>
        <PasswordInput className="field min-h-12 border-slate-300 bg-white pr-12 text-[#10354c]" id="password" name="password" autoComplete="new-password" minLength={6} maxLength={24} required />
      </div>
      {!secureHandoff && <div>
        <label className="label text-slate-700" htmlFor="confirmPassword">Confirm password</label>
        <PasswordInput className="field min-h-12 border-slate-300 bg-white pr-12 text-[#10354c]" id="confirmPassword" name="confirmPassword" autoComplete="new-password" minLength={6} maxLength={24} required />
      </div>}
      <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
        <input className="mt-1 size-4 shrink-0 accent-pine-700" type="checkbox" name="acceptTerms" value="yes" required />
        <span>I accept the HOAHub Terms and Conditions and acknowledge that my account access is subject to my HOA&apos;s policies.</span>
      </label>
      {state.error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      <button type="submit" className="btn-primary min-h-12 w-full text-base" disabled={pending}>{pending ? "Activating..." : "Create permanent password"}</button>
      <Link className="btn-secondary min-h-12 w-full" href="/login">Back to login</Link>
    </form>
  );
}
