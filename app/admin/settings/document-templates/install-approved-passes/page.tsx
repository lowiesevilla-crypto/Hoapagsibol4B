import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireDocumentTemplateAdmin } from "@/lib/document-template-admin";
import {
  assertApprovedPassTemplateInstallerRole,
  approvedPassTemplateInstallerEnabled,
  targetTenantId,
} from "@/lib/services/approved-pass-template-installer";
import {
  applyApprovedPassTemplateInstallerAction,
  approvedPassTemplateInstallerSnapshot,
  dryRunApprovedPassTemplateInstallerAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Query = { status?: string; message?: string };

export default async function InstallApprovedPassTemplatesPage({ searchParams }: { searchParams: Promise<Query> }) {
  noStore();
  if (!approvedPassTemplateInstallerEnabled()) notFound();
  const admin = await requireDocumentTemplateAdmin();
  try {
    assertApprovedPassTemplateInstallerRole(admin.role);
  } catch {
    notFound();
  }
  if (admin.tenantId !== targetTenantId) notFound();
  const query = await searchParams;
  let snapshot: Awaited<ReturnType<typeof approvedPassTemplateInstallerSnapshot>> | null = null;
  let loadError: string | null = null;
  try {
    snapshot = await approvedPassTemplateInstallerSnapshot({ actorUserId: admin.id, tenantId: admin.tenantId });
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Approved pass template installer is unavailable.";
  }
  const plans = snapshot?.plans ?? [];
  const blocked = plans.some((plan) => plan.action === "BLOCKED");
  const applyReady = Boolean(snapshot?.dryRunReady && !blocked);

  return <>
    <PageHeader
      eyebrow="Document templates"
      title="Install Approved Pass Drafts"
      description="Create the project-owner approved Gate Pass and Move-In/Move-Out Draft templates without changing published assignments."
    />
    <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
      Temporary production installer. It creates Draft versions only; it never publishes templates, changes assigned versions, or modifies document workflows.
    </section>
    {query.message && <Notice kind={query.status === "error" || query.status === "blocked" ? "error" : "success"}>{query.message}</Notice>}
    {loadError && <Notice kind="error">{loadError}</Notice>}

    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className="card">
        <h2 className="text-lg font-black">Dry-Run Result</h2>
        <p className="mt-1 text-sm text-slate-500">Live production state is re-read before apply. A mostly matching state is not enough; both target definitions must pass.</p>
        <div className="mt-5 grid gap-4">
          {plans.length ? plans.map((plan) => <article key={plan.key} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-950">{plan.definitionName || plan.target}</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">Definition {plan.definitionId}</p>
              </div>
              <span className={`badge ${plan.action === "BLOCKED" ? "badge-overdue" : plan.action === "CREATE_DRAFT" ? "badge-info" : "badge-paid"}`}>{plan.action.replaceAll("_", " ")}</span>
            </div>
            {plan.blockReason && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-800">{plan.blockReason}</p>}
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
              <Info label="Assigned published" value={`v${plan.assignedPublishedVersionNumber} ${plan.assignedStatus}`} />
              <Info label="Template set" value={plan.templateSetId} />
              <Info label="Highest version" value={`v${plan.currentHighestVersion}`} />
              <Info label="Next draft" value={`v${plan.nextVersion}`} />
              <Info label="Approved hash" value={plan.approvedPackageContentHash} />
              <Info label="Assigned version ID" value={plan.assignedTemplateVersionId} />
            </div>
            <div className="mt-4 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[360px] text-left text-xs">
                <thead className="bg-slate-100 text-slate-600"><tr><th className="p-2">Version</th><th className="p-2">Status</th><th className="p-2">Approved package</th></tr></thead>
                <tbody>{plan.versionStatuses.map((version) => <tr key={`${plan.key}-${version.version}`} className="border-t"><td className="p-2 font-black">v{version.version}</td><td className="p-2">{version.status}</td><td className="p-2">{version.matchesApprovedPackage ? "Matches" : "No"}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="mt-4">
              <Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/admin/settings/document-definitions/${plan.definitionId}/templates`}>Open Template Editor</Link>
            </div>
          </article>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Run dry-run after production variables are enabled and the approved tenant state is available.</p>}
        </div>
      </section>

      <aside className="space-y-5">
        <section className="card">
          <h2 className="text-lg font-black">Step 1</h2>
          <p className="mt-1 text-sm text-slate-500">Dry-run validates current assigned published versions, draft status, version history, approved hashes, and target tenant ownership.</p>
          <form action={dryRunApprovedPassTemplateInstallerAction} className="mt-4">
            <button className="btn-primary min-h-11 w-full" type="submit">Run Dry-Run</button>
          </form>
        </section>

        <section className="card">
          <h2 className="text-lg font-black">Step 2</h2>
          <p className="mt-1 text-sm text-slate-500">Apply is enabled only after a successful dry-run in this authenticated session.</p>
          <form action={applyApprovedPassTemplateInstallerAction} className="mt-4 space-y-4">
            <label className="block">
              <span className="label">Confirmation phrase</span>
              <input className="field" name="confirmationPhrase" placeholder={snapshot?.confirmationPhrase ?? ""} disabled={!applyReady} required />
            </label>
            <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">
              <input className="mt-1 size-5" type="checkbox" name="publishedUnchanged" disabled={!applyReady} required />
              Published templates and assigned versions will remain unchanged.
            </label>
            <button className="btn-primary min-h-11 w-full disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={!applyReady}>Create Draft Versions</button>
          </form>
          {!applyReady && <p className="mt-3 text-xs font-semibold text-slate-500">Run a clean dry-run first.</p>}
        </section>
      </aside>
    </div>
  </>;
}

function Info({ label, value }: { label: string; value: string | number }) {
  return <p className="min-w-0"><span className="block font-bold text-slate-500">{label}</span><span className="block break-all font-black text-slate-900">{value}</span></p>;
}

function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return <div className={`mb-5 rounded-xl border p-4 text-sm font-semibold ${kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>;
}
