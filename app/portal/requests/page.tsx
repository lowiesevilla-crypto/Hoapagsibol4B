import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";
import Link from "next/link";
import { ComplaintPrivacyMode, ComplaintStatus, DocumentRequestStatus, DocumentType, Prisma, TenantModule } from "@prisma/client";
import { FileCheck2, FileQuestion, MessageSquarePlus, ShieldCheck } from "lucide-react";
import { ComplaintRequestCard, DocumentRequestCard, RequestAreaNavigation, RequestEmptyState, RequestMetricCard, requestTone, statusLabel } from "@/components/homeowner/requests/request-cards";
import { PortalPageContainer, PortalQuickActionTile, PortalSectionHeader } from "@/components/portal-mobile-shell";

import { prisma } from "@/lib/db";
import { resolveHomeownerNavigation } from "@/lib/homeowner-navigation";
import { resolveDocumentDownloadAccess } from "@/lib/services/document-balance-policy";
import { documentFeePaymentStatusLabel, documentRequestPublicReference } from "@/lib/services/document-fee-payments";
import { documentTypeLabel } from "@/lib/services/documents";
import { complaintPrivacyLabel } from "@/lib/services/complaints";
import { getEnabledTenantModules } from "@/lib/tenant";
import { money, shortDate } from "@/lib/utils";

const REQUEST_LIMIT = 8;

