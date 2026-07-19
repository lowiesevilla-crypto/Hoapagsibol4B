import { readFile } from "node:fs/promises";
import { DocumentGenerationMode, DocumentPlaceholderOwnership } from "@prisma/client";
import { defaultTemplateDefinition, allowedDocumentPlaceholders, normalizeTemplateDefinition } from "../lib/services/document-template-builder";
import { buildDocumentRenderModel } from "../lib/services/document-render-model";
import { htmlDocumentRenderer } from "../lib/services/document-renderers";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function main() {
  const editor = await readFile("components/professional-document-template-editor.tsx", "utf8");
  const previewRoute = await readFile("app/admin/settings/document-definitions/[id]/templates/[versionId]/preview/route.ts", "utf8");

  assert(!editor.includes("window.print()"), "designer Preview no longer prints the application shell");
  assert(editor.includes("formAction={props.previewHref}") && editor.includes('formTarget="_blank"') && editor.includes('formMethod="post"'), "designer Preview posts the current editor state to the dedicated document");
  assert(previewRoute.includes("export async function POST") && previewRoute.includes("requireDocumentTemplateAdmin") && previewRoute.includes("tenantId: admin.tenantId"), "preview route is authenticated, tenant-scoped, and accepts the current draft state");
  assert(previewRoute.includes('"Cache-Control": "no-store, max-age=0"') && previewRoute.includes('"Content-Disposition"'), "preview route is non-cacheable and inline-document only");
  assert(editor.includes("Page background image could not be loaded") && editor.includes("Watermark image could not be loaded"), "page assets expose actionable load errors");
  assert(editor.includes("tenantLogoSrc={props.tenantLogoSrc}") && editor.includes("block.binding === \"tenant.logo\""), "canvas resolves the trusted tenant logo source");
  assert(editor.includes("marginsLinked, setMarginsLinked] = useState(false)") && editor.includes("marginsLinked ? { top: next, right: next, bottom: next, left: next } : { ...page.margins, [side]: next }"), "left and right margins are independent unless explicitly linked");

  const definition = normalizeTemplateDefinition({
    ...defaultTemplateDefinition("Preview Certificate"),
    page: {
      ...defaultTemplateDefinition("Preview Certificate").page,
      margins: { top: 18, right: 31, bottom: 22, left: 13 },
      backgroundImage: { src: "/uploads/tenant/approved-page.png", fit: "cover", position: "center", opacity: 0.7 },
      watermark: { enabled: true, text: "DRAFT", opacity: 0.12, fontSize: 48, position: "center", rotation: -12, image: { src: "/uploads/tenant/approved-watermark.png", fit: "contain", position: "center", opacity: 0.8 } },
    },
  }, "Preview Certificate");
  const placeholderDefinitions = allowedDocumentPlaceholders.map((key) => ({ key, category: "Platform", displayName: key, description: key, dataType: "TEXT", sample: key, sensitivity: null, ownership: DocumentPlaceholderOwnership.PLATFORM }));
  const model = buildDocumentRenderModel({
    templateDefinition: definition,
    title: "Preview Certificate",
    documentNumber: "PREVIEW",
    issueDate: "July 19, 2026",
    mode: DocumentGenerationMode.PREVIEW,
    placeholderContext: { tenantId: "tenant-a", tenant: { name: "Tenant A", logo: "/uploads/tenant/logo.png" }, organization: { tenantId: "tenant-a", officers: [] }, permissions: new Set<string>() },
    placeholderDefinitions,
  });
  assert(model.page.margins.left === 13 && model.page.margins.right === 31, "render model preserves asymmetric margins");
  assert(model.sections.header.find((block) => block.type === "logo")?.image?.src === "/uploads/tenant/logo.png", "render model resolves tenant logo bindings to the trusted tenant asset");
  const rendered = await htmlDocumentRenderer.render(model);
  assert(rendered.content.includes("class=\"document-page preview visual-layout\""), "preview renderer emits one document-only page");
  assert(!rendered.content.includes("sidebar") && !rendered.content.includes("Document Management"), "rendered preview contains no application shell");
  assert(rendered.content.includes("@page{size:A4 portrait;margin:0}"), "visual preview print CSS uses the document page size and zero outer shell margin");
  assert(rendered.content.includes("/uploads/tenant/approved-page.png") && rendered.content.includes("/uploads/tenant/approved-watermark.png"), "approved page background and watermark image sources are preserved");
  assert(rendered.content.includes("PREVIEW - NOT AN OFFICIAL DOCUMENT"), "preview is visibly marked without issuing a document");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
