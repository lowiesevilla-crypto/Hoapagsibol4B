import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { applyPublishedTemplateReplicationAction } from "@/lib/actions/published-template-replication";
import { platformPrisma } from "@/lib/db";
import { requireDocumentTemplateAdmin } from "@/lib/document-template-admin";
import {
  canRunPublishedTemplateReplication,
  previewPublishedTemplateReplication,
  type PublishedTemplateReplicationAction,
  type PublishedTemplateReplicationPreview,
} from "@/lib/services/published-template-replication";

const replicationPath = "/admin/documents/operations/template-replication";

type Query = {
  error?: string;
  success?: string;
  message?: string;
};

function actionLabel(action: PublishedTemplateReplicationAction) {
  if (action === "ALREADY_ASSIGNED") return "Already assigned";
  if (action === "ASSIGN_EXISTING_PUBLISHED") return "Assign existing published version";
  return "Create published version and assign";
}

function actionTone(action: PublishedTemplateReplicationAction) {
  if (action === "ALREADY_ASSIGNED") return "badge-paid";
  if (action === "ASSIGN_EXISTING_PUBLISHED") return "badge-info";
  return "badge-due";
}

function nextVersionLabel(
  action: PublishedTemplateReplicationAction,
  plan: PublishedTemplateReplicationPreview["plans"][number],
) {
  if (action === "ALREADY_ASSIGNED") return `Keep target v${plan.targetAssignedVersion}`;
  if (action === "ASSIGN_EXISTING_PUBLISHED") {
    return `Assign target v${plan.matchingPublishedTargetVersion}`;
  }
  return `Create target v${plan.nextTargetVersion}`;
}

export default async function PublishedTemplateReplicationPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const user = await requireDocumentTemplateAdmin();
  if (!canRunPublishedTemplateReplication(user)) {
    redirect("/admin/documents/operations");
  }

  const query = await searchParams;
  let preview: PublishedTemplateReplicationPreview | null = null;
  let previewError: string | null = null;

  try {
    preview = await previewPublishedTemplateReplication(platformPrisma, user.id);
  } catch (error) {
    previewError =
      error instanceof Error
        ? error.message
        : "The replication preview could not be prepared.";
  }

  const requiresChange = preview?.plans.some((plan) => plan.action !== "ALREADY_ASSIGNED") ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Document operations"
        title="Published Template Replication"
        description="Preview and apply the approved published templates from the configured source tenant into this target tenant. The apply step is transactional, audit logged, and protected by the preview digest."
        action={
          <div className="flex flex-wrap gap-2">
            <Link className="btn-secondary" href="/admin/documents/operations">
              Operations
            </Link>
            <Link className="btn-secondary" href="/admin/documents?section=templates">
              Template catalog
            </Link>
            <Link className="btn-primary" href={replicationPath}>
              Refresh preview
            </Link>
          </div>
        }
      />

      {query.error && (
        <Notice kind="error">
          {query.message || "Published template replication failed."}
        </Notice>
      )}
      {query.success && (
        <Notice kind="success">
          {query.message || "Published template replication completed."}
        </Notice>
      )}
      {previewError && <Notice kind="error">{previewError}</Notice>}

      {preview && (
        <>
          <section className="card">
            <div className="mb-5">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                Tenant boundary
              </p>
              <h2 className="mt-1 text-xl font-black">Fixed source → current target</h2>
              <p className="mt-2 text-sm text-slate-500">
                This operation cannot accept tenant IDs from the browser. Both tenant IDs are fixed in server code and the signed-in actor is revalidated before apply.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <TenantPanel
                label="Source tenant"
                name={preview.sourceTenant.name}
                id={preview.sourceTenant.id}
              />
              <TenantPanel
                label="Target tenant"
                name={preview.targetTenant.name}
                id={preview.targetTenant.id}
              />
            </div>
          </section>

          <section className="card p-0 sm:p-0">
            <div className="border-b border-slate-200 p-5 sm:p-6">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                    Dry-run preview
                  </p>
                  <h2 className="mt-1 text-xl font-black">Replication plan</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    No template data is changed while viewing this plan.
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs">
                  <p className="font-black text-slate-500">Plan digest</p>
                  <code className="break-all font-bold text-slate-700">{preview.planDigest}</code>
                </div>
              </div>
            </div>
            <div className="table-wrap rounded-none shadow-none">
              <table className="data-table min-w-[1100px]">
                <thead>
                  <tr>
                    <th>Document type</th>
                    <th>Source</th>
                    <th>Current target</th>
                    <th>Planned result</th>
                    <th>Action</th>
                    <th>Content hash</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.plans.map((plan) => (
                    <tr key={plan.type}>
                      <td>
                        <p className="font-black">{plan.targetDefinitionName}</p>
                        <code className="text-xs text-slate-500">{plan.type}</code>
                      </td>
                      <td className="font-bold">Published v{plan.requestedSourceVersion}</td>
                      <td>Published v{plan.targetAssignedVersion}</td>
                      <td className="font-bold">{nextVersionLabel(plan.action, plan)}</td>
                      <td>
                        <span className={`badge ${actionTone(plan.action)}`}>
                          {actionLabel(plan.action)}
                        </span>
                      </td>
                      <td>
                        <code className="text-xs text-slate-500">
                          {plan.sourceContentHash.slice(0, 20)}…
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={`rounded-3xl border p-5 sm:p-7 ${requiresChange ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Apply control
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  {requiresChange
                    ? "Confirm the exact preview before applying"
                    : "All requested templates are already assigned"}
                </h2>
                <p className="mt-2 text-sm text-slate-700">
                  Apply recomputes the plan inside the transaction. If any source or target template state has changed since this preview, the digest will no longer match and the transaction will abort without partial assignment.
                </p>
              </div>

              {requiresChange ? (
                <form action={applyPublishedTemplateReplicationAction} className="w-full max-w-xl rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
                  <input type="hidden" name="planDigest" value={preview.planDigest} />
                  <label className="flex items-start gap-3 text-sm font-bold text-slate-700">
                    <input
                      className="mt-1 h-4 w-4"
                      type="checkbox"
                      name="acknowledge"
                      value="YES"
                      required
                    />
                    <span>
                      I reviewed this dry-run plan and authorize the target tenant to use these exact published template contents.
                    </span>
                  </label>
                  <button className="btn-primary mt-4 w-full" type="submit">
                    Confirm &amp; Replicate Published Templates
                  </button>
                  <p className="mt-3 text-xs text-slate-500">
                    The operation creates target-local versions only when required, preserves historical versions, writes audit records, and verifies the final assignments before reporting completion.
                  </p>
                </form>
              ) : (
                <div className="w-full max-w-xl rounded-2xl border border-emerald-200 bg-white p-4 text-sm font-bold text-emerald-800 shadow-sm">
                  No database mutation is required. Open the template catalog and preview the three active published templates.
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <h2 className="text-xl font-black">Post-apply verification</h2>
            <p className="mt-2 text-sm text-slate-500">
              After the operation reports COMPLETED_AND_VERIFIED, verify the rendered target-tenant content rather than only the version numbers.
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>Open Document Management → Templates.</li>
              <li>Preview Gate Pass, Move-In / Move-Out Pass, and Certificate of Residency.</li>
              <li>Confirm target tenant name, address, signatories, document number, and QR/runtime values resolve from the target tenant.</li>
              <li>Create a controlled test request for each document type and verify generated output before normal use.</li>
            </ol>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link className="btn-primary" href="/admin/documents?section=templates">
                Verify published templates
              </Link>
              <Link className="btn-secondary" href="/admin/documents?section=types">
                Verify document types
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function TenantPanel({ label, name, id }: { label: string; name: string; id: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-900">{name}</p>
      <code className="mt-1 block break-all text-xs text-slate-500">{id}</code>
    </div>
  );
}

function Notice({
  kind,
  children,
}: {
  kind: "success" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 text-sm font-bold ${
        kind === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-rose-200 bg-rose-50 text-rose-900"
      }`}
    >
      {children}
    </div>
  );
}
