import { ArrowRightLeft, Building2, Mail, ShieldCheck, UserRound } from "lucide-react";
import { LogoutButton } from "@/components/auth-navigation-buttons";
import { PageHeader } from "@/components/page-header";
import { switchLinkedAccountAction } from "@/lib/actions/linked-accounts";
import { requireUser } from "@/lib/auth";
import { displayRole, listLinkedAccounts } from "@/lib/linked-accounts";

export async function MyProfileView() {
  const user = await requireUser();
  const linkedAccounts = await listLinkedAccounts(user.email, user.id);
  const currentAccount = linkedAccounts.find((account) => account.current);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Account" title="My Profile" description="Review your signed-in identity and switch between HOAHub accounts linked to the same verified email address." />

      <section className="rounded-3xl border border-pine-100 bg-white p-5 shadow-soft sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <span className="grid size-20 shrink-0 place-items-center rounded-3xl bg-pine-50 text-pine-700">
            <UserRound className="size-9" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-2xl font-black text-ink">{user.name}</h2>
            <p className="mt-1 flex items-center gap-2 break-all text-sm text-slate-600"><Mail className="size-4 shrink-0" aria-hidden="true" />{user.email}</p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold text-pine-700">
              <ShieldCheck className="size-4" aria-hidden="true" />
              {user.roles.map(displayRole).join(" / ")}
            </p>
            {currentAccount && <p className="mt-2 text-sm text-slate-500">Current tenant: <span className="font-bold text-slate-700">{currentAccount.tenantName}</span></p>}
          </div>
          <div className="grid w-full gap-2 sm:w-auto">
            <LogoutButton className="btn-secondary min-h-12 w-full" />
            <LogoutButton allSessions className="btn-danger min-h-12 w-full" />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-pine-100 bg-white p-5 shadow-soft sm:p-6">
        <div className="mb-4">
          <p className="text-xs font-black uppercase tracking-[.14em] text-pine-700">Linked access</p>
          <h2 className="mt-1 text-xl font-black text-ink">My HOA accounts</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Accounts are matched by verified email. Switching creates a new tenant-scoped session, so records and permissions remain isolated between associations.</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {linkedAccounts.map((account) => (
            <article key={account.userId} className={`rounded-2xl border p-4 ${account.current ? "border-pine-300 bg-pine-50" : "border-slate-200 bg-white"}`}>
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-900 text-white"><Building2 className="size-5" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-black text-ink">{account.tenantName}</p>
                  <p className="mt-0.5 text-xs font-bold text-pine-700">{account.roles.map(displayRole).join(" / ")}</p>
                  {(account.accountNumber || account.propertyLabel) && <p className="mt-2 text-sm leading-6 text-slate-600">{account.accountNumber ? `Account ${account.accountNumber}` : ""}{account.accountNumber && account.propertyLabel ? " · " : ""}{account.propertyLabel || ""}</p>}
                </div>
              </div>
              <div className="mt-4">
                {account.current ? (
                  <span className="inline-flex min-h-10 items-center rounded-xl bg-pine-100 px-4 text-sm font-black text-pine-800">Current account</span>
                ) : (
                  <form action={switchLinkedAccountAction}>
                    <input type="hidden" name="targetUserId" value={account.userId} />
                    <button className="btn-secondary inline-flex min-h-10 items-center gap-2" type="submit"><ArrowRightLeft className="size-4" aria-hidden="true" />Open this account</button>
                  </form>
                )}
              </div>
            </article>
          ))}
          {!linkedAccounts.length && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">No additional HOAHub accounts are linked to this verified email address.</p>}
        </div>
      </section>
    </div>
  );
}
