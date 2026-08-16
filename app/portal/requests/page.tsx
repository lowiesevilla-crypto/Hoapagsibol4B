import Link from "next/link";
import { ComplaintPrivacyMode, ComplaintStatus, DocumentRequestStatus, DocumentType, Prisma, Role, TenantModule } from "@prisma/client";
import { FileCheck2, FileQuestion, MessageSquarePlus } from "lucide-react";
import { ComplaintRequestCard, DocumentRequestCard, RequestAreaNavigation, RequestEmptyState, RequestMetricCard, requestTone, statusLabel } from "@/components/homeowner/requests/request-cards";
import { PortalPageContainer, PortalQuickActionTile, PortalSectionHeader } from "@/components/portal-mobile-shell";
import { requireUser } from "@/lib/auth";
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
  const user = await requireUser(Role.HOMEOWNER);
  const profile = user.homeownerProfile;
  if (!profile) throw new Error("Homeowner profile not found.");
  const enabledModules = await getEnabledTenantModules(user.tenantId);
  const navigation = resolveHomeownerNavigation(enabledModules);
  const hasDocuments = enabledModules.has(TenantModule.DOCUMENTS);
  const hasComplaints = enabledModules.has(TenantModule.COMPLAINTS);
  const documentWhere = hasDocuments ? buildDocumentWhere(user.tenantId, profile.id, "", "open", "all") : null;
  const complaintWhere = hasComplaints ? buildComplaintWhere(user.tenantId, user.id, profile.id, "", "open") : null;

  const [unpaid, documentRequests, documentCount, complaintRequests, complaintCount] = await Promise.all([
    prisma.bill.aggregate({ where: { tenantId: user.tenantId, homeownerId: profile.id, archivedAt: null, balance: { gt: 0 } }, _sum: { balance: true } }),
    documentWhere ? prisma.documentRequest.findMany({ where: documentWhere, include: { definition: true, configuration: true, paymentRequest: { include: { collection: true } }, versions: { orderBy: { version: "desc" }, take: 1 } }, orderBy: [{ updatedAt: "desc" }, { requestedAt: "desc" }], take: REQUEST_LIMIT }) : Promise.resolve([]),
    documentWhere ? prisma.documentRequest.count({ where: documentWhere }) : Promise.resolve(0),
    complaintWhere ? prisma.complaint.findMany({ where: complaintWhere, include: { category: true, _count: { select: { messages: true, attachments: true } } }, orderBy: [{ updatedAt: "desc" }, { submittedAt: "desc" }], take: REQUEST_LIMIT }) : Promise.resolve([]),
    complaintWhere ? prisma.complaint.count({ where: complaintWhere }) : Promise.resolve(0),
  ]);

  const unpaidBalance = Number(unpaid._sum.balance ?? 0);
  const activeDocuments = documentRequests.filter((item) => !terminalDocumentStatuses.has(item.status)).length;
  const activeComplaints = complaintRequests.filter((item) => !terminalComplaintStatuses.has(item.status)).length;
  const documentLink = navigation.requestLinks.find((link) => link.module === TenantModule.DOCUMENTS);
  const complaintLink = navigation.requestLinks.find((link) => link.href === "/portal/complaints/new");

  return (
    <PortalPageContainer className="space-y-4">
      <RequestAreaNavigation active="requests" />

      <section className="grid grid-cols-3 gap-2" aria-label="Request summary">
        <RequestMetricCard label="Open" value={String(activeDocuments + activeComplaints)} icon={FileQuestion} tone={activeDocuments + activeComplaints ? "warning" : "success"} />
        <RequestMetricCard label="Documents" value={String(documentCount)} icon={FileCheck2} tone={hasDocuments ? "info" : "default"} />
        <RequestMetricCard label="Complaints" value={String(complaintCount)} icon={MessageSquarePlus} tone={hasComplaints ? "info" : "default"} />
      </section>

      {(documentLink || complaintLink) && <section>
        <PortalSectionHeader eyebrow="New" title="Start a request" />
        <div className="grid gap-2 sm:grid-cols-2">
          {documentLink && <PortalQuickActionTile href={documentLink.href} label="Document request" description="Certificates, passes and clearances" icon={FileCheck2} />}
          {complaintLink && <PortalQuickActionTile href={complaintLink.href} label="Submit complaint" description="Named, confidential or anonymous" icon={MessageSquarePlus} />}
        </div>
      </section>}

      <section className="grid gap-4 xl:grid-cols-2">
        <section className="min-w-0">
          <PortalSectionHeader eyebrow={`${documentCount} open`} title="Documents" action={<Link href="/portal/documents" className="text-xs font-black text-pine-700">View all</Link>} />
          <div className="space-y-2.5">
            {documentRequests.map((item) => {
              const access = resolveDocumentDownloadAccess({ request: item, currentOutstandingBalance: unpaidBalance });
              const downloadable = Boolean(item.generatedContent && access.downloadAllowed);
              const title = item.definition?.displayName || item.configuration?.displayName || documentTypeLabel(item.type);
              return <DocumentRequestCard key={item.id} title={title} reference={item.documentNumber || documentRequestPublicReference(item)} status={statusLabel(item.status)} statusTone={requestTone(item.status)} requested={shortDate(item.requestedAt)} subject={subjectLabel(item.subjectSnapshot)} purpose={item.purpose || ""} fee={money(Number(item.feeAmountSnapshot))} paymentStatus={documentFeePaymentStatusLabel(item)} href={item.generatedContent ? `/documents/${item.id}` : "/portal/documents"} downloadHref={downloadable ? `/documents/${item.id}/pdf` : undefined} printHref={downloadable ? `/documents/${item.id}/print` : undefined} />;
            })}
            {!documentRequests.length && <RequestEmptyState title="No open document requests" description="Your active document requests will appear here." />}
          </div>
        </section>

        <section className="min-w-0">
          <PortalSectionHeader eyebrow={`${complaintCount} open`} title="Complaints" action={<Link href="/portal/complaints" className="text-xs font-black text-pine-700">View all</Link>} />
          <div className="space-y-2.5">
            {complaintRequests.map((item) => <ComplaintRequestCard key={item.id} title={item.title} reference={item.complaintNumber || item.publicReference} status={statusLabel(item.status)} statusTone={requestTone(item.status)} privacy={complaintPrivacyLabel(item.privacyMode)} category={item.category?.name || "General"} submitted={shortDate(item.submittedAt)} activity={`${item._count.messages} messages`} href={`/portal/complaints/${item.id}`} />)}
            {!complaintRequests.length && <RequestEmptyState title="No open complaints" description="Your active complaint cases will appear here." icon={MessageSquarePlus} />}
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
  if (q) where.AND = [{ OR: [{ id: { contains: q } }, { documentNumber: { contains: q } }, { purpose: { contains: q } }, { definition: { is: { displayName: { contains: q } } } }, { configuration: { is: { displayName: { contains: q } } } }] }];
  return where;
}

function buildComplaintWhere(tenantId: string, userId: string, homeownerId: string, q: string, status: string): Prisma.ComplaintWhereInput {
  const where: Prisma.ComplaintWhereInput = { tenantId, OR: [{ privacyMode: ComplaintPrivacyMode.NAMED, submittedById: userId }, { privacyMode: ComplaintPrivacyMode.NAMED, homeownerId }, { privacyMode: ComplaintPrivacyMode.CONFIDENTIAL, confidentialIdentity: { is: { userId } } }, { privacyMode: ComplaintPrivacyMode.CONFIDENTIAL, confidentialIdentity: { is: { homeownerId } } }] };
  if (status === "open") where.status = { notIn: [...terminalComplaintStatuses] };
  if (status === "ready") where.status = { in: [ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED] };
  if (status === "closed") where.status = { in: [...terminalComplaintStatuses] };
  if (q) where.AND = [{ OR: [{ title: { contains: q } }, { complaintNumber: { contains: q } }, { publicReference: { contains: q } }, { category: { is: { name: { contains: q } } } }] }];
  return where;
}

function subjectLabel(value: unknown) {
  const subject = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return String(subject.fullName || "Homeowner");
}
