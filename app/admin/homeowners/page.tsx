import Link from "next/link";
import type { ReactNode } from "react";
import { HomeownerActivationStatus, HomeownerStatus, NotificationType, Prisma, Role } from "@prisma/client";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/ui";
import { bulkSendHomeownerActivationInvitationsAction } from "@/lib/actions/homeowners";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { homeownerSearchWhere } from "@/lib/homeowner-admin-search";
import { activationInvitationExpiresAt, deliveryStatusLabel, digitalActivationLabel, homeownerDigitalActivationEligibility, maskAccountNumber, maskEmail } from "@/lib/services/homeowner-digital-activation";
import { money } from "@/lib/utils";

type HomeownerQuery = {
  q?: string;
  status?: string;
  digital?: string;
  page?: string;
  pageSize?: string;
};

const pageSizes = [25, 50, 100];
const digitalFilters = [
  ["all", "All"],
  ["not_invited", "Not Invited"],
  ["eligible", "Eligible"],
  ["invitation_sent", "Invitation Sent"],
  ["activation_in_progress", "Activation In Progress"],
  ["email_pending_verification", "Email Pending Verification"],
  ["password_creation_required", "Password Creation Required"],
  ["activated", "Activated"],
  ["expired", "Expired"],
  ["cancelled", "Cancelled"],
  ["disabled", "Disabled"],
  ["missing_registered_email", "Missing Registered Email"],
  ["existing_permanent_login", "Existing Permanent Login"],
] as const;

