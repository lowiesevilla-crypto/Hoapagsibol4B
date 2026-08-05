import Link from "next/link";
import {
  DocumentGenerationState,
  DocumentRequestStatus,
  DocumentTemplateVersionStatus,
} from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { requireDocumentTemplateAdmin } from "@/lib/document-template-admin";
import { prisma } from "@/lib/db";
import {
  averageDocumentTurnaroundDays,
  documentRequestAgeBand,
  evaluateDocumentationReadiness,
  isStaleDocumentGenerationAttempt,
} from "@/lib/services/document-operations";
import { documentTypeLabel } from "@/lib/services/documents";
import { getPaymentSettings } from "@/lib/system-settings";
import { shortDate } from "@/lib/utils";

const openStatuses: DocumentRequestStatus[] = [
  DocumentRequestStatus.SUBMITTED,
  DocumentRequestStatus.PAYMENT_PENDING,
  DocumentRequestStatus.PENDING_PAYMENT,
  DocumentRequestStatus.PAYMENT_CONFIRMED,
  DocumentRequestStatus.PENDING_APPROVAL,
  DocumentRequestStatus.UNDER_REVIEW,
  DocumentRequestStatus.RETURNED_FOR_CORRECTION,
  DocumentRequestStatus.APPROVED,
  DocumentRequestStatus.GENERATING,
];

const activeGenerationStates: DocumentGenerationState[] = [
  DocumentGenerationState.VALIDATING,
  DocumentGenerationState.READY,
  DocumentGenerationState.RENDERING,
  DocumentGenerationState.GENERATED,
];

function countFor(map: ReadonlyMap<string, number>, ...keys: string[]) {
  return keys.reduce((sum, key) => sum + (map.get(key) ?? 0), 0);
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? `${Math.round((numerator / denominator) * 1000) / 10}%` : "0%";
}

