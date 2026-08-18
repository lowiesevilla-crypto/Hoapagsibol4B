import Link from "next/link";
import { Activity, Building2, ShieldCheck, UserRoundCheck } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceCard } from "@/components/ui/workspace-card";
import { prisma } from "@/lib/db";

export default async function PlatformAuditPage() {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [eventsToday, platformEventsToday, tenantAccessToday, actorsToday, events] = await Promise.all([
    prisma.auditLog.count({ where: { createdAt: { gte: dayStart } } }),
    prisma.auditLog.count({ where: { createdAt: { gte: dayStart }, module: "PLATFORM" } }),
    prisma.auditLog.count({ where: { createdAt: { gte: dayStart }, action: "SUPER_ADMIN_TENANT_ACCESS" } }),
    prisma.auditLog.groupBy({ by: ["actorId"], where: { createdAt: { gte: dayStart }, actorId: { not: null } } }).then((rows) => rows.length),
    prisma.auditLog.findMany({ take: 100, orderBy: { createdAt: "desc" }, select: { id: true, tenantId: true, module: true, action: true, entityType: true, entityId: true, createdAt: true, actor: { select: { name: true, email: true, role: true } } } }),
  ]);

  const tenantIds = [...new Set(events.map((event) => event.tenantId).filter((value): value is string => Boolean(value)))];
  const tenants = tenantIds.length ? await prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }) : [];
  const tenantName = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));

  return <div className="space-y-5">
    <PageHeader eyebrow="Governance & Security" title="Platform Audit & Security" description="Read-only platform governance evidence across tenant access, commercial administration, and other audited HOAHub actions. Audit data remains the source of truth; this screen does not create or alter events." context={<><StatusBadge tone="ai">Platform governance</StatusBadge><StatusBadge tone="info">Read only</StatusBadge></>} actions={<Link className="btn-secondary" href="/platform/tenants">Open tenants</Link>} />

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Audit events today" value={eventsToday} note="All recorded modules" icon={Activity} tone="blue" />
      <MetricCard label="Platform events" value={platformEventsToday} note="Module = PLATFORM today" icon={ShieldCheck} tone="violet" />
      <MetricCard label="Tenant access events" value={tenantAccessToday} note="Audited platform tenant access today" icon={Building2} tone={tenantAccessToday ? "amber" : "green"} />
      <MetricCard label="Active audited actors" value={actorsToday} note="Distinct actors with events today" icon={UserRoundCheck} tone="green" />
    </section>

    <WorkspaceCard title="Audit feed" description="Latest 100 recorded audit events. Tenant labels are resolved separately so the underlying log remains unchanged." action={<StatusBadge tone="success">Immutable evidence view</StatusBadge>}>
      <div className="hidden max-h-[68vh] overflow-auto rounded-2xl border border-slate-200 md:block"><table className="min-w-[1050px] w-full text-sm"><thead className="sticky top-0 z-10 bg-surface-subtle text-left"><tr><th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Time</th><th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Actor</th><th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Tenant</th><th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Module</th><th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Action</th><th className="p-4 text-xs font-black uppercase tracking-wider text-slate-500">Entity</th></tr></thead><tbody>{events.map((event) => <tr key={event.id} className="border-t border-slate-100"><td className="p-4 whitespace-nowrap text-xs font-semibold text-slate-500">{event.createdAt.toLocaleString("en-PH")}</td><td className="p-4"><p className="font-black text-slate-900">{event.actor?.name || event.actor?.email || "System"}</p>{event.actor?.role && <p className="mt-1 text-xs text-slate-400">{event.actor.role.replaceAll("_", " ")}</p>}</td><td className="p-4"><p className="font-bold">{event.tenantId ? tenantName.get(event.tenantId) || "Tenant" : "Platform"}</p>{event.tenantId && <p className="mt-1 max-w-48 truncate font-mono text-[10px] text-slate-400">{event.tenantId}</p>}</td><td className="p-4"><StatusBadge tone={event.module === "PLATFORM" ? "ai" : "info"}>{event.module}</StatusBadge></td><td className="p-4 font-black text-slate-800">{event.action.replaceAll("_", " ")}</td><td className="p-4"><p className="font-semibold">{event.entityType || "—"}</p>{event.entityId && <p className="mt-1 max-w-40 truncate font-mono text-[10px] text-slate-400">{event.entityId}</p>}</td></tr>)}</tbody></table></div>
      <div className="grid gap-3 md:hidden">{events.slice(0, 30).map((event) => <article key={event.id} className="rounded-2xl border border-slate-100 bg-surface-subtle p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-black text-slate-900">{event.action.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">{event.actor?.name || event.actor?.email || "System"} · {event.createdAt.toLocaleString("en-PH")}</p></div><StatusBadge tone={event.module === "PLATFORM" ? "ai" : "info"}>{event.module}</StatusBadge></div><p className="mt-3 text-xs font-semibold text-slate-500">{event.tenantId ? tenantName.get(event.tenantId) || "Tenant" : "Platform"} · {event.entityType || "No entity"}</p></article>)}</div>
      {!events.length && <p className="py-12 text-center text-sm text-slate-500">No audit events recorded.</p>}
    </WorkspaceCard>
  </div>;
}