export default async function PortalRequestsPage() {
  const user = await requirePermission(Permission.DOCUMENTS_REQUEST);
  const profile = user.homeownerProfile;
  if (!profile) throw new Error("Homeowner profile not found.");
  const enabledModules = await getEnabledTenantModules(user.tenantId);
  const navigation = resolveHomeownerNavigation(enabledModules);
  const hasDocuments = enabledModules.has(TenantModule.DOCUMENTS);
  const hasComplaints = enabledModules.has(TenantModule.COMPLAINTS);
  const q = "";
  const category = "all";
  const status = "open";
  const showDocuments = hasDocuments && ["all", "documents", "gate", "move"].includes(category);
  const showComplaints = hasComplaints && ["all", "complaints"].includes(category);
  const documentWhere = showDocuments ? buildDocumentWhere(user.tenantId, profile.id, q, status, category) : null;
  const complaintWhere = showComplaints ? buildComplaintWhere(user.tenantId, user.id, profile.id, q, status) : null;
  const [unpaid, documentRequests, documentCount, complaintRequests, complaintCount] = await Promise.all([
    prisma.bill.aggregate({ where: { tenantId: user.tenantId, homeownerId: profile.id, archivedAt: null, balance: { gt: 0 } }, _sum: { balance: true } }),
    documentWhere ? prisma.documentRequest.findMany({
      where: documentWhere,
      include: { definition: true, configuration: true, paymentRequest: { include: { collection: true } }, versions: { orderBy: { version: "desc" }, take: 1 } },
      orderBy: [{ updatedAt: "desc" }, { requestedAt: "desc" }],
      take: REQUEST_LIMIT,
    }) : Promise.resolve([]),
    documentWhere ? prisma.documentRequest.count({ where: documentWhere }) : Promise.resolve(0),
    complaintWhere ? prisma.complaint.findMany({
      where: complaintWhere,
      include: { category: true, _count: { select: { messages: true, attachments: true } } },
      orderBy: [{ updatedAt: "desc" }, { submittedAt: "desc" }],
      take: REQUEST_LIMIT,
    }) : Promise.resolve([]),
    complaintWhere ? prisma.complaint.count({ where: complaintWhere }) : Promise.resolve(0),
  ]);
  const unpaidBalance = Number(unpaid._sum.balance ?? 0);
  const activeDocuments = documentRequests.filter((item) => !terminalDocumentStatuses.has(item.status)).length;
  const activeComplaints = complaintRequests.filter((item) => !terminalComplaintStatuses.has(item.status)).length;
  const documentLink = navigation.requestLinks.find((link) => link.module === TenantModule.DOCUMENTS);
  const complaintLink = navigation.requestLinks.find((link) => link.href === "/portal/complaints/new");
  const actions = [
    documentLink && { href: documentLink.href, label: "New Document Request", description: "Certificates, clearances, Gate Pass, and Move-In/Move-Out requests.", icon: FileQuestion },
    documentLink && { href: documentLink.href, label: "Gate Pass", description: "Use the existing document request flow for gate passes.", icon: ShieldCheck },
    documentLink && { href: documentLink.href, label: "Move-In / Move-Out", description: "Use the existing document request flow for move passes.", icon: FileCheck2 },
    complaintLink && { href: complaintLink.href, label: "Submit Complaint", description: "Send a named, confidential, or anonymous complaint.", icon: MessageSquarePlus },
  ].filter(Boolean);

  return (
    <PortalPageContainer className="space-y-6">
      <RequestAreaNavigation active="requests" />
      <section className="grid gap-3 md:grid-cols-3">
        <RequestMetricCard label="Open Requests" value={String(activeDocuments + activeComplaints)} note="Documents and complaints needing action or review" icon={FileQuestion} tone={activeDocuments + activeComplaints ? "warning" : "success"} />
        <RequestMetricCard label="Documents" value={String(documentCount)} note={hasDocuments ? "Tenant-scoped document requests" : "Document module disabled"} icon={FileCheck2} tone={hasDocuments ? "info" : "default"} />
        <RequestMetricCard label="Complaints" value={String(complaintCount)} note={hasComplaints ? "Homeowner-visible complaint cases" : "Complaint module disabled"} icon={MessageSquarePlus} tone={hasComplaints ? "info" : "default"} />
      </section>

      <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
        <PortalSectionHeader eyebrow="Request center" title="Choose a service" />
        <p className="text-sm leading-6 text-slate-600">Recent homeowner-owned requests appear below. Use Documents for certificates, Gate Pass, and Move-In/Move-Out requests, or Complaints for case history and intake.</p>
      </section>

      {actions.length > 0 ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {actions.map((action) => action && <PortalQuickActionTile key={`${action.href}-${action.label}`} {...action} />)}
        </section>
      ) : (
        <RequestEmptyState title="No request services are enabled" description="Document requests and complaint services will appear here when they are included in your association plan." />
      )}

      <section className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
          <PortalSectionHeader eyebrow={`${documentCount} matching`} title="Document Requests" action={<Link href="/portal/documents" className="text-sm font-black text-pine-700">Open documents</Link>} />
          <div className="space-y-3">
            {documentRequests.map((item) => {
              const access = resolveDocumentDownloadAccess({ request: item, currentOutstandingBalance: unpaidBalance });
              const downloadable = Boolean(item.generatedContent && access.downloadAllowed);
              const title = item.definition?.displayName || item.configuration?.displayName || documentTypeLabel(item.type);
              return <DocumentRequestCard key={item.id} title={title} reference={item.documentNumber || documentRequestPublicReference(item)} status={statusLabel(item.status)} statusTone={requestTone(item.status)} requested={shortDate(item.requestedAt)} subject={subjectLabel(item.subjectSnapshot)} purpose={item.purpose || "Official HOA request"} fee={money(Number(item.feeAmountSnapshot))} paymentStatus={documentFeePaymentStatusLabel(item)} href={item.generatedContent ? `/documents/${item.id}` : "/portal/documents"} downloadHref={downloadable ? `/documents/${item.id}/pdf` : undefined} printHref={downloadable ? `/documents/${item.id}/print` : undefined} />;
            })}
            {!documentRequests.length && <RequestEmptyState title="No matching document requests" description="Gate Pass, Move-In/Move-Out, certificates, and other document requests will appear here." />}
          </div>
        </section>

        <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
          <PortalSectionHeader eyebrow={`${complaintCount} matching`} title="Complaints" action={<Link href="/portal/complaints" className="text-sm font-black text-pine-700">Open complaints</Link>} />
          <div className="space-y-3">
            {complaintRequests.map((item) => <ComplaintRequestCard key={item.id} title={item.title} reference={item.complaintNumber || item.publicReference} status={statusLabel(item.status)} statusTone={requestTone(item.status)} privacy={complaintPrivacyLabel(item.privacyMode)} category={item.category?.name || "General"} submitted={shortDate(item.submittedAt)} activity={`${item._count.messages} messages · ${item._count.attachments} attachments`} href={`/portal/complaints/${item.id}`} />)}
            {!complaintRequests.length && <RequestEmptyState title="No matching complaints" description="Named and confidential complaints from your homeowner account will appear here." icon={MessageSquarePlus} />}
          </div>
        </section>
      </section>
    </PortalPageContainer>
  );
}

