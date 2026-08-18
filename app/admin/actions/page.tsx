import Link from "next/link";
import { BillStatus, ComplaintStatus, DocumentRequestStatus, PayrollStatus, PaymentRequestStatus, Role } from "@prisma/client";
import { CircleDollarSign, Clock3, FileCheck2, ShieldCheck, UsersRound, WalletCards } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceCard } from "@/components/ui/workspace-card";
import { refreshOverdueBills } from "@/lib/actions/billing";
import { requireUser } from "@/lib/auth";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";

const activeComplaintStatuses = [
  ComplaintStatus.SUBMITTED,
  ComplaintStatus.ACKNOWLEDGED,
  ComplaintStatus.TRIAGED,
  ComplaintStatus.ASSIGNED,
  ComplaintStatus.UNDER_REVIEW,
  ComplaintStatus.WAITING_FOR_INFORMATION,
  ComplaintStatus.ACTION_IN_PROGRESS,
  ComplaintStatus.REFERRED,
  ComplaintStatus.REOPENED,
];

type WorkItem = {
  key: string;
  label: string;
  description: string;
  count: number;
  href: string;
  owner: string;
  priority: "critical" | "high" | "normal";
};

export default async function ActionCenterPage() {
  const user = await requireUser(Role.ADMIN);
  const tenantId = user.tenantId;
  const permissions = new Set(user.permissions);

  if (permissions.has(Permission.BILLING_MANAGE)) await refreshOverdueBills();

  const canPayments = permissions.has(Permission.PAYMENTS_MANAGE);
  const canBilling = permissions.has(Permission.BILLING_MANAGE) || permissions.has(Permission.BILLING_READ);
  const canDocuments = permissions.has(Permission.DOCUMENTS_MANAGE) || permissions.has(Permission.DOCUMENTS_APPROVE);
  const canPayroll = permissions.has(Permission.PAYROLL_MANAGE);
  const canComplaints = permissions.has(Permission.COMPLAINTS_MANAGE);

  const [paymentReviews, documentReviews, overdueHomeowners, payrollPeriods, activeComplaints] = await Promise.all([
    canPayments ? prisma.paymentRequest.count({ where: { tenantId, status: PaymentRequestStatus.PENDING_REVIEW } }) : Promise.resolve(0),
    canDocuments ? prisma.documentRequest.count({ where: { tenantId, archivedAt: null, status: { in: [DocumentRequestStatus.SUBMITTED, DocumentRequestStatus.UNDER_REVIEW, DocumentRequestStatus.PENDING_APPROVAL] } } }) : Promise.resolve(0),
    canBilling ? prisma.bill.groupBy({ by: ["homeownerId"], where: { tenantId, archivedAt: null, status: BillStatus.OVERDUE, balance: { gt: 0 } } }).then((rows) => rows.length) : Promise.resolve(0),
    canPayroll ? prisma.payrollPeriod.count({ where: { tenantId, status: { in: [PayrollStatus.DRAFT, PayrollStatus.FINALIZED] } } }) : Promise.resolve(0),
    canComplaints ? prisma.complaint.count({ where: { tenantId, status: { in: activeComplaintStatuses } } }) : Promise.resolve(0),
  ]);

  const items: WorkItem[] = [
    canComplaints && { key: "complaints", label: "Open complaint cases", description: "Active complaint cases remain in their authoritative complaint/grievance workflows.", count: activeComplaints, href: "/admin/complaints", owner: "Authorized complaint team", priority: activeComplaints > 0 ? "high" : "normal" },
    canPayments && { key: "payments", label: "Payment verification", description: "Manual payment proofs awaiting finance review.", count: paymentReviews, href: "/admin/payments/requests?status=PENDING_REVIEW", owner: "Finance", priority: paymentReviews > 0 ? "high" : "normal" },
    canBilling && { key: "overdue", label: "Overdue homeowner accounts", description: "Homeowners with open past-due balances.", count: overdueHomeowners, href: "/admin/billing", owner: "Finance", priority: overdueHomeowners > 0 ? "high" : "normal" },
    canDocuments && { key: "documents", label: "Document requests", description: "Submitted, under-review, or pending-approval resident requests.", count: documentReviews, href: "/admin/documents?section=requests", owner: "Resident Services", priority: documentReviews > 0 ? "high" : "normal" },
    canPayroll && { key: "payroll", label: "Payroll periods", description: "Draft or finalized payroll periods requiring payroll administration attention.", count: payrollPeriods, href: "/admin/payroll", owner: "Payroll", priority: payrollPeriods > 0 ? "normal" : "normal" },
  ].filter(Boolean) as WorkItem[];

  const needsAction = items.reduce((sum, item) => sum + item.count, 0);
  const activeQueues = items.filter((item) => item.count > 0).length;
  const topItem = [...items].sort((left, right) => right.count - left.count)[0];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Community Operations"
        title="Action Center"
        description="One tenant-scoped queue for work that needs attention. HOAHub surfaces priorities here, while approvals and state changes remain inside their authoritative modules."
        context={<><StatusBadge tone={needsAction ? "warning" : "success"}>{needsAction ? `${needsAction} items need attention` : "No queued work"}</StatusBadge><StatusBadge tone="info">Tenant scoped</StatusBadge></>}
        actions={<Link className="btn-secondary" href="/admin/dashboard">Back to Dashboard</Link>}
      />

      <section aria-label="Action center summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Needs attention" value={needsAction} note="Across authorized operational queues" icon={ShieldCheck} tone={needsAction ? "amber" : "green"} />
        <MetricCard label="Active queues" value={activeQueues} note={`${items.length} queues visible to your role`} icon={Clock3} tone="blue" />
        <MetricCard label="Payment reviews" value={paymentReviews} note={canPayments ? "Manual proof verification" : "Not available to this role"} icon={WalletCards} tone={paymentReviews ? "amber" : "green"} href={canPayments ? "/admin/payments/requests" : undefined} />
        <MetricCard label="Resident requests" value={documentReviews} note={canDocuments ? "Documents awaiting processing" : "Not available to this role"} icon={FileCheck2} tone={documentReviews ? "violet" : "green"} href={canDocuments ? "/admin/documents?section=requests" : undefined} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <WorkspaceCard title="Priority work queue" description="Aggregated by module. Open an item to complete work in the existing server-authorized workflow." action={<StatusBadge tone={needsAction ? "warning" : "success"}>{needsAction ? `${needsAction} open` : "Clear"}</StatusBadge>}>
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <Link key={item.key} href={item.href} className="group grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[110px_minmax(0,1fr)_150px_84px] sm:items-center">
                <span><StatusBadge tone={item.count > 0 ? item.priority === "critical" ? "critical" : item.priority === "high" ? "warning" : "info" : "success"}>{item.count > 0 ? item.priority === "critical" ? "Critical" : item.priority === "high" ? "Needs action" : "Open" : "Clear"}</StatusBadge></span>
                <span className="min-w-0"><span className="block text-sm font-black text-slate-900 group-hover:text-pine-700">{item.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span></span>
                <span className="text-xs font-bold text-slate-500">{item.owner}</span>
                <span className="text-right text-sm font-black text-pine-700">{item.count} →</span>
              </Link>
            ))}
            {!items.length ? <p className="py-12 text-center text-sm text-slate-500">No operational queues are available to this role.</p> : null}
          </div>
        </WorkspaceCard>

        <div className="space-y-4">
          <WorkspaceCard title="Operational signal" description="Rule-based prioritization from the queues you are authorized to see.">
            <div className="rounded-2xl bg-gradient-to-br from-pine-900 via-platform-700 to-pine-700 p-5 text-white">
              <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-white/10"><CircleDollarSign className="size-5" aria-hidden="true" /></span><div><p className="text-xs font-black uppercase tracking-[.16em] text-leaf-100">Next focus</p><p className="mt-1 font-black">{topItem && topItem.count > 0 ? topItem.label : "Queues are clear"}</p></div></div>
              <p className="mt-4 text-sm leading-6 text-pine-50/85">{topItem && topItem.count > 0 ? `${topItem.count} item${topItem.count === 1 ? "" : "s"} are waiting in the largest visible queue. Use the module workflow to review and complete them.` : "No visible queue currently has outstanding work. Continue monitoring resident and finance activity."}</p>
            </div>
          </WorkspaceCard>

          <WorkspaceCard title="Resident account pressure" description="Finance signal from authoritative billing state.">
            <div className="flex items-center justify-between gap-4"><div><p className="text-3xl font-black tracking-tight text-pine-900">{overdueHomeowners}</p><p className="mt-1 text-sm text-slate-500">homeowner accounts overdue</p></div><UsersRound className="size-9 text-status-warning" aria-hidden="true" /></div>
            {canBilling ? <Link className="btn-secondary mt-5 w-full" href="/admin/billing">Review billing</Link> : null}
          </WorkspaceCard>
        </div>
      </section>
    </div>
  );
}
