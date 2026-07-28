"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { loginAction } from "@/lib/actions/auth";
import { PasskeyLoginButton } from "@/components/passkey-login-button";
import { PasswordInput } from "@/components/password-input";

export function LoginForm({ tenantSlug }: { tenantSlug?: string }) {
  const [state, action, pending] = useActionState(loginAction, {});
  const universal = !tenantSlug;
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="space-y-3 sm:space-y-4">
      {tenantSlug && <input type="hidden" name="tenantSlug" value={tenantSlug} />}

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
          minLength={8}
          required
        />
      </div>

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
        {pending ? "Signing in..." : "Sign in securely"}
      </button>
      <PasskeyLoginButton formRef={formRef} />
      {universal && <Link className="btn-secondary min-h-12 w-full" href="/activate">Activate homeowner account</Link>}
    </form>
  );
}