export default async function DocumentationOperationsPage() {
  const user = await requireDocumentTemplateAdmin();
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  const staleBefore = new Date(now.getTime() - 5 * 60_000);

  const [
    definitions,
    statusGroups,
    generationGroups,
    staleAttempts,
    oldestOpen,
    archivedCount,
    recentRequests,
    paymentSettings,
  ] = await Promise.all([
    prisma.documentDefinition.findMany({
      where: { tenantId: user.tenantId },
      include: {
        fields: { select: { active: true } },
        assignedTemplateVersion: { select: { status: true } },
        workflowDefinition: {
          include: {
            steps: {
              select: {
                required: true,
                stepType: true,
                approverRole: true,
                approverUserId: true,
              },
            },
          },
        },
        signatoryOfficer: { select: { active: true, archivedAt: true } },
      },
      orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
    }),
    prisma.documentRequest.groupBy({
      by: ["status"],
      where: { tenantId: user.tenantId, archivedAt: null },
      _count: { _all: true },
    }),
    prisma.documentGenerationAttempt.groupBy({
      by: ["state"],
      where: { tenantId: user.tenantId },
      _count: { _all: true },
    }),
    prisma.documentGenerationAttempt.findMany({
      where: {
        tenantId: user.tenantId,
        state: { in: activeGenerationStates },
        updatedAt: { lte: staleBefore },
        documentVersionId: null,
      },
      include: {
        request: {
          include: {
            homeowner: { include: { user: true } },
            definition: true,
            configuration: true,
          },
        },
      },
      orderBy: { updatedAt: "asc" },
      take: 20,
    }),
    prisma.documentRequest.findMany({
      where: { tenantId: user.tenantId, archivedAt: null, status: { in: openStatuses } },
      include: {
        homeowner: { include: { user: true } },
        definition: true,
        configuration: true,
        generationAttempts: { orderBy: { updatedAt: "desc" }, take: 1 },
      },
      orderBy: { requestedAt: "asc" },
      take: 20,
    }),
    prisma.documentRequest.count({ where: { tenantId: user.tenantId, archivedAt: { not: null } } }),
    prisma.documentRequest.findMany({
      where: { tenantId: user.tenantId, requestedAt: { gte: yearAgo } },
      select: {
        requestedAt: true,
        issuedAt: true,
        generatedAt: true,
        status: true,
        definitionId: true,
        type: true,
        definition: { select: { displayName: true } },
        configuration: { select: { displayName: true } },
      },
      orderBy: { requestedAt: "desc" },
      take: 2000,
    }),
    getPaymentSettings(user.tenantId),
  ]);

  const readiness = evaluateDocumentationReadiness(definitions, paymentSettings);
  const statusCounts = new Map(statusGroups.map((row) => [row.status, row._count._all]));
  const generationCounts = new Map(generationGroups.map((row) => [row.state, row._count._all]));
  const totalActive = [...statusCounts.values()].reduce((sum, value) => sum + value, 0);
  const submitted = countFor(statusCounts, DocumentRequestStatus.SUBMITTED);
  const paymentPending = countFor(statusCounts, DocumentRequestStatus.PAYMENT_PENDING, DocumentRequestStatus.PENDING_PAYMENT);
  const approvalPending = countFor(statusCounts, DocumentRequestStatus.PENDING_APPROVAL, DocumentRequestStatus.UNDER_REVIEW, DocumentRequestStatus.PAYMENT_CONFIRMED);
  const generationPending = countFor(statusCounts, DocumentRequestStatus.APPROVED, DocumentRequestStatus.GENERATING);
  const returned = countFor(statusCounts, DocumentRequestStatus.RETURNED_FOR_CORRECTION);
  const issued = countFor(statusCounts, DocumentRequestStatus.ISSUED, DocumentRequestStatus.READY_FOR_DOWNLOAD, DocumentRequestStatus.GENERATED, DocumentRequestStatus.DOWNLOADED);
  const rejected = countFor(statusCounts, DocumentRequestStatus.REJECTED, DocumentRequestStatus.CANCELLED, DocumentRequestStatus.REVOKED);
  const generationFailures = countFor(generationCounts, DocumentGenerationState.BLOCKED, DocumentGenerationState.FAILED);
  const turnaround = averageDocumentTurnaroundDays(recentRequests);

  const demand = new Map<string, number>();
  for (const request of recentRequests) {
    const label = request.definition?.displayName || request.configuration?.displayName || documentTypeLabel(request.type);
    demand.set(label, (demand.get(label) ?? 0) + 1);
  }
  const topDemand = [...demand.entries()].sort((left, right) => right[1] - left[1]).slice(0, 8);

  return <div className="space-y-6">
    <PageHeader
      eyebrow="Documentation operations"
      title="Document Operations Command Center"
      description="Monitor readiness, daily work queues, aging, generation recovery, and one-year operational performance for this tenant."
      action={<div className="flex flex-wrap gap-2"><Link className="btn-secondary" href="/admin/documents/guide">Administrator runbook</Link><a className="btn-secondary" href="/admin/documents/export">Export CSV</a><Link className="btn-primary" href="/admin/documents?section=requests">Open request queue</Link></div>}
    />

    <section className={`rounded-3xl border p-5 sm:p-7 ${readiness.productionReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-black uppercase tracking-widest text-slate-500">Production readiness</p><h2 className="mt-1 text-2xl font-black">{readiness.productionReady ? "Ready for production operations" : "Configuration action required"}</h2><p className="mt-2 max-w-3xl text-sm text-slate-700">{readiness.blockingCount} blocking issue{readiness.blockingCount === 1 ? "" : "s"}, {readiness.warningCount} warning{readiness.warningCount === 1 ? "" : "s"}, and {readiness.readyCount} completed check{readiness.readyCount === 1 ? "" : "s"} across the document catalog.</p></div>
        <Link className="btn-primary" href="#readiness-checklist">Review readiness checklist</Link>
      </div>
    </section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Active requests" value={totalActive} detail={`${archivedCount} archived`} />
      <Metric label="Average turnaround" value={turnaround == null ? "No completed data" : `${turnaround} days`} detail="Last 12 months, bounded to 2,000 requests" />
      <Metric label="Return / rejection rate" value={percent(returned + rejected, recentRequests.length)} detail={`${returned + rejected} of ${recentRequests.length} recent requests`} />
      <Metric label="Generation failures" value={generationFailures} detail={`${staleAttempts.length} stale active attempt${staleAttempts.length === 1 ? "" : "s"}`} tone={generationFailures || staleAttempts.length ? "warning" : "normal"} />
    </section>

    <section className="card">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-black">Daily actionable queues</h2><p className="text-sm text-slate-500">Counts exclude archived requests and link to tenant-scoped filtered queues.</p></div><Link className="btn-secondary" href="/admin/documents?section=requests&view=all">View all requests</Link></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <QueueCard label="New submissions" value={submitted} href={`/admin/documents?section=requests&view=all&status=${DocumentRequestStatus.SUBMITTED}`} />
        <QueueCard label="Payment pending" value={paymentPending} href={`/admin/documents?section=requests&view=all&status=${DocumentRequestStatus.PAYMENT_PENDING}`} />
        <QueueCard label="Approval / review" value={approvalPending} href={`/admin/documents?section=requests&view=all&status=${DocumentRequestStatus.PENDING_APPROVAL}`} />
        <QueueCard label="Generation pending" value={generationPending} href={`/admin/documents?section=requests&view=all&status=${DocumentRequestStatus.GENERATING}`} />
        <QueueCard label="Returned" value={returned} href={`/admin/documents?section=requests&view=all&status=${DocumentRequestStatus.RETURNED_FOR_CORRECTION}`} />
        <QueueCard label="Issued / available" value={issued} href={`/admin/documents?section=requests&view=all&status=${DocumentRequestStatus.ISSUED}`} />
      </div>
    </section>

    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <section className="card">
        <div className="mb-4"><h2 className="text-xl font-black">Oldest outstanding work</h2><p className="text-sm text-slate-500">The 20 oldest non-terminal requests, ordered by request date.</p></div>
        <div className="space-y-3">{oldestOpen.map((request) => {
          const age = documentRequestAgeBand(request.requestedAt, now);
          const latestAttempt = request.generationAttempts[0];
          const stale = latestAttempt ? isStaleDocumentGenerationAttempt(latestAttempt.state, latestAttempt.updatedAt, now) : false;
          return <article key={request.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><Link className="font-black text-pine-800 hover:underline" href={`/admin/documents/${request.id}`}>{request.definition?.displayName || request.configuration?.displayName || documentTypeLabel(request.type)}</Link><p className="mt-1 text-sm text-slate-600">{request.homeowner.user.name} · {shortDate(request.requestedAt)}</p></div><span className={`badge ${age.key === "critical" ? "badge-overdue" : age.key === "attention" ? "badge-due" : "badge-info"}`}>{age.days} day{age.days === 1 ? "" : "s"} open</span></div><div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500"><span>{request.status.replaceAll("_", " ")}</span>{latestAttempt && <span>Generation: {latestAttempt.state.replaceAll("_", " ")}</span>}{stale && <span className="text-rose-700">Stale attempt requires recovery</span>}</div></article>;
        })}{oldestOpen.length === 0 && <p className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">No outstanding document work.</p>}</div>
      </section>

      <section className="card">
        <div className="mb-4"><h2 className="text-xl font-black">Document demand</h2><p className="text-sm text-slate-500">Top requested document types in the last 12 months.</p></div>
        <div className="space-y-3">{topDemand.map(([label, value], index) => <div key={label} className="grid grid-cols-[auto_1fr_auto] items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs font-black">{index + 1}</span><span className="font-bold text-slate-700">{label}</span><span className="text-lg font-black">{value}</span></div>)}{topDemand.length === 0 && <p className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">No request demand data yet.</p>}</div>
      </section>
    </div>

    {staleAttempts.length > 0 && <section className="card border-rose-200">
      <div className="mb-4"><h2 className="text-xl font-black text-rose-900">Stale generation recovery</h2><p className="text-sm text-slate-500">Active generation attempts older than five minutes without an immutable output version.</p></div>
      <div className="space-y-3">{staleAttempts.map((attempt) => <article key={attempt.id} className="rounded-2xl border border-rose-200 bg-rose-50 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">{attempt.request.definition?.displayName || attempt.request.configuration?.displayName || documentTypeLabel(attempt.request.type)}</p><p className="text-sm text-slate-600">{attempt.request.homeowner.user.name} · Attempt {attempt.attemptNumber} · {attempt.state.replaceAll("_", " ")} · Updated {shortDate(attempt.updatedAt)}</p></div><Link className="btn-primary" href={`/admin/documents/${attempt.requestId}`}>Inspect and retry</Link></div></article>)}</div>
    </section>}

    <section id="readiness-checklist" className="space-y-4 scroll-mt-24">
      <div><h2 className="text-2xl font-black">Production readiness checklist</h2><p className="mt-1 text-sm text-slate-500">Blocking items prevent the module from being declared production-ready. Warnings require an administrator decision.</p></div>
      {readiness.definitions.map((definition) => <details key={definition.id} className="card" open={definition.severity === "blocking"}>
        <summary className="cursor-pointer"><span className="text-lg font-black">{definition.displayName}</span><span className={`ml-3 badge ${definition.severity === "ready" ? "badge-paid" : definition.severity === "blocking" ? "badge-overdue" : "badge-due"}`}>{definition.severity.toUpperCase()}</span><code className="ml-3 text-xs text-slate-500">{definition.code}</code></summary>
        <div className="mt-4 divide-y divide-slate-200">{definition.checks.map((item) => <div key={item.key} className="grid gap-3 py-3 sm:grid-cols-[150px_1fr_auto] sm:items-center"><span className={`font-black ${item.severity === "ready" ? "text-emerald-700" : item.severity === "blocking" ? "text-rose-700" : "text-amber-700"}`}>{item.severity.toUpperCase()}</span><div><p className="font-bold">{item.label}</p><p className="text-sm text-slate-500">{item.detail}</p></div>{item.href && <Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={item.href}>Resolve</Link>}</div>)}</div>
      </details>)}
      {readiness.definitions.length === 0 && <p className="card text-slate-500">No document definitions exist. Create the catalog before production use.</p>}
    </section>
  </div>;
}

function Metric({ label, value, detail, tone = "normal" }: { label: string; value: string | number; detail: string; tone?: "normal" | "warning" }) {
  return <div className={`rounded-3xl border bg-white p-5 ${tone === "warning" ? "border-amber-300" : "border-slate-200"}`}><p className="text-xs font-black uppercase tracking-widest text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p><p className="mt-2 text-xs text-slate-500">{detail}</p></div>;
}

function QueueCard({ label, value, href }: { label: string; value: number; href: string }) {
  return <Link className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-pine-300 hover:bg-white" href={href}><p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-pine-900">{value}</p><p className="mt-2 text-xs font-bold text-pine-700">Open filtered queue</p></Link>;
}
