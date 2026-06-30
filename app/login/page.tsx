import { redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, LockKeyhole, Megaphone, ReceiptText, WalletCards } from "lucide-react";
import { defaultHomeForRole, readSession } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
import { AssociationLogo } from "@/components/association-logo";
import { getAssociationSettings } from "@/lib/system-settings";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const query = await searchParams;
  const session = await readSession();
  if (session) redirect(defaultHomeForRole(session.role));
  const association = await getAssociationSettings();
  const features = [
    { title: "Financial transparency", note: "Billing, collections and reports", icon: WalletCards },
    { title: "Official records", note: "Receipts, payments and account history", icon: ReceiptText },
    { title: "Community updates", note: "Announcements and reminders", icon: Megaphone },
    { title: "Activities", note: "Events and neighborhood schedules", icon: CalendarDays },
  ];
  return (
    <main className="grid min-h-screen bg-[#eef8fc] lg:grid-cols-[1.08fr_.92fr]">
      <section className="brand-hero brand-grid relative hidden min-h-screen flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-16">
        <span className="pointer-events-none absolute -left-24 top-1/3 size-72 rounded-full border-[40px] border-leaf-500/10" /><span className="pointer-events-none absolute -right-28 -top-24 size-80 rounded-full border-[48px] border-white/5" />
        <div className="relative flex items-center gap-5"><AssociationLogo className="size-24" src={association.logoUrl} alt={`${association.name} logo`} /><div><p className="text-xl font-black leading-tight text-white">{association.name}</p><p className="mt-1 text-sm font-bold uppercase tracking-[.18em] text-[#dff8d2]">Homeowners Association</p></div></div>
        <div className="relative max-w-2xl py-10">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-pine-900/35 px-4 py-2 text-xs font-extrabold uppercase tracking-[.2em] text-white"><CheckCircle2 className="size-4 text-leaf-100" /> Growing together, managed clearly</p>
          <h1 className="max-w-xl text-5xl font-black leading-[1.06] text-white xl:text-6xl">One secure portal for a <span className="text-[#dff8d2]">connected community.</span></h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[#d7effb]">Access association finances, resident services, official notices, and community activities with clarity and confidence.</p>
          <ul className="mt-9 grid max-w-2xl gap-3 sm:grid-cols-2">
            {features.map((item) => { const Icon = item.icon; return <li className="flex items-center gap-3 rounded-2xl border border-white/20 bg-pine-900/45 p-4 shadow-lg backdrop-blur-sm" key={item.title}><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-leaf-100 text-pine-900"><Icon className="size-5" /></span><span><span className="block text-sm font-black text-white">{item.title}</span><span className="mt-0.5 block text-xs leading-5 text-[#d7effb]">{item.note}</span></span></li>; })}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-sm font-semibold text-[#d7effb]"><LockKeyhole className="size-4 text-leaf-100" /> Secure access for association officers and residents</p>
      </section>
      <section className="relative grid min-h-screen place-items-center overflow-hidden bg-[#eef8fc] p-5 sm:p-10"><span className="pointer-events-none absolute -right-28 top-10 size-64 rounded-full bg-leaf-100/70 blur-2xl" /><span className="pointer-events-none absolute -bottom-24 -left-24 size-72 rounded-full bg-pine-100/80 blur-2xl" />
        <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-pine-100 bg-white p-7 shadow-[0_24px_70px_rgba(8,97,141,.16)] sm:p-10"><span className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-leaf-500 via-pine-500 to-pine-700" />
          <div className="mb-8 flex items-center gap-4 lg:hidden"><AssociationLogo className="size-20" src={association.logoUrl} alt={`${association.name} logo`} /><div><p className="font-black leading-tight text-pine-900">{association.name}</p><p className="mt-1 text-sm font-extrabold text-leaf-700">HOA Portal</p></div></div>
          <p className="text-xs font-extrabold uppercase tracking-[.2em] text-pine-700">Secure resident access</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-[#10354c]">Welcome to your HOA portal</h2>
          <p className="mb-7 mt-3 text-sm leading-6 text-slate-600">Sign in using the email address and password issued by the HOA administrator.</p>
          {query.reset === "success" && <p role="status" className="mb-5 rounded-xl bg-emerald-50 px-3 py-3 text-sm font-semibold leading-6 text-emerald-800">Password updated successfully. Sign in using your new password.</p>}
          <LoginForm />
          <div className="mt-7 border-t border-slate-100 pt-5"><p className="text-center text-xs leading-5 text-slate-500">Need account assistance? Contact the HOA office to verify or reset your access.</p></div>
        </div>
      </section>
    </main>
  );
}
