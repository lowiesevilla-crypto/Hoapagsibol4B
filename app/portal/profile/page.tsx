import { ArrowRightLeft, BadgeInfo, Building2, CalendarDays, Home, Mail, MessageCircle, Phone, ShieldCheck, UserRound } from "lucide-react";
import { LogoutButton } from "@/components/auth-navigation-buttons";
import { CommunityEmptyState, InfoTile } from "@/components/homeowner/community/community-cards";
import { PageHeader } from "@/components/page-header";
import { PasskeyEnrollmentPanel } from "@/components/passkey-enrollment-panel";
import { PortalPageContainer, PortalSectionHeader } from "@/components/portal-mobile-shell";
import { StatusBadge } from "@/components/status-badge";
import { switchLinkedAccountAction } from "@/lib/actions/linked-accounts";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { prisma } from "@/lib/db";
import { listLinkedAccounts } from "@/lib/linked-accounts";
import { requireHomeownerProfile } from "@/lib/portal";
import { money, shortDate } from "@/lib/utils";

export default async function ProfilePage() {
  const profile = await requireHomeownerProfile();
  const [passkeyCount, householdMembers, linkedAccounts] = await Promise.all([
    prisma.userPasskeyCredential.count({ where: { userId: profile.userId, tenantId: profile.tenantId } }),
    prisma.householdMember.findMany({
      where: { tenantId: profile.tenantId, homeownerId: profile.id, active: true, revokedAt: null },
      select: { id: true, fullName: true, relationship: true, birthDate: true, validatedAt: true },
      orderBy: [{ fullName: "asc" }],
      take: 8,
    }),
    listLinkedAccounts(profile.user.email, profile.userId),
  ]);
  const details = [
    { label: "Account Number", value: homeownerAccountNumber(profile), icon: BadgeInfo },
    { label: "Email", value: profile.user.email, icon: Mail },
    { label: "Phone", value: profile.phone, icon: Phone },
    { label: "Address", value: profile.address, icon: Home },
    { label: "Messenger ID", value: profile.messengerId || "Not provided", icon: MessageCircle },
  ];
  const property = [
    { label: "Block and lot", value: `Block ${profile.block}, Lot ${profile.lot}`, icon: Home },
    { label: "Phase", value: profile.phase, icon: BadgeInfo },
    { label: "Property type", value: profile.propertyType, icon: Home },
    { label: "Occupancy", value: profile.occupancyStatus, icon: ShieldCheck },
    { label: "Residency date", value: profile.residencyDate ? shortDate(profile.residencyDate) : null, icon: CalendarDays },
  ];

  return (
    <PortalPageContainer className="space-y-5">
      <PageHeader eyebrow="Account" title="My profile" description="Contact your HOA administrator to request corrections to this record." />
      <section className="rounded-3xl border border-pine-100 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-5 border-b border-slate-100 pb-6 sm:flex-row sm:items-center">
          <span className="grid size-20 place-items-center rounded-3xl bg-pine-50 text-pine-700">
            <UserRound className="size-9" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-2xl font-black text-ink">{profile.user.name}</h2>
            <p className="text-sm text-slate-500">Block {profile.block}, Lot {profile.lot}</p>
            <div className="mt-2 flex flex-wrap gap-2"><StatusBadge status={profile.status} /><StatusBadge status={profile.activationStatus} /></div>
          </div>
          <div className="grid w-full gap-2 sm:w-auto">
            <LogoutButton className="btn-secondary min-h-12 w-full" />
            <LogoutButton allSessions className="btn-danger min-h-12 w-full" />
          </div>
        </div>
        <div className="grid gap-4 py-6 sm:grid-cols-2">{details.map(({ label, value, icon }) => <InfoTile key={label} label={label} value={value} icon={icon} />)}</div>
        <div className="rounded-3xl bg-pine-900 p-5 text-white"><p className="text-xs font-bold uppercase tracking-[.14em] text-pine-100">Standard monthly dues</p><p className="mt-1 text-3xl font-black">{money(profile.monthlyDuesAmount)}</p></div>
      </section>

      <section className="rounded-3xl border border-pine-100 bg-white p-5 shadow-soft">
        <PortalSectionHeader eyebrow="Access" title="My HOA accounts" />
        <p className="mb-4 text-sm leading-6 text-slate-600">
          Accounts are linked by your verified email address. Each selection creates a new tenant-scoped session, so records from different associations are never combined.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {linkedAccounts.map((account) => (
            <article key={account.userId} className={`rounded-2xl border p-4 ${account.current ? "border-pine-300 bg-pine-50" : "border-slate-200 bg-white"}`}>
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-900 text-white"><Building2 className="size-5" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-black text-ink">{account.tenantName}</p>
                  <p className="mt-0.5 text-xs font-bold text-pine-700">Homeowner</p>
                  {(account.accountNumber || account.propertyLabel) && (
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {account.accountNumber ? `Account ${account.accountNumber}` : ""}
                      {account.accountNumber && account.propertyLabel ? " · " : ""}
                      {account.propertyLabel || ""}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4">
                {account.current ? (
                  <span className="inline-flex min-h-10 items-center rounded-xl bg-pine-100 px-4 text-sm font-black text-pine-800">Current account</span>
                ) : (
                  <form action={switchLinkedAccountAction}>
                    <input type="hidden" name="targetUserId" value={account.userId} />
                    <button className="btn-secondary inline-flex min-h-10 items-center gap-2" type="submit">
                      <ArrowRightLeft className="size-4" aria-hidden="true" /> Open this account
                    </button>
                  </form>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-pine-100 bg-white p-5 shadow-soft">
        <PortalSectionHeader eyebrow="Property" title="Home and household" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{property.map(({ label, value, icon }) => <InfoTile key={label} label={label} value={value} icon={icon} />)}</div>
        <div className="mt-4">
          {householdMembers.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {householdMembers.map((member) => (
                <article key={member.id} className="rounded-2xl bg-slate-50 p-4">
                  <p className="font-black text-ink">{member.fullName}</p>
                  <p className="text-sm text-slate-500">{member.relationship}{member.birthDate ? ` | Born ${shortDate(member.birthDate)}` : ""}</p>
                  <p className="mt-2 text-xs font-bold text-pine-700">{member.validatedAt ? `Validated ${shortDate(member.validatedAt)}` : "Pending validation"}</p>
                </article>
              ))}
            </div>
          ) : (
            <CommunityEmptyState title="No household members listed" description="Validated household information will appear here when available." />
          )}
        </div>
      </section>
      <section className="rounded-3xl border border-pine-100 bg-white p-5 shadow-soft">
        <PortalSectionHeader eyebrow="Security" title="Passkeys" />
        <PasskeyEnrollmentPanel passkeyCount={passkeyCount} />
      </section>
    </PortalPageContainer>
  );
}
