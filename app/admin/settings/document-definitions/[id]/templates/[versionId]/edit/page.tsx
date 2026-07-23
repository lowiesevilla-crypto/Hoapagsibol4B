import Link from "next/link";
import type React from "react";
import { DocumentTemplateVersionStatus } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { ProfessionalDocumentTemplateEditor } from "@/components/professional-document-template-editor";
import { saveDocumentTemplateVersionAction } from "@/lib/actions/documents";
import { requireDocumentTemplateAdmin } from "@/lib/document-template-admin";
import { prisma } from "@/lib/db";
import { normalizeTemplateDefinition } from "@/lib/services/document-template-builder";
import { getActiveOrganizationOfficers } from "@/lib/organization";
import { getAssociationSettings } from "@/lib/system-settings";

export default async function TemplateVersionEditorPage({ params, searchParams }: { params: Promise<{ id: string; versionId: string }>; searchParams: Promise<{ error?: string; success?: string; message?: string }> }) {
  const admin = await requireDocumentTemplateAdmin();
  const { id, versionId } = await params;
  const query = await searchParams;
  const version = await prisma.documentTemplateVersion.findFirst({
    where: { id: versionId, tenantId: admin.tenantId },
    include: { templateSet: { include: { definition: true } } },
  });
  if (!version || version.templateSet.definitionId !== id) return <p className="card">Template version not found.</p>;
  const definition = version.templateSet.definition;
  const customPlaceholders = await prisma.documentPlaceholderDefinition.findMany({ where: { tenantId: admin.tenantId, ownership: "TENANT", active: true }, orderBy: [{ category: "asc" }, { key: "asc" }], select: { key: true, category: true, displayName: true, description: true, dataType: true, exampleValue: true, sensitivity: true } });
  const [officers, association] = await Promise.all([
    getActiveOrganizationOfficers(admin.tenantId),
    getAssociationSettings(admin.tenantId),
  ]);
  const template = normalizeTemplateDefinition(version.definitionJson, definition.displayName);
  const editable = version.status === DocumentTemplateVersionStatus.DRAFT;
  return <>
    <PageHeader
      eyebrow="Document template authoring"
      title={`${definition.displayName} v${version.version}`}
      description="Create a structured, Word-style HOA document template with controlled formatting, dynamic fields, draft saving, and publishing."
      action={<Link className="btn-secondary" href={`/admin/settings/document-definitions/${id}/templates`}>Version history</Link>}
    />
    {query.error && <Notice kind="error">{query.error}</Notice>}
    {query.success && <Notice kind="success">{query.message || "Template saved."}</Notice>}
    <ProfessionalDocumentTemplateEditor
      action={saveDocumentTemplateVersionAction}
      tenantId={admin.tenantId}
      userId={admin.id}
      definitionId={id}
      versionId={version.id}
      title={definition.displayName}
      code={definition.code}
      status={version.status}
      editable={editable}
      template={template}
      updatedAt={version.updatedAt.toISOString()}
      templateWorkspaceHref={`/admin/settings/document-definitions/${id}/templates`}
      previewHref={`/admin/settings/document-definitions/${id}/templates/${version.id}/preview`}
      tenantLogoSrc={association.logoUrl}
      customPlaceholders={customPlaceholders.map((item) => ({ key: item.key, group: item.category, label: item.displayName, description: item.description || "Tenant-defined placeholder.", dataType: item.dataType, sample: item.exampleValue || `{{${item.key}}}`, sensitivity: item.sensitivity }))}
      officerPositions={[...new Set(officers.map((officer) => officer.position))]}
      activeOfficerCount={officers.length}
    />
  </>;
}

function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>;
}
