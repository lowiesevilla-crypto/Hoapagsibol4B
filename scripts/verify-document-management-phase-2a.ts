import fs from "node:fs/promises";
import { PrismaClient, DocumentDefinitionStatus } from "@prisma/client";

const prisma = new PrismaClient();

function assertCondition(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

async function main() {
  const [
    definitions,
    hub,
    legacy,
    sidebarLinks,
    sidebar,
    adminLayout,
    definitionPage,
    workflowControls,
    documentActions,
    actionCountService,
    walkInPage,
    templatesPage,
    legacyDocumentTypesPage,
    archivePage,
    generatedPage,
    templateEditor,
  ] = await Promise.all([
    prisma.documentDefinition.findMany({ include: { assignedTemplateVersion: { include: { templateSet: true } }, fields: { where: { active: true } } } }),
    fs.readFile("app/admin/documents/page.tsx", "utf8"),
    fs.readFile("app/admin/document-templates/page.tsx", "utf8"),
    fs.readFile("components/sidebar-links.ts", "utf8"),
    fs.readFile("components/sidebar.tsx", "utf8"),
    fs.readFile("app/admin/layout.tsx", "utf8"),
    fs.readFile("app/admin/settings/document-definitions/page.tsx", "utf8"),
    fs.readFile("components/document-definition-workflow-controls.tsx", "utf8"),
    fs.readFile("lib/actions/documents.ts", "utf8"),
    fs.readFile("lib/services/document-request-action-count.ts", "utf8"),
    fs.readFile("app/admin/documents/new/page.tsx", "utf8"),
    fs.readFile("app/admin/settings/document-definitions/[id]/templates/page.tsx", "utf8"),
    fs.readFile("app/admin/settings/document-types/page.tsx", "utf8"),
    fs.readFile("app/admin/documents/archive/page.tsx", "utf8"),
    fs.readFile("app/admin/documents/generated/page.tsx", "utf8"),
    fs.readFile("components/professional-document-template-editor.tsx", "utf8"),
  ]);
  const keys = new Set<string>();
  for (const definition of definitions) {
    const key = `${definition.tenantId}:${definition.code}`;
    assertCondition(!keys.has(key), `duplicate tenant/code ${key}`);
    keys.add(key);
    if (definition.assignedTemplateVersion) {
      assertCondition(definition.assignedTemplateVersion.tenantId === definition.tenantId, `cross-tenant assigned template for ${definition.code}`);
      assertCondition(definition.assignedTemplateVersion.templateSet.tenantId === definition.tenantId, `cross-tenant template set for ${definition.code}`);
      assertCondition(definition.assignedTemplateVersion.templateSet.definitionId === definition.id, `template definition mismatch for ${definition.code}`);
    }
    if (definition.walkInEnabled) {
      assertCondition(definition.status === DocumentDefinitionStatus.ACTIVE && definition.active && !definition.archivedAt, `inactive walk-in definition ${definition.code}`);
      assertCondition(Boolean(definition.assignedTemplateVersion && definition.assignedTemplateVersion.status === "PUBLISHED"), `walk-in definition without a published template ${definition.code}`);
    }
  }
  assertCondition(hub.includes("Document Definition Diagnostics"), "diagnostics panel is missing from the hub");
  assertCondition(!hub.includes("Expected document type inventory"), "duplicate inventory cards remain on the normal hub");
  assertCondition(!hub.includes('aria-label="Document management sections"'), "duplicate in-page document management navigation remains on the hub");
  assertCondition(!hub.includes('href="/admin/documents/new">Create Walk-In / Office Request'), "duplicate walk-in shortcut remains in the hub header");
  assertCondition(hub.includes('aria-label="Document request filters"'), "request-specific segmented filters are missing");
  assertCondition(hub.includes("RequestViewTab"), "request filters were not converted to the compact segmented control");
  assertCondition(hub.includes(">Needs Action</RequestViewTab>") && hub.includes(">All Requests</RequestViewTab>"), "Needs Action and All Requests filters are missing");
  assertCondition(hub.includes("Walk-In availability"), "walk-in availability is missing from the catalog table");
  assertCondition(hub.includes("Needs Action"), "requests section does not expose a Needs Action view");
  assertCondition(hub.includes("documentRequestNeedsActionWhere(user.tenantId)"), "requests section does not use the authoritative action-needed filter");
  assertCondition(legacy.includes('redirect("/admin/documents?section=templates&notice=legacy-templates")'), "legacy template redirect is not preserved");
  assertCondition(!definitionPage.includes('href="/admin/documents">Document Management') && !definitionPage.includes('href="/admin/documents?section=templates">Templates'), "duplicate document navigation remains on the definitions catalog page");
  assertCondition(!walkInPage.includes("Back to Document Management"), "duplicate back-to-management shortcut remains on the walk-in page");
  assertCondition(!templatesPage.includes('href="/admin/documents?section=templates">Document Management') && !templatesPage.includes("Back to definitions"), "duplicate document navigation remains on the template workspace page");
  assertCondition(!legacyDocumentTypesPage.includes('href="/admin/documents">Document Management') && !legacyDocumentTypesPage.includes('href="/admin/documents?section=templates">Templates'), "duplicate document navigation remains on the legacy document types page");
  assertCondition(!archivePage.includes('href="/admin/documents">Document Management'), "duplicate document navigation remains on the archive page");
  assertCondition(!generatedPage.includes('href="/admin/documents/new">Generate new') && !generatedPage.includes('href="/admin/documents?section=issued">Document Management'), "duplicate document navigation remains on the generated documents page");
  assertCondition(!templateEditor.includes("documentManagementHref") && !templateEditor.includes("> Document Management</a>"), "duplicate document management shortcut remains in the template editor toolbar");

  const residentServicesStart = sidebarLinks.indexOf('href: "/admin/documents?section=types"');
  assertCondition(residentServicesStart >= 0, "Resident Services sidebar group is missing");
  const residentServicesBlock = sidebarLinks.slice(residentServicesStart, sidebarLinks.indexOf('section: "Community"', residentServicesStart));
  const expectedSidebarOrder = [
    "Document Definitions",
    "Templates",
    "Requests",
    "Create Walk-In / Office Request",
    "Issued Documents",
  ];
  let lastIndex = -1;
  for (const label of expectedSidebarOrder) {
    const index = residentServicesBlock.indexOf(`label: "${label}"`);
    assertCondition(index > lastIndex, `Resident Services sidebar label is missing or out of order: ${label}`);
    lastIndex = index;
  }
  assertCondition(sidebarLinks.includes('label: "My Document Requests"'), "homeowner portal My Document Requests link is missing");
  assertCondition(sidebarLinks.includes('label: "Request a Document"'), "homeowner portal Request a Document link is missing");
  assertCondition(sidebarLinks.includes('label: "Issued Documents"'), "homeowner portal Issued Documents link is missing");
  assertCondition(sidebar.includes("linkBadges") && sidebar.includes("sectionBadges") && sidebar.includes("99+"), "sidebar badge rendering is missing");
  assertCondition(sidebar.includes("linkIsActive") && sidebar.includes("new URLSearchParams(query)"), "query-aware active link handling is missing");
  assertCondition(adminLayout.includes("getActionableDocumentRequestCount(user.tenantId)") && adminLayout.includes('"/admin/documents?section=requests"'), "tenant-scoped document request badge count is not wired into admin layout");
  assertCondition(actionCountService.includes("tenantId") && actionCountService.includes("archivedAt: null"), "action count service is not tenant scoped");
  assertCondition(actionCountService.includes("PAYMENT_CONFIRMED") && actionCountService.includes("PENDING_APPROVAL") && actionCountService.includes("UNDER_REVIEW"), "action count service is missing direct action statuses");
  assertCondition(actionCountService.includes("PENDING_REVIEW") && actionCountService.includes("updatedAt: { lt:"), "action count service is missing staff-review and stuck-generation cases");

  for (const section of ["Overview", "Workflow", "Payment and Receipt", "Balance and Release", "Numbering and Validity", "Access and Request Subjects", "Output and Verification", "Template Assignment", "Audit / Change History"]) {
    assertCondition(definitionPage.includes(section), `definition configuration section missing: ${section}`);
  }
  assertCondition(definitionPage.includes("Persisted effective configuration"), "persisted effective configuration summary is missing");
  assertCondition(definitionPage.includes("approverUsers") && definitionPage.includes("workflowDefinition"), "definition page does not load approval workflow data");
  assertCondition(workflowControls.includes("CUSTOM") && workflowControls.includes("Related rule fields are preset-controlled"), "custom workflow control mode is missing");
  assertCondition(workflowControls.includes("Requires Payment") && workflowControls.includes("Requires Approval") && workflowControls.includes("Auto-Generate After Payment"), "effective workflow rule controls are missing");
  assertCondition(workflowControls.includes("Receipt Type") && workflowControls.includes("Approver Role") && workflowControls.includes("Specific Approver"), "receipt or approver controls are missing");
  assertCondition(documentActions.includes('workflowPreset === "CUSTOM"') && documentActions.includes("customWorkflowFieldsFromForm"), "server action does not parse custom workflow rules");
  assertCondition(documentActions.includes("saveApprovalWorkflowForDefinition") && documentActions.includes("DocumentWorkflowStepType.APPROVAL"), "server action does not persist approval workflow settings");
  console.log(`PASS: Phase 2A document management checks verified ${definitions.length} tenant-scoped definitions, template ownership, walk-in requestability, diagnostics, legacy redirect, sidebar UX, request counters, and editable workflow rules.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
