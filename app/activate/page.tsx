import { redirect } from "next/navigation";
import { defaultHomeForRole, readSession, sessionIsCurrent } from "@/lib/auth";
import { HomeownerActivationForm } from "@/components/homeowner-activation-form";

export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ error?: string; verified?: string }> }) {
  const session = await readSession();
  if (session && await sessionIsCurrent(session)) redirect(defaultHomeForRole(session.role));
  const query = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-[#eef8fc] px-4 py-8">
      <section className="w-full max-w-md overflow-hidden rounded-[2rem] border border-pine-100 bg-white p-5 shadow-[0_24px_70px_rgba(8,97,141,.16)] sm:p-10">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-pine-700">Homeowner Activation</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-[#10354c] sm:text-3xl">Set up your HOAHub access</h1>
        <p className="mb-6 mt-2 text-sm leading-6 text-slate-600">Use the account number and temporary password sent by your HOA, then create your permanent password.</p>
        {query.verified && <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{query.verified === "already" ? "Your registered email is already verified." : "Registered email verified. Complete activation below."}</p>}
        {query.error && <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{query.error}</p>}
        <HomeownerActivationForm />
      </section>
    </main>
  );
}
