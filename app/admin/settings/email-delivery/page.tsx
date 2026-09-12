import Link from "next/link";
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma,
  Role,
} from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/ui";
import { retryEmailDeliveryAction } from "@/lib/actions/email-delivery-management";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 25;
const RETRYABLE_TYPES = new Set<NotificationType>([
  NotificationType.BILLING_NOTIFICATION,
  NotificationType.BILL_REMINDER,
]);

function validStatus(value?: string) {
  return Object.values(NotificationStatus).includes(value as NotificationStatus)
    ? value as NotificationStatus
    : null;
}

function validType(value?: string) {
  return Object.values(NotificationType).includes(value as NotificationType)
    ? value as NotificationType
    : null;
}

function positivePage(value?: string) {
  const parsed = Number(value || "1");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function maskedEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "Invalid email";
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(2, Math.min(8, local.length - visible.length)))}@${domain}`;
}

function deliveryEmailSnapshot(metadata: Prisma.JsonValue | null, currentEmail: string) {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const candidate = (metadata as Prisma.JsonObject).maskedEmail;
    if (typeof candidate === "string" && candidate.includes("@")) return candidate;
  }
  return maskedEmail(currentEmail);
}

function dateTime(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(value);
}

function statusBadge(status: NotificationStatus) {
  if (status === NotificationStatus.SENT) return "badge-success";
  if (status === NotificationStatus.FAILED) return "badge-danger";
  if (status === NotificationStatus.SKIPPED) return "badge-warning";
  return "badge-info";
}

function queryHref(input: {
  page: number;
  q: string;
  status: NotificationStatus | null;
  type: NotificationType | null;
}) {
  const params = new URLSearchParams();
  if (input.q) params.set("q", input.q);
  if (input.status) params.set("status", input.status);
  if (input.type) params.set("type", input.type);
  if (input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  return `/admin/settings/email-delivery${query ? `?${query}` : ""}`;
}

export default async function EmailDeliveryManagementPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    type?: string;
    page?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const user = await requireUser(Role.SYSTEM_ADMIN);
  const query = await searchParams;
  const q = String(query.q || "").trim().slice(0, 120);
  const status = validStatus(query.status);
  const type = validType(query.type);
  const requestedPage = positivePage(query.page);

  const searchFilter: Prisma.NotificationLogWhereInput = q
    ? {
        OR: [
          { subject: { contains: q } },
          { recipient: { is: { name: { contains: q } } } },
          { recipient: { is: { email: { contains: q } } } },
        ],
      }
    : {};

  const where: Prisma.NotificationLogWhereInput = {
    tenantId: user.tenantId,
    channel: NotificationChannel.EMAIL,
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...searchFilter,
  };
  const tenantEmailWhere: Prisma.NotificationLogWhereInput = {
    tenantId: user.tenantId,
    channel: NotificationChannel.EMAIL,
  };

  const [total, statusCounts] = await Promise.all([
    prisma.notificationLog.count({ where }),
    prisma.notificationLog.groupBy({
      by: ["status"],
      where: tenantEmailWhere,
      _count: { _all: true },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const logs = await prisma.notificationLog.findMany({
    where,
    select: {
      id: true,
      type: true,
      subject: true,
      status: true,
      createdAt: true,
      sentAt: true,
      errorMessage: true,
      metadata: true,
      recipient: { select: { id: true, name: true, email: true, active: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const counts = new Map(statusCounts.map((entry) => [entry.status, entry._count._all]));
  const queueWorkerEnabled = process.env.EMAIL_BULK_DELIVERY_ENABLED === "true";

  return <>
    <PageHeader
      eyebrow="System administration"
      title="Email Delivery Management"
      description="Inspect tenant-scoped outbound email history and safely place failed billing/reminder messages back into HOAHub's protected delivery queue. Sent messages are read-only to prevent accidental duplicates."
      action={<Link className="btn-secondary" href="/admin/settings">Back to settings</Link>}
    />

    {query.error && <div role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{query.error}</div>}
    {query.success && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{query.success}</div>}

    <section className={`card mb-6 ${queueWorkerEnabled ? "border-emerald-100 bg-emerald-50/50" : "border-amber-100 bg-amber-50/60"}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-slate-500">Protected worker</p>
          <h2 className="mt-1 text-lg font-black text-ink">{queueWorkerEnabled ? "Automatic queued delivery is enabled" : "Automatic queued delivery is paused"}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Retry never sends SMTP directly from this screen. A failed record is changed back to QUEUED and the existing protected email worker performs validation, suppression checks, provider-circuit checks, pacing, and delivery.</p>
        </div>
        <span className={`badge ${queueWorkerEnabled ? "badge-success" : "badge-warning"}`}>{queueWorkerEnabled ? "ENABLED" : "PAUSED"}</span>
      </div>
      {!queueWorkerEnabled && <p className="mt-3 rounded-2xl bg-white p-3 text-sm font-semibold text-amber-900">A retried email will remain queued until EMAIL_BULK_DELIVERY_ENABLED=true is enabled through the controlled production rollout.</p>}
    </section>

    <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Object.values(NotificationStatus).map((item) => <div key={item} className="card py-4">
        <p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">{item}</p>
        <p className="mt-2 text-3xl font-black text-ink">{counts.get(item) || 0}</p>
      </div>)}
    </section>

    <section className="card mb-6">
      <form method="get" className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_220px_260px_auto_auto] lg:items-end">
        <div>
          <label className="label" htmlFor="email-delivery-search">Search</label>
          <input id="email-delivery-search" className="field" name="q" defaultValue={q} placeholder="Recipient, current email, or subject" maxLength={120} />
        </div>
        <div>
          <label className="label" htmlFor="email-delivery-status">Status</label>
          <select id="email-delivery-status" className="field" name="status" defaultValue={status || ""}>
            <option value="">All statuses</option>
            {Object.values(NotificationStatus).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="email-delivery-type">Type</label>
          <select id="email-delivery-type" className="field" name="type" defaultValue={type || ""}>
            <option value="">All email types</option>
            {Object.values(NotificationType).map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
          </select>
        </div>
        <SubmitButton>Apply filters</SubmitButton>
        <Link className="btn-secondary text-center" href="/admin/settings/email-delivery">Clear</Link>
      </form>
    </section>

    <section className="card overflow-hidden p-0">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-black text-ink">Email records</h2><p className="text-sm text-slate-500">{total} matching record{total === 1 ? "" : "s"} · page {page} of {totalPages}</p></div>
        <p className="text-xs font-semibold text-slate-500">25 records per page</p>
      </div>
      <div className="table-wrap rounded-none border-0 shadow-none">
        <table className="data-table">
          <thead><tr><th>Recipient</th><th>Message</th><th>Status</th><th>Timeline</th><th>Last error</th><th className="text-right">Action</th></tr></thead>
          <tbody>
            {logs.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-500">No email delivery records match the selected filters.</td></tr>}
            {logs.map((log) => {
              const retryable = log.status === NotificationStatus.FAILED && RETRYABLE_TYPES.has(log.type);
              const deliveryEmail = deliveryEmailSnapshot(log.metadata, log.recipient.email);
              return <tr key={log.id}>
                <td className="min-w-48"><p className="font-bold text-slate-800">{log.recipient.name || "Unnamed recipient"}</p><p className="mt-1 font-mono text-xs text-slate-500">{deliveryEmail}</p>{!log.recipient.active && <span className="mt-2 inline-flex badge badge-warning">INACTIVE</span>}</td>
                <td className="min-w-64"><p className="font-semibold text-slate-800">{log.subject}</p><p className="mt-1 text-xs font-bold text-slate-500">{log.type.replaceAll("_", " ")}</p><p className="mt-1 font-mono text-[10px] text-slate-400">{log.id}</p></td>
                <td><span className={`badge ${statusBadge(log.status)}`}>{log.status}</span></td>
                <td className="min-w-44 text-xs text-slate-600"><p><b>Created:</b> {dateTime(log.createdAt)}</p><p className="mt-1"><b>Sent:</b> {dateTime(log.sentAt)}</p></td>
                <td className="max-w-72"><p className="line-clamp-3 text-xs leading-5 text-slate-600">{log.errorMessage || "—"}</p></td>
                <td className="text-right">
                  {retryable ? <form action={retryEmailDeliveryAction}>
                    <input type="hidden" name="notificationId" value={log.id} />
                    <SubmitButton>Queue retry</SubmitButton>
                  </form> : <span className="text-xs font-semibold text-slate-400">{log.status === NotificationStatus.SENT ? "Read only" : log.status === NotificationStatus.QUEUED ? "Awaiting worker" : "No retry"}</span>}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
        {page > 1 ? <Link className="btn-secondary" href={queryHref({ page: page - 1, q, status, type })}>Previous</Link> : <span />}
        {page < totalPages ? <Link className="btn-secondary" href={queryHref({ page: page + 1, q, status, type })}>Next</Link> : <span />}
      </div>
    </section>
  </>;
}
