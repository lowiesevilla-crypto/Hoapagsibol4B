import { KeyRound } from "lucide-react";
import { AssociationLogo } from "@/components/association-logo";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { getAssociationSettings } from "@/lib/system-settings";

export default async function ForgotPasswordPage() {
  const association = await getAssociationSettings();
  return <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#eef8fc] p-4 sm:p-8"><span className="pointer-events-none absolute -right-24 top-4 size-64 rounded-full bg-leaf-100/70 blur-2xl" /><span className="pointer-events-none absolute -bottom-24 -left-24 size-72 rounded-full bg-pine-100/80 blur-2xl" /><section className="relative w-full max-w-md rounded-[2rem] border border-pine-100 bg-white p-6 shadow-[0_24px_70px_rgba(8,97,141,.16)] sm:p-9"><div className="mb-6 flex items-center gap-4"><AssociationLogo className="size-16" src={association.logoUrl} alt={`${association.name} logo`} /><div><p className="font-black leading-tight text-pine-900">{association.name}</p><p className="text-sm font-bold text-leaf-700">HOA Digital Hub</p></div></div><span className="grid size-11 place-items-center rounded-2xl bg-pine-50 text-pine-700"><KeyRound className="size-5" /></span><h1 className="mt-4 text-3xl font-black tracking-tight text-ink">Forgot password?</h1><p className="mb-6 mt-2 text-sm leading-6 text-slate-600">Enter the email registered with your homeowner account. We will send a secure, time-limited reset link when the account is eligible.</p><ForgotPasswordForm /></section></main>;
}
