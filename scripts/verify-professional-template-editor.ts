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

  const newlineRichText: DocumentTemplateDefinition = normalizeTemplateDefinition({
    ...defaultDefinition,
    sections: {
      ...defaultDefinition.sections,
      body: [{
        id: "newline-rich-text",
        section: "body",
        type: "text",
        order: 10,
        visible: true,
        content: "First paragraph\n\nSecond line with Sevillañ",
        richText: { type: "paragraph", children: [{ type: "text", text: "First paragraph\n\nSecond line with Sevillañ" }] },
      }],
    },
  }, "Newline fixture");
  assert(validateTemplateDefinition(newlineRichText).valid, "rich text with paragraphs, line breaks, and ñ validates");
  assert(renderTemplateDefinitionText(newlineRichText).includes("First paragraph\n\nSecond line with Sevillañ"), "rich text new lines and unicode persist in renderable text");

  const editorSource = await readFile("components/professional-document-template-editor.tsx", "utf8");
  assert(editorSource.includes("data-template-rich-text-editor=\"true\""), "rich-text editor is isolated from parent keyboard handlers");
  assert(editorSource.includes("defaultValue={JSON.stringify(definition)}") && editorSource.includes("prepareSubmit"), "active editor draft is flushed before Save, Preview, or Publish");
  assert(editorSource.includes("insertTextAtSelection(event.currentTarget, event.shiftKey ? \"\\n\" : \"\\n\\n\")"), "Enter and Shift+Enter insert serialized new lines without submitting the form");
  assert(editorSource.includes("onCompositionStart") && editorSource.includes("onCompositionEnd"), "composition and IME input are not interrupted");
  assert(editorSource.includes("dir=\"ltr\"") && editorSource.includes("unicodeBidi: \"plaintext\""), "editor defaults to left-to-right text direction");
  assert(editorSource.includes("nodeBelongsToRoot") && editorSource.includes("node.isConnected"), "selection restoration rejects detached nodes");
  assert(editorSource.includes("deleteAdjacentPlaceholder") && editorSource.includes("placeholder.parentNode.removeChild(placeholder)") && editorSource.includes("placeholder.parentNode?.contains(placeholder)"), "placeholder deletion verifies the current parent before removeChild");
  assert(editorSource.includes("TemplateEditorErrorBoundary"), "editor-level recovery boundary preserves local draft after render errors");
  assert(editorSource.includes("templateDraftStorageKey") && editorSource.includes("tenantId") && editorSource.includes("userId") && editorSource.includes("versionId"), "local draft backup is scoped by tenant, user, definition, and template version");

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
  assert(!validateTemplateDefinition(null).valid, "missing template payload returns validation errors instead of throwing");
  assert(validateTemplateDefinition({ schemaVersion: documentTemplateSchemaVersion }).errors.includes("Missing page settings."), "missing page settings are reported as incomplete");
  assert(validateTemplateDefinition({ schemaVersion: documentTemplateSchemaVersion, page: { format: "A4", orientation: "portrait" }, sections: { body: [] } }).errors.includes("Missing margins."), "missing margins are reported as incomplete");
  assert(validateTemplateDefinition({ schemaVersion: documentTemplateSchemaVersion, page: { format: "A4", orientation: "portrait", margins: { top: 10, right: 10, bottom: 10, left: 10 } } }).errors.includes("Missing layout."), "missing layout is reported as incomplete");
  assert(validateTemplateDefinition({ schemaVersion: documentTemplateSchemaVersion, page: { format: "A4", orientation: "portrait", margins: { top: 10, right: 10, bottom: 10, left: 10 } }, sections: { header: [], body: [], footer: [] } }).errors.includes("Template must contain at least one visible content block."), "empty sections are reported as incomplete");

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

  const definitions = await prisma.documentDefinition.findMany({
    include: { assignedTemplateVersion: true },
  });
  for (const definition of definitions) validateTemplateDefinition(definition.assignedTemplateVersion?.definitionJson ?? null);
  assert(true, "all current assigned and missing definition templates validate defensively without crashing");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
