import { readFile } from "node:fs/promises";
import { PrismaClient, Role } from "@prisma/client";
import { canManageDocumentTemplates } from "../lib/document-template-access";
import {
  defaultTemplateDefinition,
  documentTemplateSchemaVersion,
  normalizeTemplateDefinition,
  renderTemplateDefinitionText,
  validateTemplateDefinition,
  type DocumentTemplateDefinition,
} from "../lib/services/document-template-builder";

const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function main() {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const dependencyNames = new Set([...Object.keys(packageJson.dependencies ?? {}), ...Object.keys(packageJson.devDependencies ?? {})]);
  const overlappingEditors = ["@tiptap/react", "prosemirror-state", "lexical", "slate", "quill", "@editorjs/editorjs"].filter((name) => dependencyNames.has(name));
  assert(overlappingEditors.length === 0, "no overlapping rich-text editor dependency was introduced");

  const defaultDefinition = defaultTemplateDefinition("Certificate of Residency");
  assert(defaultDefinition.schemaVersion === documentTemplateSchemaVersion, "default template uses the professional schema version");
  assert(validateTemplateDefinition(defaultDefinition).valid, "default professional template validates");
  assert(defaultDefinition.sections.header.length > 0 && defaultDefinition.sections.body.length > 0 && defaultDefinition.sections.footer.length > 0, "default template has header, body, and footer sections");

  const legacy = normalizeTemplateDefinition({
    schemaVersion: 1,
    page: { format: "A4", orientation: "portrait" },
    blocks: [{ id: "legacy-title", type: "documentTitle", text: "Legacy Title", order: 10, visible: true }],
  }, "Legacy Title");
  assert(legacy.schemaVersion === documentTemplateSchemaVersion, "legacy block template normalizes to the professional schema");
  assert(legacy.sections.body.some((block) => block.id === "legacy-title"), "legacy block content remains in the body section");

  const rich = normalizeTemplateDefinition({
    ...defaultDefinition,
    page: {
      ...defaultDefinition.page,
      format: "LETTER",
      orientation: "landscape",
      margins: { top: 12, right: 13, bottom: 14, left: 15 },
      columns: { count: 2, gap: 8 },
      border: { enabled: true, style: "dashed", width: 1, color: "#14532d" },
      backgroundColor: "#ffffff",
    },
    sections: {
      header: defaultDefinition.sections.header,
      body: [
        ...defaultDefinition.sections.body,
        { id: "table-fixture", section: "body", type: "table", order: 90, visible: true, table: { rows: [["Name", "{{subject.fullName}}"], ["Purpose", "{{request.purpose}}"]] } },
        { id: "image-fixture", section: "body", type: "image", order: 100, visible: true, image: { src: "/uploads/tenants/test/settings/document-templates/sample.png", alt: "Sample image" } },
      ],
      footer: defaultDefinition.sections.footer,
    },
  }, "Certificate of Residency");
  assert(validateTemplateDefinition(rich).valid, "page setup, table, image, and placeholder-rich template validates");
  assert(renderTemplateDefinitionText(rich).includes("{{subject.fullName}}"), "rendering contract preserves dynamic placeholders for generation");

  const unsafePlaceholder: DocumentTemplateDefinition = normalizeTemplateDefinition({
    ...defaultDefinition,
    sections: {
      ...defaultDefinition.sections,
      body: [{ id: "bad-placeholder", section: "body", type: "text", order: 10, visible: true, content: "{{homeowner.internalId}}" }],
    },
  }, "Unsafe");
  assert(!validateTemplateDefinition(unsafePlaceholder).valid, "unknown placeholders are rejected");

  const unsafeHtml: DocumentTemplateDefinition = {
    ...defaultDefinition,
    sections: {
      ...defaultDefinition.sections,
      body: [{ id: "unsafe-html", section: "body", type: "text", order: 10, visible: true, content: "<script>alert(1)</script>" }],
    },
    blocks: [{ id: "unsafe-html", section: "body", type: "text", order: 10, visible: true, content: "<script>alert(1)</script>" }],
  };
  assert(!validateTemplateDefinition(unsafeHtml).valid, "unsafe script-like content is rejected before publish");

  assert(canManageDocumentTemplates(Role.ADMIN), "ADMIN can manage document templates");
  assert(canManageDocumentTemplates(Role.HOA_ADMIN), "HOA_ADMIN can manage document templates");
  assert(canManageDocumentTemplates(Role.SYSTEM_ADMIN), "SYSTEM_ADMIN can manage document templates");
  assert(canManageDocumentTemplates(Role.SUPER_ADMIN), "SUPER_ADMIN can manage document templates");
  assert(!canManageDocumentTemplates(Role.HOMEOWNER), "HOMEOWNER cannot manage document templates");
  assert(!canManageDocumentTemplates(Role.PAYROLL_MANAGER), "PAYROLL_MANAGER cannot manage document templates");

  const duplicatePublished = await prisma.$queryRaw<{ tenantId: string; templateSetId: string; count: bigint }[]>`
    SELECT tenantId, templateSetId, COUNT(*) AS count
    FROM DocumentTemplateVersion
    WHERE status = 'PUBLISHED'
    GROUP BY tenantId, templateSetId
    HAVING COUNT(*) > 1
  `;
  assert(duplicatePublished.length === 0, "at most one published template version exists per template set");

  const crossTenantAssigned = await prisma.$queryRaw<{ id: string }[]>`
    SELECT d.id
    FROM DocumentDefinition d
    JOIN DocumentTemplateVersion v ON v.id = d.assignedTemplateVersionId
    WHERE d.assignedTemplateVersionId IS NOT NULL AND d.tenantId <> v.tenantId
  `;
  assert(crossTenantAssigned.length === 0, "assigned published templates remain tenant-scoped");

  const nonPublishedAssigned = await prisma.$queryRaw<{ id: string }[]>`
    SELECT d.id
    FROM DocumentDefinition d
    JOIN DocumentTemplateVersion v ON v.id = d.assignedTemplateVersionId
    WHERE d.assignedTemplateVersionId IS NOT NULL AND v.status <> 'PUBLISHED'
  `;
  assert(nonPublishedAssigned.length === 0, "assigned template versions are published");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
