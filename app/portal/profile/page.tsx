import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  BadgeInfo,
  Building2,
  CalendarDays,
  ChevronDown,
  Home,
  KeyRound,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { LogoutButton } from "@/components/auth-navigation-buttons";
import { CommunityEmptyState } from "@/components/homeowner/community/community-cards";
import { ProfilePhotoUploader } from "@/components/homeowner/profile-photo-uploader";
import { PasskeyEnrollmentPanel } from "@/components/passkey-enrollment-panel";
import { PortalPageContainer } from "@/components/portal-mobile-shell";
import { StatusBadge } from "@/components/status-badge";
import { switchLinkedAccountAction } from "@/lib/actions/linked-accounts";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { listLinkedAccounts } from "@/lib/linked-accounts";
import { requireHomeownerProfile } from "@/lib/portal";
import { getHomeownerProfilePhoto } from "@/lib/services/homeowner-profile-photo";
import { money, shortDate } from "@/lib/utils";

export default async function ProfilePage() {
  const profile = await requireHomeownerProfile();
  const [passkeyCount, householdMembers, linkedAccounts, photo] = await Promise.all([
    prisma.userPasskeyCredential.count({ where: { userId: profile.userId, tenantId: profile.tenantId } }),
    prisma.householdMember.findMany({
      where: { tenantId: profile.tenantId, homeownerId: profile.id, active: true, revokedAt: null },
      select: { id: true, fullName: true, relationship: true, birthDate: true, validatedAt: true },
      orderBy: [{ fullName: "asc" }],
      take: 8,
    }),
    listLinkedAccounts(profile.user.email, profile.userId),
    getHomeownerProfilePhoto(profile.tenantId, profile.userId),
  ]);

  const contactDetails = [
    { label: "Email", value: profile.user.email, icon: Mail },
    { label: "Phone", value: profile.phone, icon: Phone },
    ...(profile.messengerId ? [{ label: "Messenger", value: profile.messengerId, icon: MessageCircle }] : []),
  ];
  const propertyDetails = [
    { label: "Address", value: profile.address, icon: Home },
    { label: "Phase", value: profile.phase, icon: BadgeInfo },
    { label: "Property type", value: profile.propertyType, icon: Home },
    { label: "Occupancy", value: profile.occupancyStatus, icon: ShieldCheck },
    { label: "Residency date", value: profile.residencyDate ? shortDate(profile.residencyDate) : null, icon: CalendarDays },
  ].filter((item) => Boolean(item.value));

  return (
    <PortalPageContainer className="space-y-4">
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
        <div className="flex items-center gap-4">
          <ProfilePhotoUploader name={profile.user.name} initialVersion={photo?.updatedAt.toISOString() ?? null} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-pine-700">Profile</p>
            <h1 className="mt-1 break-words text-xl font-black leading-tight text-ink sm:text-2xl">{profile.user.name}</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">Block {profile.block} · Lot {profile.lot}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge status={profile.status} />
              {profile.activationStatus !== "ACTIVE" && <StatusBadge status={profile.activationStatus} />}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
          <div className="min-w-0 rounded-2xl bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Account</p>
            <p className="mt-1 truncate text-sm font-black text-slate-900">{homeownerAccountNumber(profile)}</p>
          </div>
          <div className="min-w-0 rounded-2xl bg-pine-50 px-3 py-3">
            <p className="text-[11px] font-black uppercase tracking-wide text-pine-600">Monthly dues</p>
            <p className="mt-1 text-sm font-black text-pine-900">{money(profile.monthlyDuesAmount)}</p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
        <div className="px-4 pb-2 pt-4 sm:px-5">
          <h2 className="text-base font-black text-ink">Contact</h2>
        </div>
        <div className="divide-y divide-slate-100 px-4 pb-2 sm:px-5">
          {contactDetails.map((item) => <CompactDetail key={item.label} {...item} />)}
        </div>
      </section>

      {linkedAccounts.length > 1 && (
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><Building2 className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0"><h2 className="font-black text-ink">HOA accounts</h2><p className="text-xs font-semibold text-slate-500">Switch account</p></div>
          </div>
          <div className="space-y-2">
            {linkedAccounts.map((account) => (
              <article key={account.userId} className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-3 ${account.current ? "border-pine-200 bg-pine-50" : "border-slate-100 bg-slate-50/60"}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900">{account.tenantName}</p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{account.accountNumber ? `Account ${account.accountNumber}` : account.propertyLabel || "Homeowner"}</p>
                </div>
                {account.current ? (
                  <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-pine-700">Current</span>
                ) : (
                  <form action={switchLinkedAccountAction}>
                    <input type="hidden" name="targetUserId" value={account.userId} />
                    <button className="grid size-10 place-items-center rounded-full bg-white text-pine-700 shadow-sm" type="submit" aria-label={`Open ${account.tenantName}`}>
                      <ArrowRightLeft className="size-4" aria-hidden="true" />
                    </button>
                  </form>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <details className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pine-500 [&::-webkit-details-marker]:hidden sm:px-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><Home className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-black text-ink">Home & household</h2>
            <p className="truncate text-xs font-semibold text-slate-500">Block {profile.block}, Lot {profile.lot} · {householdMembers.length} member{householdMembers.length === 1 ? "" : "s"}</p>
          </div>
          <ChevronDown className="size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-slate-100 px-4 pb-4 sm:px-5">
          <div className="divide-y divide-slate-100">
            {propertyDetails.map((item) => <CompactDetail key={item.label} {...item} />)}
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="mb-3 flex items-center gap-2"><UsersRound className="size-4 text-pine-700" aria-hidden="true" /><h3 className="text-sm font-black text-slate-900">Household</h3></div>
            {householdMembers.length ? (
              <div className="space-y-2">
                {householdMembers.map((member) => (
                  <article key={member.id} className="rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{member.fullName}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">{member.relationship}{member.birthDate ? ` · ${shortDate(member.birthDate)}` : ""}</p></div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${member.validatedAt ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{member.validatedAt ? "Validated" : "Pending"}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <CommunityEmptyState title="No household members" description="Household members will appear here when added." />
            )}
          </div>
        </div>
      </details>

      <details className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pine-500 [&::-webkit-details-marker]:hidden sm:px-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700"><KeyRound className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1"><h2 className="font-black text-ink">Security</h2><p className="text-xs font-semibold text-slate-500">{passkeyCount} passkey{passkeyCount === 1 ? "" : "s"}</p></div>
          <ChevronDown className="size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-slate-100 p-4 sm:p-5"><PasskeyEnrollmentPanel passkeyCount={passkeyCount} /></div>
      </details>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
        <div className="mb-3 flex items-center gap-2"><WalletCards className="size-4 text-slate-500" aria-hidden="true" /><h2 className="text-sm font-black text-slate-900">Account access</h2></div>
        <div className="grid grid-cols-2 gap-2">
          <LogoutButton className="btn-secondary min-h-11 w-full" />
          <LogoutButton allSessions className="btn-danger min-h-11 w-full" />
        </div>
      </section>
    </PortalPageContainer>
  );
}

function CompactDetail({ label, value, icon: Icon }: { label: string; value: string | null | undefined; icon: LucideIcon }) {
  return (
    <div className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)] items-center gap-3 py-3">
      <span className="grid size-9 place-items-center rounded-xl bg-slate-50 text-slate-500"><Icon className="size-4" aria-hidden="true" /></span>
      <div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-0.5 break-words text-sm font-bold text-slate-900">{value || "—"}</p></div>
    </div>
  );
}
