import { ComplaintPrivacyMode, ComplaintStatus, DocumentRequestStatus, PaymentRequestStatus, TenantModule } from "@prisma/client";
import { CalendarDays, CarFront, CreditCard, FileCheck2, FileQuestion, FileText, Megaphone, MessageSquare, MessageSquarePlus, QrCode, ShieldCheck } from "lucide-react";
import {
  BalanceSummaryCard,
  DashboardAnnouncementCard,
  DashboardList,
  DashboardQuickActions,
  DashboardSection,
  HomeownerGreeting,
  UpcomingEvents,
  type DashboardAction,
  type DashboardEvent,
  type DashboardListItem,
} from "@/components/homeowner/dashboard/dashboard-cards";
import { PortalPageContainer } from "@/components/portal-mobile-shell";
import { getAppUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";
import { documentTypeLabel } from "@/lib/services/documents";
import { getStatementOfAccount } from "@/lib/services/statement-of-account";
import { getAssociationSettings } from "@/lib/system-settings";
import { getEnabledTenantModules } from "@/lib/tenant";
import { collectionLabel, money, monthLabel, shortDate } from "@/lib/utils";

type DashboardDocumentRequest = {
  id: string;
  documentNumber: string | null;
  type: Parameters<typeof documentTypeLabel>[0] | null;
  status: string;
  requestedAt: Date;
  definition: { displayName: string; code: string } | null;
  configuration: { displayName: string } | null;
  histories: Array<{ status: string; note: string | null; createdAt: Date }>;
};

type DashboardComplaint = {
  id: string;
  title: string;
  complaintNumber: string;
  status: string;
  submittedAt: Date;
  updatedAt: Date;
};

type DashboardPaymentRequest = {
  id: string;
  type: string;
  collectionType: string | null;
  description: string | null;
  amount: string | number | { toString(): string };
  status: string;
  createdAt: Date;
};

type DashboardPayment = {
  id: string;
  amount: string | number | { toString(): string };
  paymentDate: Date;
  receiptNumber: string | null;
  referenceNumber: string | null;
} | null;

type DashboardAnnouncementRecord = {
  id: string;
  title: string;
  content: string;
  imageUrl: string | null;
  createdAt: Date;
} | null;

type DashboardEventRecord = {
  id: string;
  title: string;
  description: string;
  eventDate: Date;
  eventTime: string;
  startTime: string | null;
  endTime: string | null;
  location: string;
  imageUrl: string | null;
};

async function traceDashboardOperation<T>(operation: string, task: () => Promise<T>) {
  try {
    return await task();
  } catch (error) {
    console.error("[portal-dashboard] render operation failed", {
      operation,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    throw error;
  }
}

async function optionalDashboardOperation<T>(
  operation: string,
  task: () => Promise<T>,
  fallback: T,
  degradedOperations: string[],
) {
  try {
    return await task();
  } catch (error) {
    console.error("[portal-dashboard] optional operation failed", {
      operation,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    degradedOperations.push(operation);
    return fallback;
  }
}

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

export default async function PortalDashboard() {
  const profile = await traceDashboardOperation("requireHomeownerProfile", () => requireHomeownerProfile());
  const enabledModules = await traceDashboardOperation("enabledTenantModules", () => getEnabledTenantModules(profile.tenantId));
  const association = await traceDashboardOperation("associationSettings", () => getAssociationSettings(profile.tenantId));
  const degradedOperations: string[] = [];

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const billingEnabled = enabledModules.has(TenantModule.BILLING);
  const documentsEnabled = enabledModules.has(TenantModule.DOCUMENTS);
  const complaintsEnabled = enabledModules.has(TenantModule.COMPLAINTS);
  const announcementsEnabled = enabledModules.has(TenantModule.ANNOUNCEMENTS);
  const eventsEnabled = enabledModules.has(TenantModule.EVENTS);

  const [soa, openBills, latestPayment, recentPaymentRequests, documentRequests, complaints, announcement, events] = await Promise.all([
    billingEnabled
      ? optionalDashboardOperation("statementOfAccount", () => getStatementOfAccount(profile.id, profile.tenantId, getAppUrl()), null, degradedOperations)
      : Promise.resolve(null),
    billingEnabled
      ? optionalDashboardOperation("openBills", () => prisma.bill.findMany({
          take: 4,
          where: { tenantId: profile.tenantId, homeownerId: profile.id, balance: { gt: 0 }, archivedAt: null },
          orderBy: [{ dueDate: "asc" }, { billingMonth: "asc" }],
          select: { id: true, billingMonth: true, dueDate: true, balance: true, status: true },
        }), [], degradedOperations)
      : Promise.resolve([]),
    billingEnabled
      ? optionalDashboardOperation("latestPayment", () => prisma.payment.findFirst({
          where: { tenantId: profile.tenantId, homeownerId: profile.id, status: "ACTIVE" },
          orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
          select: { id: true, amount: true, paymentDate: true, receiptNumber: true, referenceNumber: true },
        }), null, degradedOperations)
      : Promise.resolve(null),
    billingEnabled
      ? optionalDashboardOperation("paymentRequests", () => prisma.paymentRequest.findMany({
          take: 3,
          where: { tenantId: profile.tenantId, homeownerId: profile.id, status: PaymentRequestStatus.PENDING_REVIEW },
          orderBy: { createdAt: "desc" },
          select: { id: true, type: true, collectionType: true, description: true, amount: true, status: true, createdAt: true },
        }), [], degradedOperations)
      : Promise.resolve([]),
    documentsEnabled
      ? optionalDashboardOperation("documentRequests", () => prisma.documentRequest.findMany({
          take: 4,
          where: { tenantId: profile.tenantId, homeownerId: profile.id, archivedAt: null, status: { in: activeDocumentStatuses } },
          include: { definition: { select: { displayName: true, code: true } }, configuration: { select: { displayName: true } }, histories: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, note: true, createdAt: true } } },
          orderBy: { requestedAt: "desc" },
        }), [], degradedOperations)
      : Promise.resolve([]),
    complaintsEnabled
      ? optionalDashboardOperation("complaints", () => prisma.complaint.findMany({
          take: 3,
          where: {
            tenantId: profile.tenantId,
            status: { in: activeComplaintStatuses },
            OR: [
              { privacyMode: ComplaintPrivacyMode.NAMED, submittedById: profile.userId },
              { privacyMode: ComplaintPrivacyMode.NAMED, homeownerId: profile.id },
              { privacyMode: ComplaintPrivacyMode.CONFIDENTIAL, confidentialIdentity: { is: { userId: profile.userId } } },
              { privacyMode: ComplaintPrivacyMode.CONFIDENTIAL, confidentialIdentity: { is: { homeownerId: profile.id } } },
            ],
          },
          orderBy: { submittedAt: "desc" },
          select: { id: true, title: true, complaintNumber: true, status: true, submittedAt: true, updatedAt: true },
        }), [], degradedOperations)
      : Promise.resolve([]),
    announcementsEnabled
      ? optionalDashboardOperation("latestAnnouncement", () => prisma.announcement.findFirst({
          where: { tenantId: profile.tenantId, status: "PUBLISHED" },
          orderBy: [{ createdAt: "desc" }],
          select: { id: true, title: true, content: true, imageUrl: true, createdAt: true },
        }), null, degradedOperations)
      : Promise.resolve(null),
    eventsEnabled
      ? optionalDashboardOperation("upcomingEvents", () => prisma.event.findMany({
          take: 3,
          where: { tenantId: profile.tenantId, status: "PUBLISHED", eventDate: { gte: today } },
          orderBy: [{ eventDate: "asc" }, { startTime: "asc" }],
          select: { id: true, title: true, description: true, eventDate: true, eventTime: true, startTime: true, endTime: true, location: true, imageUrl: true },
        }), [], degradedOperations)
      : Promise.resolve([]),
  ]);

  const nextDue = openBills[0];
  const balanceAmount = soa?.summary.currentOutstandingBalance ?? 0;
  const billingStatus = !billingEnabled
    ? "Billing not enabled"
    : !soa
      ? "Temporarily unavailable"
      : soa.billingHistory.length === 0
        ? "No Billing Record"
        : balanceAmount <= 0
          ? "Paid"
          : soa.summary.collectionStatus === "Overdue"
            ? "Overdue"
            : "Amount Due";
  const quickActions = priorityQuickActions(enabledModules);
  const requestItems = activeRequestItems({ documentRequests, complaints, paymentRequests: recentPaymentRequests });
  const activityItems = activityFeedItems({ latestPayment, documentRequests, paymentRequests: recentPaymentRequests, announcement, events });
  const firstName = profile.user.name?.split(" ")[0] || "Homeowner";
  const propertyLabel = profile.block || profile.lot ? `Block ${profile.block || "-"}, Lot ${profile.lot || "-"}` : undefined;

  return (
    <PortalPageContainer className="space-y-5 lg:space-y-7">
      {degradedOperations.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-900">
          Some dashboard sections are temporarily unavailable, but your tenant session and available records loaded safely. Retry later or contact the HOA office if this continues.
        </section>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,.75fr)]">
        <div className="space-y-5">
          <HomeownerGreeting greeting={timeGreeting(now)} firstName={firstName} associationName={association.name} propertyLabel={propertyLabel} />
          <BalanceSummaryCard amount={money(balanceAmount)} status={billingStatus} dueDateLabel={nextDue ? shortDate(nextDue.dueDate) : undefined} coverageLabel={nextDue ? monthLabel(nextDue.billingMonth) : undefined} />
          <DashboardQuickActions actions={quickActions} />
        </div>

        <div className="space-y-5">
          <DashboardSection eyebrow="Requests" title="Active Requests" actionHref="/portal/requests">
            <DashboardList items={requestItems} emptyTitle="No active requests" emptyDescription="Payment, document, and complaint requests that need attention will appear here." />
          </DashboardSection>
          <DashboardSection eyebrow="Activity" title="Recent Activity" actionHref="/portal/payments">
            <DashboardList items={activityItems} emptyTitle="No recent activity" emptyDescription="Recent payments, request updates, and community activity will appear here." />
          </DashboardSection>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
        <DashboardSection eyebrow="Announcement" title="Latest Announcement" actionHref={announcementsEnabled ? "/portal/announcements" : undefined}>
          <DashboardAnnouncementCard announcement={announcementsEnabled && announcement ? {
            href: `/portal/announcements/${announcement.id}`,
            title: announcement.title,
            summary: announcement.content,
            dateLabel: shortDate(announcement.createdAt),
            imageUrl: announcement.imageUrl,
          } : null} />
        </DashboardSection>

        <DashboardSection eyebrow="Events" title="Upcoming Events" actionHref={eventsEnabled ? "/portal/events" : undefined}>
          <UpcomingEvents events={eventsEnabled ? events.map(eventToDashboardCard) : []} />
        </DashboardSection>
      </div>
    </PortalPageContainer>
  );
}

function priorityQuickActions(enabledModules: ReadonlySet<TenantModule>): DashboardAction[] {
  const preferred = [
    enabledModules.has(TenantModule.BILLING) && { href: "/portal/pay", label: "Pay Dues", description: "Submit a QR payment.", icon: QrCode },
    enabledModules.has(TenantModule.DOCUMENTS) && { href: "/portal/documents", label: "Request Document", description: "Certificates and forms.", icon: FileQuestion },
    enabledModules.has(TenantModule.DOCUMENTS) && { href: "/portal/documents", label: "Gate Pass", description: "Use document requests.", icon: ShieldCheck },
    enabledModules.has(TenantModule.COMPLAINTS) && { href: "/portal/complaints/new", label: "Report an Issue", description: "Send a concern.", icon: MessageSquarePlus },
  ];
  const fallback = [
    enabledModules.has(TenantModule.BILLING) && { href: "/portal/payments", label: "View Receipt", description: "Payment history.", icon: CreditCard },
    enabledModules.has(TenantModule.CHAT) && { href: "/portal/chat", label: "Contact HOA", description: "Message the office.", icon: MessageSquare },
    enabledModules.has(TenantModule.VEHICLES) && { href: "/portal/vehicles", label: "Vehicles", description: "Stickers and records.", icon: CarFront },
    enabledModules.has(TenantModule.EVENTS) && { href: "/portal/events", label: "Events", description: "Community calendar.", icon: CalendarDays },
    { href: "/portal/organization", label: "HOA Info", description: "Officers and contacts.", icon: Megaphone },
  ];
  return [...preferred, ...fallback].filter(Boolean).slice(0, 4) as DashboardAction[];
}

function activeRequestItems({
  documentRequests,
  complaints,
  paymentRequests,
}: {
  documentRequests: DashboardDocumentRequest[];
  complaints: DashboardComplaint[];
  paymentRequests: DashboardPaymentRequest[];
}): DashboardListItem[] {
  const payments = paymentRequests.map((request) => ({
    href: "/portal/pay",
    icon: QrCode,
    title: request.type === "MONTHLY_DUES" ? "Payment under review" : collectionLabel(String(request.collectionType), request.description),
    description: money(request.amount),
    meta: `Submitted ${shortDate(request.createdAt)}`,
    status: labelStatus(request.status),
  }));
  const documents = documentRequests.map((request) => ({
    href: "/portal/documents",
    icon: documentIcon(request.definition?.displayName || request.configuration?.displayName || request.type || ""),
    title: request.definition?.displayName || request.configuration?.displayName || documentTypeLabel(request.type),
    description: request.documentNumber || `Requested ${shortDate(request.requestedAt)}`,
    meta: latestDocumentActivity(request),
    status: labelStatus(request.status),
  }));
  const complaintItems = complaints.map((complaint) => ({
    href: `/portal/complaints/${complaint.id}`,
    icon: MessageSquarePlus,
    title: complaint.title,
    description: complaint.complaintNumber,
    meta: `Updated ${shortDate(complaint.updatedAt)}`,
    status: labelStatus(complaint.status),
  }));
  return [...payments, ...documents, ...complaintItems].slice(0, 5);
}

function activityFeedItems({
  latestPayment,
  documentRequests,
  paymentRequests,
  announcement,
  events,
}: {
  latestPayment: DashboardPayment;
  documentRequests: DashboardDocumentRequest[];
  paymentRequests: DashboardPaymentRequest[];
  announcement: DashboardAnnouncementRecord;
  events: DashboardEventRecord[];
}): DashboardListItem[] {
  const items: DashboardListItem[] = [];
  if (latestPayment) {
    items.push({
      href: "/portal/payments",
      icon: CreditCard,
      title: "Payment confirmed",
      description: `${money(latestPayment.amount)}${latestPayment.receiptNumber || latestPayment.referenceNumber ? ` · ${latestPayment.receiptNumber || latestPayment.referenceNumber}` : ""}`,
      meta: shortDate(latestPayment.paymentDate),
      status: "Paid",
    });
  }
  for (const request of paymentRequests.slice(0, 1)) {
    items.push({ href: "/portal/pay", icon: QrCode, title: "Payment request submitted", description: money(request.amount), meta: shortDate(request.createdAt), status: labelStatus(request.status) });
  }
  for (const request of documentRequests.slice(0, 2)) {
    items.push({ href: "/portal/documents", icon: FileText, title: "Document request update", description: request.definition?.displayName || request.configuration?.displayName || documentTypeLabel(request.type), meta: latestDocumentActivity(request), status: labelStatus(request.status) });
  }
  if (announcement) {
    items.push({ href: `/portal/announcements/${announcement.id}`, icon: Megaphone, title: "Announcement published", description: announcement.title, meta: shortDate(announcement.createdAt) });
  }
  if (events[0]) {
    items.push({ href: `/portal/events/${events[0].id}`, icon: CalendarDays, title: "Upcoming event", description: events[0].title, meta: shortDate(events[0].eventDate) });
  }
  return items.slice(0, 6);
}

function eventToDashboardCard(event: {
  id: string;
  title: string;
  description: string;
  eventDate: Date;
  eventTime: string;
  startTime: string | null;
  endTime: string | null;
  location: string;
  imageUrl: string | null;
}): DashboardEvent {
  return {
    href: `/portal/events/${event.id}`,
    title: event.title,
    description: event.description,
    dateLabel: shortDate(event.eventDate),
    timeLabel: `${event.startTime || event.eventTime}${event.endTime ? ` - ${event.endTime}` : ""}`,
    location: event.location,
    imageUrl: event.imageUrl,
  };
}

function latestDocumentActivity(request: { requestedAt: Date; histories?: Array<{ createdAt: Date; note: string | null }> }) {
  const latest = request.histories?.[0];
  if (latest) return `${shortDate(latest.createdAt)}${latest.note ? ` · ${latest.note}` : ""}`;
  return `Requested ${shortDate(request.requestedAt)}`;
}

function documentIcon(value: string | null) {
  const label = String(value || "").toLowerCase();
  if (label.includes("gate")) return ShieldCheck;
  if (label.includes("move")) return FileCheck2;
  return FileText;
}

function labelStatus(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function timeGreeting(now: Date) {
  const hour = now.getHours();
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}