const terminalDocumentStatuses = new Set<DocumentRequestStatus>([DocumentRequestStatus.REJECTED, DocumentRequestStatus.CANCELLED, DocumentRequestStatus.REVOKED, DocumentRequestStatus.DOWNLOADED]);
const terminalComplaintStatuses = new Set<ComplaintStatus>([ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED, ComplaintStatus.WITHDRAWN, ComplaintStatus.ARCHIVED, ComplaintStatus.REJECTED]);

function buildDocumentWhere(tenantId: string, homeownerId: string, q: string, status: string, category: string): Prisma.DocumentRequestWhereInput {
  const where: Prisma.DocumentRequestWhereInput = { tenantId, homeownerId, archivedAt: null };
  if (status === "open") where.status = { notIn: [...terminalDocumentStatuses] };
  if (status === "ready") where.status = { in: [DocumentRequestStatus.APPROVED, DocumentRequestStatus.ISSUED, DocumentRequestStatus.READY_FOR_DOWNLOAD, DocumentRequestStatus.GENERATED, DocumentRequestStatus.DOWNLOADED] };
  if (status === "closed") where.status = { in: [...terminalDocumentStatuses] };
  if (category === "gate") where.OR = [{ type: DocumentType.GATE_PASS }, { definition: { is: { displayName: { contains: "Gate" } } } }];
  if (category === "move") where.OR = [{ type: DocumentType.MOVE_IN_OUT_PASS }, { definition: { is: { displayName: { contains: "Move" } } } }];
  if (q) {
    const search = [
      { id: { contains: q } },
      { documentNumber: { contains: q } },
      { purpose: { contains: q } },
      { definition: { is: { displayName: { contains: q } } } },
      { configuration: { is: { displayName: { contains: q } } } },
    ];
    where.AND = [...(Array.isArray(where.AND) ? where.AND : []), { OR: search }];
  }
  return where;
}

function buildComplaintWhere(tenantId: string, userId: string, homeownerId: string, q: string, status: string): Prisma.ComplaintWhereInput {
  const where: Prisma.ComplaintWhereInput = {
    tenantId,
    OR: [
      { privacyMode: ComplaintPrivacyMode.NAMED, submittedById: userId },
      { privacyMode: ComplaintPrivacyMode.NAMED, homeownerId },
      { privacyMode: ComplaintPrivacyMode.CONFIDENTIAL, confidentialIdentity: { is: { userId } } },
      { privacyMode: ComplaintPrivacyMode.CONFIDENTIAL, confidentialIdentity: { is: { homeownerId } } },
    ],
  };
  if (status === "open") where.status = { notIn: [...terminalComplaintStatuses] };
  if (status === "ready") where.status = { in: [ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED] };
  if (status === "closed") where.status = { in: [...terminalComplaintStatuses] };
  if (q) {
    where.AND = [{ OR: [{ title: { contains: q } }, { complaintNumber: { contains: q } }, { publicReference: { contains: q } }, { category: { is: { name: { contains: q } } } }] }];
  }
  return where;
}

function subjectLabel(value: unknown) {
  const subject = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return String(subject.fullName || "Registered homeowner");
}
