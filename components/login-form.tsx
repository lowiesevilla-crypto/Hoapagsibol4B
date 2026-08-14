"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { loginAction } from "@/lib/actions/auth";
import { AssociationLogo } from "@/components/association-logo";
import { PasskeyLoginButton } from "@/components/passkey-login-button";
import { PasswordInput } from "@/components/password-input";
import { DEFAULT_TENANT_LOGO_URL } from "@/lib/tenant-logo";
import transitionStyles from "./login-verified-transition.module.css";

const VERIFIED_TRANSITION_MS = 800;

export function LoginForm({
  tenantSlug,
  returnTo,
  tenantName = "HOAHub",
  logoUrl,
}: {
  tenantSlug?: string;
  returnTo?: string;
  tenantName?: string;
  logoUrl?: string;
}) {
  const [state, action, pending] = useActionState(loginAction, {});
  const [verified, setVerified] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const hasChoices = Boolean(state.choices?.length);
  const logo = logoUrl?.trim() || DEFAULT_TENANT_LOGO_URL;

  useEffect(() => {
    if (!state.redirectTo) return;
    setVerified(true);
    const redirectTimer = window.setTimeout(() => {
      window.location.replace(returnTo || state.redirectTo!);
    }, VERIFIED_TRANSITION_MS);
    return () => window.clearTimeout(redirectTimer);
  }, [returnTo, state.redirectTo]);

  return (
    <div className={transitionStyles.stage}>
      <form
        ref={formRef}
        action={action}
        className={`community-pulse-form space-y-3 sm:space-y-4 ${transitionStyles.form} ${verified ? transitionStyles.formVerified : ""}`}
        aria-hidden={verified ? "true" : undefined}
      >
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
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="next"
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
                <label key={choice.userId} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-pine-300 hover:shadow-sm">
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
            className="text-sm font-bold text-pine-700 transition hover:text-pine-900 hover:underline"
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

        <button
          className="community-pulse-primary btn-primary min-h-12 w-full text-base"
          type="submit"
          disabled={pending || verified}
          data-verified={verified ? "true" : "false"}
          aria-live="polite"
        >
          {pending ? (
            <span className={transitionStyles.pendingLabel}>
              <span className={transitionStyles.pendingSpinner} aria-hidden="true" />
              Verifying access…
            </span>
          ) : hasChoices ? "Open selected account" : "Sign in securely"}
        </button>
        {!hasChoices && <PasskeyLoginButton formRef={formRef} />}
      </form>

      {verified && (
        <div className={transitionStyles.successOverlay} role="status" aria-live="assertive" aria-atomic="true">
          <div className={transitionStyles.successContent}>
            <div className={transitionStyles.logoOrbit} aria-hidden="true">
              <AssociationLogo className={transitionStyles.logo} src={logo} alt="" />
              <span className={transitionStyles.checkBadge}>
                <CheckCircle2 className="size-5" />
              </span>
            </div>
            <p className={transitionStyles.eyebrow}>Secure access confirmed</p>
            <p className={transitionStyles.title}>Access verified</p>
            <p className={transitionStyles.copy}>Welcome back to {tenantName}. Opening your HOAHub dashboard…</p>
            <span className={transitionStyles.progress} aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}
