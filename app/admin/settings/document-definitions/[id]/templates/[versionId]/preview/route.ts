import { DocumentGenerationMode, DocumentPlaceholderOwnership } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireDocumentTemplateAdmin } from "@/lib/document-template-admin";
import { prisma } from "@/lib/db";
import { getActiveOrganizationOfficers, organizationOfficerTerm } from "@/lib/organization";
import { allowedDocumentPlaceholders } from "@/lib/services/document-template-builder";
import { buildDocumentRenderModel } from "@/lib/services/document-render-model";
import { type PlaceholderDefinition } from "@/lib/services/document-placeholders";
import { htmlDocumentRenderer } from "@/lib/services/document-renderers";
import { getAssociationSettings } from "@/lib/system-settings";
import { shortDate } from "@/lib/utils";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  return renderPreview(undefined, params);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const formData = await request.formData();
  const serialized = formData.get("templateDefinitionJson");
  if (typeof serialized !== "string" || !serialized.trim()) return new NextResponse("Template definition is required.", { status: 400 });
  let templateDefinition: unknown;
  try {
    templateDefinition = JSON.parse(serialized);
  } catch {
    return new NextResponse("Template definition is invalid.", { status: 400 });
  }
  return renderPreview(templateDefinition, params);
}

async function renderPreview(templateDefinitionOverride: unknown, params: Promise<{ id: string; versionId: string }>) {
  const admin = await requireDocumentTemplateAdmin();
  const { id, versionId } = await params;
  const version = await prisma.documentTemplateVersion.findFirst({
    where: { id: versionId, tenantId: admin.tenantId },
    include: { templateSet: { include: { definition: true } } },
  });
  if (!version || version.templateSet.definitionId !== id) return new NextResponse("Template version not found.", { status: 404 });

  const [association, officers, customDefinitions] = await Promise.all([
    getAssociationSettings(admin.tenantId),
    getActiveOrganizationOfficers(admin.tenantId),
    prisma.documentPlaceholderDefinition.findMany({ where: { tenantId: admin.tenantId, ownership: "TENANT", active: true }, orderBy: [{ category: "asc" }, { key: "asc" }] }),
  ]);
  const placeholderDefinitions: PlaceholderDefinition[] = [
    ...allowedDocumentPlaceholders.map((key) => ({ key, category: "Platform", displayName: key, description: "Platform document placeholder.", dataType: "TEXT", sample: key, sensitivity: null, ownership: DocumentPlaceholderOwnership.PLATFORM })),
    ...customDefinitions.map((item) => ({ key: item.key, category: item.category, displayName: item.displayName, description: item.description || "Tenant-defined placeholder.", dataType: item.dataType, sample: item.exampleValue || `{{${item.key}}}`, sensitivity: item.sensitivity, ownership: DocumentPlaceholderOwnership.TENANT })),
  ];
  const issueDate = new Date();
  const model = buildDocumentRenderModel({
    templateDefinition: templateDefinitionOverride ?? version.definitionJson,
    title: version.templateSet.definition.displayName,
    documentNumber: "PREVIEW",
    issueDate: shortDate(issueDate),
    validUntil: null,
    verificationUrl: null,
    mode: DocumentGenerationMode.PREVIEW,
    placeholderMode: "DESIGNER_PREVIEW",
    placeholderContext: {
      tenantId: admin.tenantId,
      tenant: { name: association.name, address: association.address, tin: association.tinNumber, secRegistration: association.secRegistrationNumber, contactNumber: association.contactNumber, email: association.email, logo: association.logoUrl },
      document: { number: "PREVIEW", title: version.templateSet.definition.displayName, issueDate: shortDate(issueDate), issuePlace: association.address || association.name, status: "Preview" },
      subject: { fullName: "Juan Dela Cruz", relationship: "Homeowner", address: "Block 1 Lot 2", birthDate: "January 1, 1990", civilStatus: "Married", nationality: "Filipino", status: "Owner occupied", residencyStartDate: "January 1, 2020", age: 39, occupation: "Property manager", contactNumber: "0917 000 0000", phase: "Phase 2", propertyType: "Residential", occupancyStatus: "Owner occupied" },
      property: { block: "1", lot: "2", address: "Block 1 Lot 2", accountNumber: "12345678901", accountLabel: "Block 1 Lot 2", phase: "Phase 2", subdivision: association.name },
      request: { purpose: "For official purposes", remarks: "No remarks", copies: 1, requestedAt: shortDate(issueDate) },
      signatory: { name: officers[0]?.fullName || "Authorized HOA Officer", position: officers[0]?.position || "Authorized Signatory" },
      verification: { code: "PREVIEW" },
      system: { generatedAt: shortDate(issueDate), platformName: "HOAHub" },
      organization: { tenantId: admin.tenantId, term: organizationOfficerTerm(officers), officers: officers.map((officer) => ({ id: officer.id, fullName: officer.fullName, position: officer.position, displayOrder: officer.displayOrder })) },
      permissions: new Set<string>(["DOCUMENT_PLACEHOLDER:PERSONAL", "DOCUMENT_PLACEHOLDER:FINANCIAL", "DOCUMENT_PLACEHOLDER:VIOLATION"]),
    },
    placeholderDefinitions,
  });
  const rendered = await htmlDocumentRenderer.render(model);
  return new NextResponse(rendered.content, {
    headers: {
      "Content-Type": rendered.contentType,
      "Cache-Control": "no-store, max-age=0",
      "Content-Disposition": `inline; filename="${version.templateSet.definition.code}-preview.html"`,
    },
  });
}
