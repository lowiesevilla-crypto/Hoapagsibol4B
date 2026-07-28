import Link from "next/link";
import { NotificationType, Role } from "@prisma/client";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton, SearchInput } from "@/components/ui";
import { bulkSendHomeownerActivationInvitationsAction } from "@/lib/actions/homeowners";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { activationInvitationExpiresAt, deliveryStatusLabel, digitalActivationLabel, homeownerDigitalActivationEligibility, maskAccountNumber, maskEmail } from "@/lib/services/homeowner-digital-activation";
import { money } from "@/lib/utils";

export default async function HomeownersPage() {
  const user = await requireUser(Role.ADMIN);
  const homeowners = await prisma.homeownerProfile.findMany({ where: { tenantId: user.tenantId }, include: { user: true, _count: { select: { bills: true } } }, orderBy: { user: { name: "asc" } } });
  const recipientIds = homeowners.map((homeowner) => homeowner.userId);
  const deliveryLogs = recipientIds.length ? await prisma.notificationLog.findMany({
    where: { tenantId: user.tenantId, recipientId: { in: recipientIds }, type: NotificationType.WELCOME },
    orderBy: { createdAt: "desc" },
    select: { recipientId: true, status: true, createdAt: true, sentAt: true, errorMessage: true },
  }) : [];
  const latestDeliveryByUserId = new Map<string, (typeof deliveryLogs)[number]>();
  for (const log of deliveryLogs) if (!latestDeliveryByUserId.has(log.recipientId)) latestDeliveryByUserId.set(log.recipientId, log);
  const eligibleCount = homeowners.filter((homeowner) => homeownerDigitalActivationEligibility(homeowner).eligible).length;
  return <><PageHeader eyebrow="Directory" title="Homeowners" description={`${homeowners.length} registered household${homeowners.length === 1 ? "" : "s"}.`} action={<Link className="btn-primary" href="/admin/homeowners/new"><Plus className="size-4" /> Add homeowner</Link>} />
    <div className="mb-4"><SearchInput placeholder="Search name, email, account number, block or lot" /></div>
    <form action={bulkSendHomeownerActivationInvitationsAction}>
      <div className="mb-4 flex flex-wrap gap-3 rounded-xl border bg-white p-3">
        <ConfirmSubmitButton className="btn-primary min-h-9 px-3 py-1.5 text-xs" name="mode" value="selected" message="Send activation invitations to selected eligible homeowners?">Send to selected homeowners</ConfirmSubmitButton>
        <ConfirmSubmitButton className="btn-secondary min-h-9 px-3 py-1.5 text-xs" name="mode" value="allEligible" message={`Send activation invitations to all ${eligibleCount} eligible homeowners in this tenant?`}>Send to all eligible filtered homeowners</ConfirmSubmitButton>
        <p className="text-xs font-semibold text-slate-500">{eligibleCount} eligible for first-time digital activation.</p>
      </div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th></th><th>Homeowner</th><th>Masked Account</th><th>Property</th><th>Monthly dues</th><th>Operational Status</th><th>Digital Account Activation</th><th>Latest Delivery</th><th></th></tr></thead><tbody>
      {homeowners.map((homeowner) => {
        const accountNumber = homeownerAccountNumber(homeowner);
        const eligibility = homeownerDigitalActivationEligibility(homeowner);
        const expiration = activationInvitationExpiresAt(homeowner);
        const delivery = latestDeliveryByUserId.get(homeowner.userId) ?? null;
        return <tr key={homeowner.id} data-search={`${homeowner.user.name} ${homeowner.user.email} ${accountNumber} ${homeowner.block} ${homeowner.lot} ${homeowner.status} ${homeowner.activationStatus} ${homeowner.emailStatus}`.toLowerCase()}><td>{eligibility.eligible && <input aria-label={`Select ${homeowner.user.name}`} name="homeownerId" type="checkbox" value={homeowner.id} />}</td><td><p className="font-bold">{homeowner.user.name}</p><p className="text-xs text-slate-400">{maskEmail(homeowner.user.email)}</p></td><td className="font-mono text-xs font-bold">{maskAccountNumber(accountNumber)}</td><td>Block {homeowner.block}, Lot {homeowner.lot}</td><td className="font-bold">{money(homeowner.monthlyDuesAmount)}</td><td><StatusBadge status={homeowner.status} /></td><td><p className="font-bold">{digitalActivationLabel(homeowner.activationStatus)}</p><p className="text-xs text-slate-400">{emailLabel(homeowner.emailStatus)}</p><p className="text-xs text-slate-400">Sent: {homeowner.activationSentAt ? homeowner.activationSentAt.toLocaleDateString("en-PH") : "Not sent"}</p><p className="text-xs text-slate-400">Expires: {expiration ? expiration.toLocaleDateString("en-PH") : "Not set"}</p><p className={`mt-1 text-xs font-semibold ${eligibility.eligible ? "text-emerald-700" : "text-slate-400"}`}>{eligibility.reason}</p></td><td><p className="font-bold">{deliveryStatusLabel(delivery)}</p>{delivery?.errorMessage && <p className="text-xs text-rose-600">{delivery.errorMessage}</p>}</td><td className="text-right"><Link className="font-bold text-pine-600 hover:underline" href={`/admin/homeowners/${homeowner.id}`}>View & edit</Link></td></tr>;
      })}
      {!homeowners.length && <tr><td colSpan={9} className="py-12 text-center text-slate-500">No homeowners yet. Add the first profile to begin.</td></tr>}
    </tbody></table></div>
    </form>
  </>;
}

function emailLabel(value: string) {
  return value === "VERIFIED" ? "Registered email verified" : "Registered email unverified";
}
