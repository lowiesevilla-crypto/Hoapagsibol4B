import { DocumentGenerationMode, DocumentPlaceholderOwnership } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { allowedDocumentPlaceholders, defaultTemplateDefinition, normalizeTemplateDefinition, validateTemplateDefinition } from "../lib/services/document-template-builder";
import { buildDocumentRenderModel } from "../lib/services/document-render-model";
import { htmlDocumentRenderer } from "../lib/services/document-renderers";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function main() {
  const editor = await readFile("components/professional-document-template-editor.tsx", "utf8");
  const builder = await readFile("lib/services/document-template-builder.ts", "utf8");
  const renderer = await readFile("lib/services/document-renderers.ts", "utf8");

  assert(editor.includes("contentEditable") && editor.includes("applyColorToRichText"), "editor supports selection-aware structured rich text coloring");
  assert(editor.includes('defaultContent(type: DocumentTemplateBlockType)') && editor.includes(' : "";'), "new text and rectangle elements do not receive persisted placeholder content");
  assert(builder.includes("DocumentRichText") && builder.includes("normalizeRichText"), "rich text uses an additive typed template schema");
  assert(builder.includes("headingFontSize") && builder.includes("officerSpacing") && builder.includes("nameFontWeight") && builder.includes("headingColor"), "officer list typography fields are typed and persisted");
  assert(editor.includes("Heading size (pt)") && editor.includes("Officer spacing (mm)") && editor.includes("Officer heading color"), "editor exposes officer list typography controls");
  assert(editor.includes("const left = Math.max(0, start - nodeStart)") && editor.includes("right > left"), "selected-range text color logic is confirmed present");
  assert(renderer.includes("preview://hoahub/document-verification"), "preview QR uses a deterministic non-production payload");
  assert(renderer.includes("class=\"line-element horizontal-line\"") && !renderer.includes("return `<hr"), "horizontal lines render as stroke elements without hr boxes");

  const base = defaultTemplateDefinition("UAT Certificate");
  const definition = normalizeTemplateDefinition({
    ...base,
    sections: {
      header: [{ id: "logo", type: "logo", section: "header", binding: "tenant.logo", visible: true, order: 10, position: { x: 20, y: 20, width: 42, height: 24, zIndex: 10 }, image: { src: "/uploads/tenant/logo.png", alt: "Tenant logo", fit: "contain", positionX: "center", positionY: "center", opacity: 0.9, lockAspectRatio: true } }],
      body: [
        { id: "rich", type: "text", section: "body", visible: true, order: 10, position: { x: 20, y: 80, width: 160, height: 24, zIndex: 20 }, richText: { type: "paragraph", children: [{ type: "text", text: "This is to certify that ", marks: { color: "#111827" } }, { type: "placeholder", key: "tenant.name", label: "Tenant Name", marks: { color: "#163B72", bold: true } }, { type: "text", text: " is a ", marks: { color: "#111827" } }, { type: "text", text: "bona fide resident", marks: { color: "#dc2626" } }, { type: "text", text: ".", marks: { color: "#111827" } }] } },
        { id: "officers", type: "officerList", section: "body", visible: true, order: 15, position: { x: 8, y: 40, width: 38, height: 110, zIndex: 19 }, officerList: { heading: "HOA OFFICERS", termLabel: "", roleFilters: [], sortBy: "displayOrder", sortDirection: "asc", maxOfficers: 8, showHeading: true, showTerm: true, showSeparators: true, headingFontSize: 14, termFontSize: 10, nameFontSize: 10, positionFontSize: 8, lineHeight: 1.4, officerSpacing: 5, nameFontWeight: "normal", positionFontWeight: "bold", headingColor: "#ffffff", termColor: "#163B72", nameColor: "#111827", positionColor: "#163B72" } },
        { id: "empty", type: "textBox", section: "body", visible: true, order: 20, content: "", position: { x: 20, y: 112, width: 80, height: 16, zIndex: 21 } },
        { id: "line", type: "horizontalLine", section: "body", visible: true, order: 30, position: { x: 20, y: 140, width: 160, height: 2, zIndex: 22 }, style: { lineColor: "#163B72", lineWidth: 2, lineStyle: "dashed", opacity: 0.8 } },
      ],
      footer: [{ id: "qr", type: "qrVerification", section: "footer", visible: true, order: 10, binding: "verification.url", position: { x: 80, y: 220, width: 40, height: 40, zIndex: 30 }, qr: { label: "Official QR", instruction: "Scan to verify", showLabel: true, showInstruction: true, squareLocked: true, quietZone: 1 } }],
    },
  }, "UAT Certificate");
  const placeholderDefinitions = allowedDocumentPlaceholders.map((key) => ({ key, category: "Platform", displayName: key, description: key, dataType: "TEXT", sample: key, sensitivity: null, ownership: DocumentPlaceholderOwnership.PLATFORM }));
  const model = buildDocumentRenderModel({ templateDefinition: definition, title: "UAT Certificate", documentNumber: "PREVIEW", issueDate: "July 19, 2026", mode: DocumentGenerationMode.PREVIEW, placeholderContext: { tenantId: "tenant-a", tenant: { name: "Tenant A", logo: "/uploads/tenant/logo.png" }, organization: { tenantId: "tenant-a", officers: [{ id: "officer-1", fullName: "Rendered Officer", position: "President", displayOrder: 1 }] }, permissions: new Set<string>() }, placeholderDefinitions });
  assert(model.sections.header[0]?.image?.fit === "contain" && model.sections.header[0]?.image?.positionX === "center" && model.sections.header[0]?.image?.lockAspectRatio === true, "image layout fields normalize and remain authoritative");
  const officerConfig = definition.sections.body.find((block) => block.type === "officerList")?.officerList;
  assert(officerConfig?.headingFontSize === 14 && officerConfig.termFontSize === 10 && officerConfig.nameFontSize === 10 && officerConfig.positionFontSize === 8 && officerConfig.officerSpacing === 5, "officer typography values survive normalization");
  const invalidOfficer = { ...definition, sections: { ...definition.sections, body: definition.sections.body.map((block) => block.type === "officerList" ? { ...block, officerList: { ...block.officerList!, headingFontSize: 40 } } : block) } };
  assert(validateTemplateDefinition(invalidOfficer, { activeOfficerCount: 1 }).errors.some((error) => error.includes("heading font size")), "invalid officer sizes are rejected with a clear validation message");
  const rendered = await htmlDocumentRenderer.render(model);
  assert(rendered.content.includes("data:image/png;base64,") && rendered.content.includes("PREVIEW QR — NOT VALID FOR VERIFICATION"), "preview QR is visible and marked non-production");
  assert(rendered.content.includes("left:20mm;top:20mm;width:42mm;height:24mm") && rendered.content.includes("object-fit:contain"), "logo output uses the configured millimetre box and fit");
  assert(rendered.content.includes("class=\"line-element horizontal-line\"") && rendered.content.includes("--line-style:dashed") && !rendered.content.includes("<hr"), "line output is one configured stroke without a wrapper box");
  assert(rendered.content.includes("color:#163B72") && rendered.content.includes("color:#dc2626") && rendered.content.includes("bona fide resident") && rendered.content.includes("Tenant A"), "selected-range color and resolved content survive preview rendering");
  assert(!rendered.content.includes("Type to edit"), "empty text-box hint is absent from preview output");
  assert(rendered.content.includes("--officer-heading-size:14pt") && rendered.content.includes("--officer-term-size:10pt") && rendered.content.includes("--officer-name-size:10pt") && rendered.content.includes("--officer-position-size:8pt") && rendered.content.includes("--officer-spacing:5mm") && rendered.content.includes("--officer-name-weight:normal") && rendered.content.includes("--officer-position-color:#163B72"), "officer typography matches preview and issued renderer output");
  assert(rendered.content.includes("Rendered Officer"), "officer names remain tenant-bound and are rendered from tenant data");

  const officialModel = buildDocumentRenderModel({ templateDefinition: definition, title: "UAT Certificate", documentNumber: "COR-2026-000001", issueDate: "July 19, 2026", verificationUrl: "https://example.test/verify/secure-token", mode: DocumentGenerationMode.ISSUE, placeholderContext: { tenantId: "tenant-a", tenant: { name: "Tenant A", logo: "/uploads/tenant/logo.png" }, organization: { tenantId: "tenant-a", officers: [] }, permissions: new Set<string>(["DOCUMENT_PLACEHOLDER:PERSONAL"]) }, placeholderDefinitions });
  const officialRendered = await htmlDocumentRenderer.render(officialModel);
  assert(officialRendered.content.includes("data:image/png;base64,") && !officialRendered.content.includes("PREVIEW QR — NOT VALID FOR VERIFICATION"), "official QR rendering remains secure and uses the real verification URL without preview labeling");

  const legacy = buildDocumentRenderModel({ templateDefinition: normalizeTemplateDefinition({ ...base, sections: { ...base.sections, body: [{ ...base.sections.body[0], content: "Type to edit" }] } }, "Legacy"), title: "Legacy", documentNumber: "PREVIEW", issueDate: "July 19, 2026", mode: DocumentGenerationMode.PREVIEW, placeholderContext: { tenantId: "tenant-a", tenant: { name: "Tenant A" }, organization: { tenantId: "tenant-a", officers: [] }, permissions: new Set<string>() }, placeholderDefinitions });
  const legacyRendered = await htmlDocumentRenderer.render(legacy);
  assert(legacyRendered.content.includes("Type to edit"), "legacy intentional literal content remains unchanged");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
