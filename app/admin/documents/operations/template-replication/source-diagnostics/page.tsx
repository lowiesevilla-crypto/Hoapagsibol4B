import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { platformPrisma } from "@/lib/db";
import { requireDocumentTemplateAdmin } from "@/lib/document-template-admin";
import {
  canRunPublishedTemplateReplication,
  publishedTemplateReplicationRequests,
  publishedTemplateReplicationSourceTenantId,
} from "@/lib/services/published-template-replication";

const replicationPath = "/admin/documents/operations/template-replication";

export default async function PublishedTemplateReplicationSourceDiagnosticsPage() {
  const user = await requireDocumentTemplateAdmin();
  if (!canRunPublishedTemplateReplication(user)) {
    redirect("/admin/documents/operations");
  }

  const diagnostics = await Promise.all(
    publishedTemplateReplicationRequests.map(async (spec) => {
      const [legacyTemplate, definitions] = await Promise.all([
        platformPrisma.documentTemplate.findUnique({
          where: {
            tenantId_type: {
              tenantId: publishedTemplateReplicationSourceTenantId,
              type: spec.type,
            },
          },
          select: {
            id: true,
            title: true,
            active: true,
            version: true,
            definitionId: true,
            templateSetId: true,
            publishedTemplateVersionId: true,
            updatedAt: true,
          },
        }),
        platformPrisma.documentDefinition.findMany({
          where: {
            tenantId: publishedTemplateReplicationSourceTenantId,
            legacyType: spec.type,
          },
          select: {
            id: true,
            code: true,
            displayName: true,
            status: true,
            active: true,
            assignedTemplateVersionId: true,
            assignedTemplateVersion: {
              select: {
                id: true,
                version: true,
                status: true,
                templateSetId: true,
                publishedAt: true,
              },
            },
            templateSets: {
              select: {
                id: true,
                name: true,
                active: true,
                ownershipType: true,
                editable: true,
                versions: {
                  select: {
                    id: true,
                    version: true,
                    status: true,
                    publishedAt: true,
                    createdAt: true,
                  },
                  orderBy: [{ version: "asc" }, { createdAt: "asc" }],
                },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        }),
      ]);

      return { spec, legacyTemplate, definitions };
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Document operations"
        title="Replication Source Diagnostics"
        description="Read-only production diagnostics for the fixed source tenant. This page exposes the actual legacy version, matching document definitions, template sets, and version statuses used to resolve the approved replication sources."
        action={
          <div className="flex flex-wrap gap-2">
            <Link className="btn-secondary" href={replicationPath}>
              Replication preview
            </Link>
            <Link className="btn-primary" href={`${replicationPath}/source-diagnostics`}>
              Refresh diagnostics
            </Link>
          </div>
        }
      />

      <section className="card">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">Fixed source tenant</p>
        <code className="mt-2 block break-all text-sm font-bold text-slate-800">
          {publishedTemplateReplicationSourceTenantId}
        </code>
        <p className="mt-3 text-sm text-slate-600">
          This page is read-only. It does not publish, assign, clone, or modify templates.
        </p>
      </section>

      {diagnostics.map(({ spec, legacyTemplate, definitions }) => (
        <section className="card p-0 sm:p-0" key={spec.type}>
          <div className="border-b border-slate-200 p-5 sm:p-6">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">{spec.type}</p>
                <h2 className="mt-1 text-xl font-black">Requested source v{spec.sourceVersion}</h2>
              </div>
              <span
                className={`badge ${
                  legacyTemplate?.active && legacyTemplate.version === spec.sourceVersion
                    ? "badge-paid"
                    : "badge-due"
                }`}
              >
                Legacy {legacyTemplate ? `v${legacyTemplate.version}` : "missing"}
              </span>
            </div>
          </div>

          <div className="grid gap-4 border-b border-slate-200 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
            <DiagnosticValue label="Legacy active" value={legacyTemplate ? String(legacyTemplate.active) : "missing"} />
            <DiagnosticValue label="Legacy version" value={legacyTemplate ? `v${legacyTemplate.version}` : "missing"} />
            <DiagnosticValue label="Legacy definition link" value={legacyTemplate?.definitionId ?? "none"} mono />
            <DiagnosticValue label="Legacy published version link" value={legacyTemplate?.publishedTemplateVersionId ?? "none"} mono />
          </div>

          {!definitions.length ? (
            <div className="p-5 text-sm font-bold text-rose-800 sm:p-6">
              No DocumentDefinition exists for this source type.
            </div>
          ) : (
            <div className="space-y-5 p-5 sm:p-6">
              {definitions.map((definition, index) => (
                <div className="rounded-2xl border border-slate-200" key={definition.id}>
                  <div className="border-b border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="font-black text-slate-900">
                          Definition {index + 1}: {definition.displayName}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          code={definition.code} · status={definition.status} · active={String(definition.active)}
                        </p>
                        <code className="mt-1 block break-all text-xs text-slate-500">{definition.id}</code>
                      </div>
                      <div className="text-sm font-bold text-slate-700">
                        {definition.assignedTemplateVersion
                          ? `Assigned v${definition.assignedTemplateVersion.version} (${definition.assignedTemplateVersion.status})`
                          : "No assigned version"}
                      </div>
                    </div>
                  </div>

                  {!definition.templateSets.length ? (
                    <div className="p-4 text-sm text-slate-600">No template sets belong to this definition.</div>
                  ) : (
                    <div className="table-wrap rounded-none border-0 shadow-none">
                      <table className="data-table min-w-[900px]">
                        <thead>
                          <tr>
                            <th>Template set</th>
                            <th>Set ID</th>
                            <th>Version</th>
                            <th>Status</th>
                            <th>Published at</th>
                            <th>Resolver match</th>
                          </tr>
                        </thead>
                        <tbody>
                          {definition.templateSets.flatMap((set) =>
                            set.versions.length
                              ? set.versions.map((version) => {
                                  const exactMatch =
                                    version.version === spec.sourceVersion && version.status === "PUBLISHED";
                                  return (
                                    <tr key={version.id}>
                                      <td>
                                        <p className="font-bold">{set.name}</p>
                                        <p className="text-xs text-slate-500">
                                          {set.ownershipType} · active={String(set.active)} · editable={String(set.editable)}
                                        </p>
                                      </td>
                                      <td><code className="text-xs">{set.id}</code></td>
                                      <td className="font-black">v{version.version}</td>
                                      <td>{version.status}</td>
                                      <td>{version.publishedAt ? version.publishedAt.toISOString() : "—"}</td>
                                      <td>
                                        <span className={`badge ${exactMatch ? "badge-paid" : "badge-info"}`}>
                                          {exactMatch ? "EXACT PUBLISHED MATCH" : "No"}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })
                              : [
                                  <tr key={`${set.id}-empty`}>
                                    <td className="font-bold">{set.name}</td>
                                    <td><code className="text-xs">{set.id}</code></td>
                                    <td colSpan={4}>No versions</td>
                                  </tr>,
                                ],
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function DiagnosticValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-widest text-slate-500">{label}</p>
      {mono ? (
        <code className="mt-1 block break-all text-xs font-bold text-slate-800">{value}</code>
      ) : (
        <p className="mt-1 font-black text-slate-900">{value}</p>
      )}
    </div>
  );
}
