"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { loginAction } from "@/lib/actions/auth";

export function LoginForm({ tenantSlug = "pagsibol4b" }: { tenantSlug?: string }) {
  const [state, action, pending] = useActionState(loginAction, {});
  const [showPassword, setShowPassword] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      <div><label className="label text-slate-700" htmlFor="email">Email address</label><input className="field min-h-12 border-slate-300 bg-white text-[#10354c]" id="email" name="email" type="email" placeholder="name@example.com" autoComplete="email" required /></div>
      <div>
        <label className="label text-slate-700" htmlFor="password">Password</label>
        <div className="relative">
          <input className="field min-h-12 border-slate-300 bg-white pr-12 text-[#10354c]" id="password" name="password" type={showPassword ? "text" : "password"} placeholder="Enter your password" autoComplete="current-password" minLength={8} required />
          <button type="button" className="absolute inset-y-1 right-1 grid w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-pine-700" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"}>
            {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">{showPassword ? "Hide password" : "Show password"} while typing.</p>
      </div>
      <div className="flex justify-end"><Link className="text-sm font-bold text-pine-700 hover:text-pine-900 hover:underline" href={`/forgot-password?tenantSlug=${encodeURIComponent(tenantSlug)}`}>Forgot password?</Link></div>
      {state.error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      <button className="btn-primary min-h-12 w-full text-base" disabled={pending}>{pending ? "Signing in..." : "Sign in securely"}</button>
    </form>
  );
}
