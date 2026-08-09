"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { loginAction } from "@/lib/actions/auth";
import { PasskeyLoginButton } from "@/components/passkey-login-button";
import { PasswordInput } from "@/components/password-input";

export function LoginForm({ tenantSlug, returnTo }: { tenantSlug?: string; returnTo?: string }) {
  const [state, action, pending] = useActionState(loginAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const hasChoices = Boolean(state.choices?.length);

  useEffect(() => {
    if (state.redirectTo) window.location.replace(state.redirectTo);
  }, [state.redirectTo]);

  return (
    <form ref={formRef} action={action} className="space-y-3 sm:space-y-4">
      {tenantSlug && <input type="hidden" name="tenantSlug" value={tenantSlug} />}
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

      <div>
        <label className="label text-slate-700" htmlFor="identifier">Email address or 11-digit account number</label>
        <input
          className="field min-h-12 border-slate-300 bg-white text-[#10354c]"
          id="identifier"
          name="identifier"
          type="text"
          placeholder="Enter your verified email or account number"
          autoComplete="username"
          required
        />
      </div>

      <div>
        <label className="label text-slate-700" htmlFor="password">Password</label>
        <PasswordInput
          className="field min-h-12 border-slate-300 bg-white pr-12 text-[#10354c]"
          id="password"
          name="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          minLength={6}
          required
        />
      </div>

      {hasChoices && (
        <fieldset className="space-y-2 rounded-2xl border border-pine-100 bg-pine-50/60 p-3" aria-describedby="account-choice-help">
          <legend className="px-1 text-sm font-black text-[#10354c]">Choose the HOA account to open</legend>
          <p id="account-choice-help" className="px-1 text-xs leading-5 text-slate-600">
            Your verified email and password match more than one tenant or homeowner account. Only the selected tenant is loaded into the session.
          </p>
          <div className="space-y-2">
            {state.choices?.map((choice, index) => (
              <label key={choice.userId} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:border-pine-300">
                <input className="mt-1 size-4 accent-pine-700" type="radio" name="selectedUserId" value={choice.userId} defaultChecked={index === 0} required />
                <span className="min-w-0">
                  <span className="block break-words text-sm font-black text-[#10354c]">{choice.tenantName}</span>
                  <span className="mt-0.5 block text-xs font-bold text-pine-700">{choice.roleLabel}</span>
                  {(choice.accountNumber || choice.propertyLabel) && (
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      {choice.accountNumber ? `Account ${choice.accountNumber}` : ""}
                      {choice.accountNumber && choice.propertyLabel ? " · " : ""}
                      {choice.propertyLabel || ""}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex justify-end">
        <Link
          className="text-sm font-bold text-pine-700 hover:text-pine-900 hover:underline"
          href={tenantSlug ? `/forgot-password?tenantSlug=${encodeURIComponent(tenantSlug)}` : "/forgot-password"}
        >
          Forgot password?
        </Link>
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      )}

      <button className="btn-primary min-h-12 w-full text-base" disabled={pending}>
        {pending ? "Signing in..." : hasChoices ? "Open selected account" : "Sign in securely"}
      </button>
      {!hasChoices && <PasskeyLoginButton formRef={formRef} />}
    </form>
  );
}
