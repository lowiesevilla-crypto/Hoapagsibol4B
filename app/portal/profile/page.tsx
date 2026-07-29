import { BadgeInfo, Home, Mail, MessageCircle, Phone, UserRound } from "lucide-react";
import { LogoutButton } from "@/components/auth-navigation-buttons";
import { PageHeader } from "@/components/page-header";
import { PasskeyEnrollmentPanel } from "@/components/passkey-enrollment-panel";
import { StatusBadge } from "@/components/status-badge";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";
import { money } from "@/lib/utils";

export default async function ProfilePage() {
  const profile = await requireHomeownerProfile();
  const passkeyCount = await prisma.userPasskeyCredential.count({ where: { userId: profile.userId, tenantId: profile.tenantId } });
  const details = [
    { label: "Account Number", value: homeownerAccountNumber(profile), icon: BadgeInfo }, { label: "Email", value: profile.user.email, icon: Mail }, { label: "Phone", value: profile.phone, icon: Phone },
    { label: "Address", value: profile.address, icon: Home }, { label: "Messenger ID", value: profile.messengerId || "Not provided", icon: MessageCircle },
  ];
  return <><PageHeader eyebrow="Account" title="My profile" description="Contact your HOA administrator to request corrections to this record." /><section className="card max-w-4xl"><div className="flex flex-col gap-5 border-b border-slate-100 pb-6 sm:flex-row sm:items-center"><span className="grid size-20 place-items-center rounded-2xl bg-pine-50 text-pine-700"><UserRound className="size-9" /></span><div className="min-w-0 flex-1"><h2 className="break-words text-2xl font-black">{profile.user.name}</h2><p className="text-sm text-slate-500">Block {profile.block}, Lot {profile.lot}</p><div className="mt-2"><StatusBadge status={profile.status} /></div></div><div className="grid w-full gap-2 sm:w-auto"><LogoutButton /><LogoutButton allSessions /></div></div><div className="grid gap-4 py-6 sm:grid-cols-2">{details.map(({ label, value, icon: Icon }) => <div className="rounded-xl bg-slate-50 p-4" key={label}><p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400"><Icon className="size-4" />{label}</p><p className="break-words font-bold">{value}</p></div>)}<PasskeyEnrollmentPanel passkeyCount={passkeyCount} /></div><div className="rounded-xl bg-pine-900 p-5 text-white"><p className="text-xs font-bold uppercase tracking-wider text-pine-100">Standard monthly dues</p><p className="mt-1 text-2xl font-black">{money(profile.monthlyDuesAmount)}</p></div></section></>;
}
