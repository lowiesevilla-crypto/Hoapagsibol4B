import Link from "next/link";
import { Database, FolderLock, HardDrive, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { formatRepositoryStorage } from "@/lib/document-repository/quota";
import { listPlatformRepositoryUsage } from "@/lib/document-repository/platform-usage";

function percent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return value === null ? "Unlimited" : ">100%";
  return `${Math.round(value * 100)}%`;
}

function quotaBadge(state: string) {
  if (state === "OVER_LIMIT" || state === "AT_LIMIT") return "bg-rose-100 text-rose-800";
  if (state === "CRITICAL" || state === "WARNING") return "bg-amber-100 text-amber-900";
  if (state === "UNLIMITED") return "bg-blue-100 text-blue-800";
  return "bg-emerald-100 text-emerald-800";
}

export default async function PlatformDocumentManagementPage() {
  const rows = await listPlatformRepositoryUsage();
  const entitled = rows.filter((row) => row.entitled).length;
  const totalDocuments = rows.reduce((sum, row) => sum + row.documentCount, 0);
  const totalBytes = rows.reduce((sum, row) => sum + row.totalBytes, BigInt(0));
  const attention = rows.filter((row) => ["WARNING", "CRITICAL", "AT_LIMIT", "OVER_LIMIT"].includes(row.quota.state)).length;

  return <>
    <PageHeader
      eyebrow="Platform operations"
      title="Document Management usage"
      description="Commercial and storage visibility by tenant. This report reads tenant-scoped usage metadata only and does not expose document titles, file paths, content, or homeowner downloads."
      action={<Link className="btn-secondary" href="/platform/plans">Manage plans</Link>}
    />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Entitled tenants", value: `${entitled} / ${rows.length}`, icon: FolderLock },
        { label: "Managed documents", value: totalDocuments.toLocaleString(), icon: Database },
        { label: "Repository storage", value: formatRepositoryStorage(totalBytes), icon: HardDrive },
        { label: "Quota attention", value: attention.toLocaleString(), icon: TriangleAlert },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="card">
        <span className="grid size-11 place-items-center rounded-2xl bg-pine-50 text-pine-700"><Icon className="size-5" /></span>
        <p className="mt-4 text-xs font-black uppercase tracking-wider text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
      </article>)}
    </section>

    <section className="mt-6 overflow-hidden rounded-3xl border bg-white shadow-sm">
      <div className="border-b px-5 py-4 sm:px-6">
        <h2 className="text-lg font-black text-slate-950">Tenant repository consumption</h2>
        <p className="mt-1 text-sm text-slate-500">80% and 90% thresholds are surfaced before the hard quota is reached. Downgrades never delete repository files.</p>
      </div>
      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500"><tr>
            <th className="px-5 py-3">Tenant</th><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Feature</th><th className="px-5 py-3">Documents</th><th className="px-5 py-3">Used</th><th className="px-5 py-3">Limit</th><th className="px-5 py-3">Utilization</th><th className="px-5 py-3">State</th><th className="px-5 py-3"></th>
          </tr></thead>
          <tbody className="divide-y">{rows.map((row) => <tr key={row.tenantId}>
            <td className="px-5 py-4"><p className="font-black text-slate-900">{row.tenantName}</p><p className="text-xs text-slate-400">{row.tenantSlug}</p></td>
            <td className="px-5 py-4"><p className="font-bold">{row.planCode}</p><p className="text-xs text-slate-400">{row.subscriptionStatus.replaceAll("_", " ")}</p></td>
            <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${row.entitled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{row.entitled ? "ENABLED" : "DISABLED"}</span><p className="mt-1 text-xs text-slate-400">{row.enabledSource.replaceAll("_", " ")}</p></td>
            <td className="px-5 py-4 font-bold">{row.documentCount.toLocaleString()}</td>
            <td className="px-5 py-4">{formatRepositoryStorage(row.totalBytes)}</td>
            <td className="px-5 py-4">{row.quota.limitBytes == null ? "Unlimited" : formatRepositoryStorage(row.quota.limitBytes)}</td>
            <td className="px-5 py-4 font-bold">{percent(row.quota.utilization)}</td>
            <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${quotaBadge(row.quota.state)}`}>{row.quota.state.replaceAll("_", " ")}</span></td>
            <td className="px-5 py-4"><Link className="font-black text-pine-700 hover:underline" href={`/platform/tenants/${row.tenantId}/features`}>Controls</Link></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="grid gap-3 p-4 lg:hidden">{rows.map((row) => <article key={row.tenantId} className="rounded-2xl border p-4">
        <div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-slate-950">{row.tenantName}</h3><p className="text-xs text-slate-500">{row.planCode} · {row.subscriptionStatus.replaceAll("_", " ")}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-black ${quotaBadge(row.quota.state)}`}>{row.quota.state.replaceAll("_", " ")}</span></div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs font-bold uppercase text-slate-400">Documents</p><p className="font-black">{row.documentCount}</p></div><div><p className="text-xs font-bold uppercase text-slate-400">Used</p><p className="font-black">{formatRepositoryStorage(row.totalBytes)}</p></div><div><p className="text-xs font-bold uppercase text-slate-400">Limit</p><p className="font-black">{row.quota.limitBytes == null ? "Unlimited" : formatRepositoryStorage(row.quota.limitBytes)}</p></div><div><p className="text-xs font-bold uppercase text-slate-400">Utilization</p><p className="font-black">{percent(row.quota.utilization)}</p></div></div>
        <Link className="btn-secondary mt-4 inline-flex min-h-11 w-full items-center justify-center" href={`/platform/tenants/${row.tenantId}/features`}>Tenant feature controls</Link>
      </article>)}</div>
    </section>
  </>;
}
