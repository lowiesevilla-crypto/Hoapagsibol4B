import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { AssociationLogo } from "@/components/association-logo";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { getValidResetToken } from "@/lib/actions/password-reset";
import { getAssociationSettings, getPasswordPolicy } from "@/lib/system-settings";
import { DEFAULT_TENANT_SLUG, resolveTenant } from "@/lib/tenant";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; tenantSlug?: string }> }) {
  const query = await searchParams;
  const token = query.token || "";
  const validToken = await getValidResetToken(token);
  const tenant = await resolveTenant(query.tenantSlug || DEFAULT_TENANT_SLUG);
  const tenantMatches = Boolean(validToken && tenant && validToken.tenantId === tenant.id);
  const association = tenant ? await getAssociationSettings(tenant.id) : { name: "HOA Digital Hub", logoUrl: "/pagsibol-logo.png" };
  const policy = tenant ? await getPasswordPolicy(tenant.id) : { minLength: 10, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecial: true };
  const tenantSlug = tenant?.slug || DEFAULT_TENANT_SLUG;
  const rules = [`At least ${policy.minLength} characters`, policy.requireUppercase ? "One uppercase letter" : "", policy.requireLowercase ? "One lowercase letter" : "", policy.requireNumber ? "One number" : "", policy.requireSpecial ? "One special character" : ""].filter(Boolean);
  return <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#eef8fc] p-4 sm:p-8"><section className="relative w-full max-w-md rounded-[2rem] border border-pine-100 bg-white p-6 shadow-[0_24px_70px_rgba(8,97,141,.16)] sm:p-9"><div className="mb-6 flex items-center gap-4"><AssociationLogo className="size-16" src={association.logoUrl} alt={`${association.name} logo`} /><div><p className="font-black leading-tight text-pine-900">{association.name}</p><p className="text-sm font-bold text-leaf-700">Secure account recovery</p></div></div><span className="grid size-11 place-items-center rounded-2xl bg-pine-50 text-pine-700"><LockKeyhole className="size-5" /></span><h1 className="mt-4 text-3xl font-black tracking-tight text-ink">Create a new password</h1>{tenantMatches && validToken ? <><p className="mb-6 mt-2 text-sm leading-6 text-slate-600">Choose a strong password. This link expires at {validToken.expiresAt.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })}.</p><ResetPasswordForm token={token} minLength={policy.minLength} rules={rules} /></> : <div className="mt-5"><p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm font-semibold leading-6 text-rose-700">This reset link is invalid, expired, or has already been used.</p><Link className="btn-primary mt-5 w-full" href={`/forgot-password?tenantSlug=${encodeURIComponent(tenantSlug)}`}>Request a new reset link</Link><Link className="btn-secondary mt-3 w-full" href={`/${tenantSlug}/login`}>Back to login</Link></div>}</section></main>;
}
