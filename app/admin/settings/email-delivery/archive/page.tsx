import Link from "next/link";
import { NotificationStatus, NotificationType, Prisma, Role } from "@prisma/client";
import { EmailDeliveryBulkSubmitButton, EmailDeliverySelectPage } from "@/components/email-delivery-bulk-actions";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/ui";
import { purgeArchivedEmailHistoryAction } from "@/lib/actions/email-delivery-management";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  EMAIL_DELIVERY_PAGE_SIZES,
  parseEmailDeliveryPageSize,
  parseNotificationStatus,
  parseNotificationType,
} from "@/lib/email-delivery-management";

const EMAIL_ARCHIVE_ACTION = "ARCHIVE_EMAIL_HISTORY";
const EMAIL_ARCHIVE_ENTITY = "NotificationLogArchive";

function positivePage(value?: string) {
  const parsed = Number(value || "1");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function jsonObject(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Prisma.JsonObject;
}

function jsonText(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" ? value : "";
}

function dateTime(value: Date | string | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

function archiveHref(input: {
  page: number;
  q: string;
  status: NotificationStatus | null;
  type: NotificationType | null;
  pageSize: number;
}) {
  const params = new URLSearchParams();
  if (input.q) params.set("q", input.q);
  if (input.status) params.set("status", input.status);
  if (input.type) params.set("type", input.type);
  if (input.page > 1) params.set("page", String(input.page));
  if (input.pageSize !== 25) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return `/admin/settings/email-delivery/archive${query ? `?${query}` : ""}`;
}

export default async function ArchivedEmailHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    type?: string;
    page?: string;
    pageSize?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const user = await requireUser(Role.SYSTEM_ADMIN);
  const query = await searchParams;
  const q = String(query.q || "").trim().slice(0, 120);
  const status = parseNotificationStatus(query.status);
  const type = parseNotificationType(query.type);
  const pageSize = parseEmailDeliveryPageSize(query.pageSize);
  const requestedPage = positivePage(query.page);

  const reasonFilters: Prisma.AuditLogWhereInput[] = [];
  if (q) reasonFilters.push({ reason: { contains: q } });
  if (status) reasonFilters.push({ reason: { startsWith: `${status} |` } });
  if (type) reasonFilters.push({ reason: { contains: `| ${type} |` } });
  const where: Prisma.AuditLogWhereInput = {
    tenantId: user.tenantId,
    module: "EMAIL",
    action: EMAIL_ARCHIVE_ACTION,
    entityType: EMAIL_ARCHIVE_ENTITY,
    ...(reasonFilters.length ? { AND: reasonFilters } : {}),
  };

  const total = await prisma.auditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const logs = await prisma.auditLog.findMany({
    where,
    select: { id: true, entityId: true, metadata: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return <>
    <PageHeader
      eyebrow="System administration"
      title="Archived Email History"
      description="Archived SENT/SKIPPED delivery history is kept outside the live NotificationLog table so routine email management stays fast. Archived records are read-only unless a System Administrator permanently deletes them."
      action={<Link className="btn-secondary" href="/admin/settings/email-delivery">Back to Email Delivery</Link>}
    />

    {query.error && <div role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{query.error}</div>}
    {query.success && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{query.success}</div>}

    <section className="card mb-6">
      <form method="get" className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_180px_230px_140px_auto_auto] lg:items-end">
        <div>
          <label className="label" htmlFor="archive-search">Search archive</label>
          <input id="archive-search" className="field" name="q" defaultValue={q} placeholder="Recipient, masked email, subject, status, or type" maxLength={120} />
        </div>
        <div>
          <label className="label" htmlFor="archive-status">Status</label>
          <select id="archive-status" className="field" name="status" defaultValue={status || ""}>
            <option value="">All statuses</option>
            <option value={NotificationStatus.SENT}>SENT</option>
            <option value={NotificationStatus.SKIPPED}>SKIPPED</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="archive-type">Type</label>
          <select id="archive-type" className="field" name="type" defaultValue={type || ""}>
            <option value="">All email types</option>
            {Object.values(NotificationType).map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="archive-page-size">Rows</label>
          <select id="archive-page-size" className="field" name="pageSize" defaultValue={String(pageSize)}>
            {EMAIL_DELIVERY_PAGE_SIZES.map((size) => <option key={size} value={size}>{size} / page</option>)}
          </select>
        </div>
        <SubmitButton>Apply filters</SubmitButton>
        <Link className="btn-secondary text-center" href="/admin/settings/email-delivery/archive">Clear</Link>
      </form>
    </section>

    <section className="card overflow-hidden p-0">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-black text-ink">Archived records</h2><p className="text-sm text-slate-500">{total} matching archived record{total === 1 ? "" : "s"} · page {page} of {totalPages}</p></div>
        <p className="text-xs font-semibold text-slate-500">Server-side pagination · {pageSize} records per page</p>
      </div>

      <form action={purgeArchivedEmailHistoryAction}>
        <input type="hidden" name="q" value={q} />
        <input type="hidden" name="status" value={status || ""} />
        <input type="hidden" name="type" value={type || ""} />
        <input type="hidden" name="page" value={page} />
        <input type="hidden" name="pageSize" value={pageSize} />

        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <EmailDeliverySelectPage count={logs.length} />
            {total > logs.length && <label className="inline-flex cursor-pointer items-center gap-2 font-bold text-slate-700">
              <input type="checkbox" name="selectAllFiltered" value="true" className="size-4 rounded border-slate-300" />
              Apply action to all filtered archived records ({total} matching)
            </label>}
            <span className="text-xs font-semibold text-slate-500">Permanent deletion removes the archived delivery details. A minimal non-content administrative audit of the deletion remains.</span>
          </div>
          <EmailDeliveryBulkSubmitButton
            value="purgeArchived"
            className="btn-danger"
            selectedInputName="archiveIds"
            confirmation="Permanently delete the selected archived email history? Detailed archived delivery information cannot be recovered."
            confirmationPhrase="DELETE PERMANENTLY"
          >
            Permanent delete archived
          </EmailDeliveryBulkSubmitButton>
        </div>

        <div className="table-wrap rounded-none border-0 shadow-none">
          <table className="data-table">
            <thead><tr><th className="w-12">Select</th><th>Recipient</th><th>Message</th><th>Status</th><th>Delivery</th><th>Archived</th></tr></thead>
            <tbody>
              {logs.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-500">No archived email history matches the selected filters.</td></tr>}
              {logs.map((log) => {
                const metadata = jsonObject(log.metadata);
                const recipientName = jsonText(metadata?.recipientName) || "Unnamed recipient";
                const maskedEmail = jsonText(metadata?.maskedEmail) || "—";
                const subject = jsonText(metadata?.subject) || "Archived email";
                const originalStatus = jsonText(metadata?.originalStatus) || "—";
                const notificationType = jsonText(metadata?.notificationType) || "—";
                const providerMessageId = jsonText(metadata?.providerMessageId);
                const errorMessage = jsonText(metadata?.errorMessage);
                const originalCreatedAt = jsonText(metadata?.originalCreatedAt);
                const sentAt = jsonText(metadata?.sentAt);
                return <tr key={log.id}>
                  <td><input aria-label={`Select archived ${subject}`} type="checkbox" name="archiveIds" value={log.id} className="size-4 rounded border-slate-300" /></td>
                  <td className="min-w-48"><p className="font-bold text-slate-800">{recipientName}</p><p className="mt-1 font-mono text-xs text-slate-500">{maskedEmail}</p></td>
                  <td className="min-w-64"><p className="font-semibold text-slate-800">{subject}</p><p className="mt-1 text-xs font-bold text-slate-500">{notificationType.replaceAll("_", " ")}</p><p className="mt-1 font-mono text-[10px] text-slate-400">{log.entityId || "—"}</p></td>
                  <td><span className={`badge ${originalStatus === NotificationStatus.SENT ? "badge-success" : "badge-warning"}`}>{originalStatus}</span></td>
                  <td className="min-w-64 text-xs text-slate-600"><p><b>Created:</b> {dateTime(originalCreatedAt)}</p><p className="mt-1"><b>Sent:</b> {dateTime(sentAt)}</p><p className="mt-1 break-all"><b>Provider:</b> {providerMessageId || "—"}</p>{errorMessage && <p className="mt-1"><b>Last detail:</b> {errorMessage}</p>}</td>
                  <td className="min-w-44 text-xs text-slate-600">{dateTime(log.createdAt)}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </form>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
        {page > 1 ? <Link className="btn-secondary" href={archiveHref({ page: page - 1, q, status, type, pageSize })}>Previous</Link> : <span />}
        <span className="text-xs font-semibold text-slate-500">Page {page} of {totalPages}</span>
        {page < totalPages ? <Link className="btn-secondary" href={archiveHref({ page: page + 1, q, status, type, pageSize })}>Next</Link> : <span />}
      </div>
    </section>
  </>;
}
