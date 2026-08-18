import Link from "next/link";
import { DocumentRequestStatus, Role } from "@prisma/client";
import { Banknote, CarFront, FileText, Home, ReceiptText, ShieldCheck, UsersRound } from "lucide-react";
import { notFound } from "next/navigation";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceCard } from "@/components/ui/workspace-card";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { digitalActivationLabel, maskAccountNumber, maskEmail } from "@/lib/services/homeowner-digital-activation";
import { money, shortDate } from "@/lib/utils";

const activeDocumentStatuses = [
  DocumentRequestStatus.SUBMITTED,
  DocumentRequestStatus.PENDING_PAYMENT,
  DocumentRequestStatus.PAYMENT_CONFIRMED,
  DocumentRequestStatus.PENDING_APPROVAL,
  DocumentRequestStatus.UNDER_REVIEW,
  DocumentRequestStatus.APPROVED,
  DocumentRequestStatus.GENERATING,
  DocumentRequestStatus.ISSUED,
  DocumentRequestStatus.GENERATED,
  DocumentRequestStatus.RETURNED_FOR_CORRECTION,
];

export default async function Resident360Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(Role.ADMIN);
  const { id } = await params;
  const homeowner = await prisma.homeownerProfile.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { user: true, householdMembers: { where: { active: true }, select: { id: true } } },
  });
  if (!homeowner) notFound();

  const [balance, lastPayment, paymentCount, documentCount, activeDocuments, vehicleCount, latestDocuments] = await Promise.all([
    prisma.bill.aggregate({ where: { tenantId: user.tenantId, homeownerId: id, archivedAt: null, balance: { gt: 0 } }, _sum: { balance: true } }),
    prisma.payment.findFirst({ where: { tenantId: user.tenantId, homeownerId: id, status: "ACTIVE" }, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }], select: { id: true, amount: true, paymentDate: true, receiptNumber: true } }),
    prisma.payment.count({ where: { tenantId: user.tenantId, homeownerId: id, status: "ACTIVE" } }),
    prisma.documentRequest.count({ where: { tenantId: user.tenantId, homeownerId: id, archivedAt: null } }),
    prisma.documentRequest.count({ where: { tenantId: user.tenantId, homeownerId: id, archivedAt: null, status: { in: activeDocumentStatuses } } }),
    prisma.vehicle.count({ where: { tenantId: user.tenantId, homeownerId: id } }),
    prisma.documentRequest.findMany({ where: { tenantId: user.tenantId, homeownerId: id, archivedAt: null }, take: 4, orderBy: { requestedAt: "desc" }, select: { id: true, status: true, requestedAt: true, documentNumber: true, definition: { select: { displayName: true } }, configuration: { select: { displayName: true } } } }),
  ]);

  const currentBalance = Number(balance._sum.balance ?? 0);
  const accountHealthy = currentBalance <= 0 && homeowner.status === "ACTIVE";
  const accountNumber = homeownerAccountNumber(homeowner);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Resident Intelligence"
        title="Resident 360"
        description="A tenant-scoped relationship view of the homeowner's identity, account health, payments, documents, registered assets, and household profile."
        context={<><StatusBadge tone={accountHealthy ? "success" : currentBalance > 0 ? "warning" : "neutral"}>{accountHealthy ? "Healthy account" : currentBalance > 0 ? "Balance outstanding" : homeowner.status}</StatusBadge><StatusBadge tone={homeowner.user.active ? "info" : "warning"}>{digitalActivationLabel(homeowner.activationStatus)}</StatusBadge></>}
        actions={<><Link className="btn-secondary" href={`/admin/homeowners/${homeowner.id}`}><UsersRound className="size-4" /> Manage Profile & Access</Link><Link className="btn-secondary" href={`/admin/homeowners/${homeowner.id}/soa`}><FileText className="size-4" /> Statement of Account</Link></>}
      />

      <section className="overflow-hidden rounded-workspace bg-gradient-to-r from-pine-900 via-platform-700 to-pine-700 p-5 text-white shadow-floating sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-3xl bg-white/10 text-xl font-black ring-1 ring-white/15">{initials(homeowner.user.name)}</span>
            <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[.16em] text-leaf-100">Homeowner</p><h2 className="mt-1 break-words text-2xl font-black sm:text-3xl">{homeowner.user.name}</h2><p className="mt-2 text-sm text-pine-50/80">Block {homeowner.block} · Lot {homeowner.lot} · Account {maskAccountNumber(accountNumber)}</p></div>
          </div>
          <div className="grid shrink-0 gap-2 text-sm sm:text-right"><span className="font-black">{maskEmail(homeowner.user.email)}</span><span className="text-pine-100/75">{homeowner.status} resident record</span></div>
        </div>
      </section>

      <section aria-label="Resident account snapshot" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Current balance" value={money(currentBalance)} note={currentBalance > 0 ? "Open homeowner billing balance" : "No open billing balance"} icon={Banknote} tone={currentBalance > 0 ? "amber" : "green"} href={`/admin/homeowners/${id}/soa`} />
        <MetricCard label="Last payment" value={lastPayment ? money(lastPayment.amount) : "—"} note={lastPayment ? `${shortDate(lastPayment.paymentDate)}${lastPayment.receiptNumber ? ` · ${lastPayment.receiptNumber}` : ""}` : "No posted payment yet"} icon={ReceiptText} tone="blue" href="/admin/payments/history" />
        <MetricCard label="Active requests" value={activeDocuments} note={`${documentCount} document request${documentCount === 1 ? "" : "s"} total`} icon={FileText} tone={activeDocuments ? "violet" : "green"} href="/admin/documents?section=requests" />
        <MetricCard label="Registered vehicles" value={vehicleCount} note={`${homeowner.householdMembers.length} active household member${homeowner.householdMembers.length === 1 ? "" : "s"}`} icon={CarFront} tone="blue" href="/admin/vehicles" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <WorkspaceCard title="Resident relationship snapshot" description="Operational information already authorized to tenant administrators.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Snapshot icon={Home} label="Property" value={`Block ${homeowner.block}, Lot ${homeowner.lot}`} />
            <Snapshot icon={ShieldCheck} label="Operational status" value={homeowner.status} />
            <Snapshot icon={UsersRound} label="Household members" value={String(homeowner.householdMembers.length)} />
            <Snapshot icon={ReceiptText} label="Posted payments" value={String(paymentCount)} />
            <Snapshot icon={FileText} label="Document requests" value={String(documentCount)} />
            <Snapshot icon={CarFront} label="Vehicles" value={String(vehicleCount)} />
          </div>
        </WorkspaceCard>

        <WorkspaceCard title="Recent service activity" description="Latest resident document activity.">
          <div className="divide-y divide-slate-100">
            {latestDocuments.map((request) => <Link key={request.id} href={`/admin/documents?section=requests`} className="block py-3 first:pt-0 last:pb-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{request.definition?.displayName ?? request.configuration?.displayName ?? "Document request"}</p><p className="mt-1 text-xs text-slate-500">{request.documentNumber || "Request"} · {shortDate(request.requestedAt)}</p></div><StatusBadge tone={request.status === DocumentRequestStatus.GENERATED || request.status === DocumentRequestStatus.ISSUED ? "success" : "info"}>{request.status.replaceAll("_", " ")}</StatusBadge></div></Link>)}
            {!latestDocuments.length ? <p className="py-8 text-center text-sm text-slate-500">No document activity recorded.</p> : null}
          </div>
        </WorkspaceCard>
      </section>
    </div>
  );
}

function Snapshot({ icon: Icon, label, value }: { icon: typeof Home; label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-100 bg-surface-subtle p-4"><span className="grid size-9 place-items-center rounded-xl bg-white text-pine-700 shadow-sm"><Icon className="size-4" aria-hidden="true" /></span><p className="mt-3 text-xs font-black uppercase tracking-[.12em] text-slate-400">{label}</p><p className="mt-1 break-words font-black text-pine-900">{value}</p></div>;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "HO";
}
