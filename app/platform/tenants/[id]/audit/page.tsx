import { StandardTable } from "@/components/standard-table";
import { notFound } from "next/navigation";
import { PlatformTenantTabs } from "@/components/platform-tenant-tabs";
import { prisma } from "@/lib/db";

export default async function TenantAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const tenant = await prisma.tenant.findUnique({ where: { id } }); if (!tenant) notFound();
  const logs = await prisma.auditLog.findMany({ where: { tenantId: id, module: "PLATFORM" }, include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  return <div><p className="text-sm font-bold uppercase tracking-wider text-leaf-700">{tenant.name}</p><h1 className="text-3xl font-black">Platform Audit Log</h1><PlatformTenantTabs tenantId={id} active="audit"/><div className="mt-5 max-h-[65vh] overflow-auto rounded-2xl border bg-white"><StandardTable><table className="min-w-[800px] text-sm"><thead className="sticky top-0 bg-slate-100 text-left"><tr><th className="p-4">Date</th><th className="p-4">Action</th><th className="p-4">Actor</th><th className="p-4">Record</th><th className="p-4">Details</th></tr></thead><tbody>{logs.map((log)=><tr key={log.id} className="border-t"><td className="p-4">{log.createdAt.toLocaleString()}</td><td className="p-4 font-bold">{log.action.replaceAll("_"," ")}</td><td className="p-4">{log.actor?.name || "System"}<br/><span className="text-xs text-slate-500">{log.actor?.email}</span></td><td className="p-4">{log.entityType}<br/><span className="font-mono text-xs">{log.entityId}</span></td><td className="max-w-md break-words p-4 text-xs text-slate-600">{log.metadata ? JSON.stringify(log.metadata) : "-"}</td></tr>)}</tbody></table></div></StandardTable>{!logs.length&&<p className="mt-5 rounded-2xl border border-dashed bg-white p-10 text-center text-slate-600">No platform audit activity recorded for this tenant.</p>}</div>;
}