export default async function HomeownersPage({ searchParams }: { searchParams: Promise<HomeownerQuery> }) {
  const user = await requireUser(Role.ADMIN);
  const query = await searchParams;
  const pageSize = pageSizes.includes(Number(query.pageSize)) ? Number(query.pageSize) : 50;
  const page = Math.max(1, Number(query.page || 1) || 1);
  const operationalStatus = query.status === HomeownerStatus.ACTIVE || query.status === HomeownerStatus.INACTIVE ? query.status : "all";
  const digitalFilter = digitalFilters.some(([value]) => value === query.digital) ? query.digital || "all" : "all";
  const baseWhere: Prisma.HomeownerProfileWhereInput = { tenantId: user.tenantId };
  const filterParts = [
    baseWhere,
    operationalStatus === "all" ? {} : { status: operationalStatus as HomeownerStatus },
    digitalWhere(digitalFilter),
    homeownerSearchWhere(query.q || ""),
  ].filter((part) => Object.keys(part).length);
  const filteredWhere: Prisma.HomeownerProfileWhereInput = { AND: filterParts };
  const skip = (page - 1) * pageSize;

  const [totalCount, filteredCount, homeowners, summary] = await Promise.all([
    prisma.homeownerProfile.count({ where: baseWhere }),
    prisma.homeownerProfile.count({ where: filteredWhere }),
    prisma.homeownerProfile.findMany({
      where: filteredWhere,
      include: { user: true, _count: { select: { bills: true } } },
      orderBy: [{ user: { name: "asc" } }, { block: "asc" }, { lot: "asc" }],
      skip,
      take: pageSize,
    }),
    homeownerSummary(user.tenantId),
  ]);
  const recipientIds = homeowners.map((homeowner) => homeowner.userId);
  const deliveryLogs = recipientIds.length ? await prisma.notificationLog.findMany({
    where: { tenantId: user.tenantId, recipientId: { in: recipientIds }, type: NotificationType.WELCOME },
    orderBy: { createdAt: "desc" },
    select: { recipientId: true, status: true, createdAt: true, sentAt: true, errorMessage: true },
  }) : [];
  const latestDeliveryByUserId = new Map<string, (typeof deliveryLogs)[number]>();
  for (const log of deliveryLogs) if (!latestDeliveryByUserId.has(log.recipientId)) latestDeliveryByUserId.set(log.recipientId, log);
  const pageCount = Math.max(1, Math.ceil(filteredCount / pageSize));
  const safePage = Math.min(page, pageCount);
  const firstVisible = filteredCount ? skip + 1 : 0;
  const lastVisible = Math.min(skip + homeowners.length, filteredCount);

  return <><PageHeader eyebrow="Directory" title="Homeowners" description={`Showing ${firstVisible}-${lastVisible} of ${filteredCount} filtered homeowner${filteredCount === 1 ? "" : "s"} (${totalCount} total).`} action={<Link className="btn-primary" href="/admin/homeowners/new"><Plus className="size-4" /> Add homeowner</Link>} />
    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <SummaryCard label="Total Homeowners" value={summary.total} />
      <SummaryCard label="Eligible for First-Time Activation" value={summary.eligible} />
      <SummaryCard label="Invitation Sent" value={summary.invitationSent} />
      <SummaryCard label="Activated" value={summary.activated} />
      <SummaryCard label="Missing Email" value={summary.missingEmail} />
      <SummaryCard label="Disabled / Suspended Digital Access" value={summary.disabled} />
    </section>

    <form className="card mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_180px_240px_150px_auto]">
      <input className="field" name="q" type="search" defaultValue={query.q || ""} placeholder="Search name, email, account number, block or lot" />
      <select className="field" name="status" defaultValue={operationalStatus}>
        <option value="all">All operational statuses</option>
        <option value={HomeownerStatus.ACTIVE}>Active</option>
        <option value={HomeownerStatus.INACTIVE}>Inactive</option>
      </select>
      <select className="field" name="digital" defaultValue={digitalFilter}>
        {digitalFilters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <select className="field" name="pageSize" defaultValue={pageSize}>
        {pageSizes.map((size) => <option key={size} value={size}>{size} per page</option>)}
      </select>
      <div className="flex gap-2"><button className="btn-primary">Apply</button><Link className="btn-secondary" href="/admin/homeowners">Reset</Link></div>
    </form>

    <form action={bulkSendHomeownerActivationInvitationsAction}>
      <div className="mb-4 flex flex-wrap gap-3 rounded-xl border bg-white p-3">
        <ConfirmSubmitButton className="btn-primary min-h-9 px-3 py-1.5 text-xs" name="mode" value="selected" message="Send activation invitations to selected eligible homeowners?">Send to selected eligible homeowners</ConfirmSubmitButton>
        <p className="text-xs font-semibold text-slate-500">Only checked eligible homeowners on this page will be processed. Ineligible records remain visible with a reason.</p>
      </div>
      <div className="table-wrap"><table className="data-table min-w-[1150px]"><thead><tr><th></th><th>Homeowner</th><th>Masked Account</th><th>Property</th><th>Monthly dues</th><th>Operational Status</th><th>Digital Account Activation</th><th>Latest Delivery</th><th></th></tr></thead><tbody>
      {homeowners.map((homeowner) => {
        const accountNumber = homeownerAccountNumber(homeowner);
        const eligibility = homeownerDigitalActivationEligibility(homeowner);
        const expiration = activationInvitationExpiresAt(homeowner);
        const delivery = latestDeliveryByUserId.get(homeowner.userId) ?? null;
        return <tr key={homeowner.id}><td>{eligibility.eligible && <input aria-label={`Select ${homeowner.user.name}`} name="homeownerId" type="checkbox" value={homeowner.id} />}</td><td><p className="font-bold">{homeowner.user.name}</p><p className="text-xs text-slate-400">{maskEmail(homeowner.user.email)}</p></td><td className="font-mono text-xs font-bold">{maskAccountNumber(accountNumber)}</td><td>Block {homeowner.block}, Lot {homeowner.lot}</td><td className="font-bold">{money(homeowner.monthlyDuesAmount)}</td><td><StatusBadge status={homeowner.status} /></td><td><p className="font-bold">{digitalActivationLabel(homeowner.activationStatus)}</p><p className="text-xs text-slate-400">{emailLabel(homeowner.emailStatus)}</p><p className="text-xs text-slate-400">Sent: {homeowner.activationSentAt ? homeowner.activationSentAt.toLocaleDateString("en-PH") : "Not sent"}</p><p className="text-xs text-slate-400">Expires: {expiration ? expiration.toLocaleDateString("en-PH") : "Not set"}</p><p className={`mt-1 text-xs font-semibold ${eligibility.eligible ? "text-emerald-700" : "text-slate-400"}`}>{eligibility.reason}</p></td><td><p className="font-bold">{deliveryStatusLabel(delivery)}</p>{delivery?.errorMessage && <p className="text-xs text-rose-600">{delivery.errorMessage}</p>}</td><td className="text-right"><Link className="font-bold text-pine-600 hover:underline" href={`/admin/homeowners/${homeowner.id}`}>View & edit</Link></td></tr>;
      })}
      {!homeowners.length && <tr><td colSpan={9} className="py-12 text-center text-slate-500">No homeowners match the selected filters.</td></tr>}
    </tbody></table></div>
    </form>

    <nav className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3 text-sm font-semibold text-slate-600">
      <span>Page {safePage} of {pageCount}</span>
      <div className="flex gap-2">
        <PaginationLink disabled={safePage <= 1} query={query} page={safePage - 1}><ChevronLeft className="size-4" /> Previous</PaginationLink>
        <PaginationLink disabled={safePage >= pageCount} query={query} page={safePage + 1}>Next <ChevronRight className="size-4" /></PaginationLink>
      </div>
    </nav>
  </>;
}

function digitalWhere(value: string): Prisma.HomeownerProfileWhereInput {
  if (value === "not_invited") return { activationStatus: HomeownerActivationStatus.NOT_INVITED };
  if (value === "eligible") return eligibleWhere();
  if (value === "invitation_sent") return { activationStatus: { in: [HomeownerActivationStatus.INVITATION_SENT, HomeownerActivationStatus.PENDING_ACTIVATION] } };
  if (value === "activation_in_progress") return { activationStatus: HomeownerActivationStatus.ACTIVATION_IN_PROGRESS };
  if (value === "email_pending_verification") return { activationStatus: HomeownerActivationStatus.EMAIL_PENDING_VERIFICATION };
  if (value === "password_creation_required") return { activationStatus: HomeownerActivationStatus.PASSWORD_CREATION_REQUIRED };
  if (value === "activated") return { activationStatus: HomeownerActivationStatus.ACTIVE };
  if (value === "expired") return { activationStatus: HomeownerActivationStatus.EXPIRED };
  if (value === "cancelled") return { activationStatus: HomeownerActivationStatus.CANCELLED };
  if (value === "disabled") return { OR: [{ activationStatus: HomeownerActivationStatus.DISABLED }, { user: { active: false } }] };
  if (value === "missing_registered_email") return { user: { email: "" } };
  if (value === "existing_permanent_login") return { activationStatus: HomeownerActivationStatus.ACTIVE, activatedAt: { not: null } };
  return {};
}

function eligibleWhere(): Prisma.HomeownerProfileWhereInput {
  return {
    status: HomeownerStatus.ACTIVE,
    accountNumber: { not: null },
    activationStatus: { notIn: [HomeownerActivationStatus.ACTIVE, HomeownerActivationStatus.CANCELLED, HomeownerActivationStatus.DISABLED] },
    user: { active: true, email: { not: "" } },
  };
}

async function homeownerSummary(tenantId: string) {
  const [total, eligible, invitationSent, activated, missingEmail, disabled] = await Promise.all([
    prisma.homeownerProfile.count({ where: { tenantId } }),
    prisma.homeownerProfile.count({ where: { tenantId, ...eligibleWhere() } }),
    prisma.homeownerProfile.count({ where: { tenantId, activationStatus: { in: [HomeownerActivationStatus.INVITATION_SENT, HomeownerActivationStatus.PENDING_ACTIVATION] } } }),
    prisma.homeownerProfile.count({ where: { tenantId, activationStatus: HomeownerActivationStatus.ACTIVE } }),
    prisma.homeownerProfile.count({ where: { tenantId, user: { email: "" } } }),
    prisma.homeownerProfile.count({ where: { tenantId, OR: [{ activationStatus: HomeownerActivationStatus.DISABLED }, { user: { active: false } }] } }),
  ]);
  return { total, eligible, invitationSent, activated, missingEmail, disabled };
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border bg-white p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-pine-800">{value.toLocaleString("en-PH")}</p></div>;
}

function PaginationLink({ children, disabled, query, page }: { children: ReactNode; disabled: boolean; query: HomeownerQuery; page: number }) {
  const params = new URLSearchParams();
  for (const key of ["q", "status", "digital", "pageSize"] as const) if (query[key]) params.set(key, String(query[key]));
  params.set("page", String(page));
  if (disabled) return <span className="btn-secondary min-h-9 cursor-not-allowed px-3 py-1.5 text-xs opacity-50">{children}</span>;
  return <Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/admin/homeowners?${params.toString()}`}>{children}</Link>;
}

function emailLabel(value: string) {
  return value === "VERIFIED" ? "Registered email verified" : "Registered email unverified";
}
