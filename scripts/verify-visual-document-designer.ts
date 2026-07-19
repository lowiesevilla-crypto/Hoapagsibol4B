import { DocumentGenerationMode, DocumentOutputFormat } from "@prisma/client";
import {
  allowedDocumentPlaceholders,
  defaultTemplateDefinition,
  normalizeTemplateDefinition,
  validateTemplateDefinition,
} from "../lib/services/document-template-builder";
import { htmlDocumentRenderer } from "../lib/services/document-renderers";
import type { DocumentRenderModel } from "../lib/services/document-render-model";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function main() {
  const visual = defaultTemplateDefinition("Certificate of Residency");
  assert(validateTemplateDefinition(visual).valid, "default visual template validates");
  assert(visual.page.canvas.snapToGrid && visual.page.canvas.gridSize === 5, "visual page stores deterministic grid settings");
  assert(visual.blocks.filter((block) => block.visible).every((block) => Boolean(block.position)), "default visual elements have bounded positions");
  assert(visual.blocks.some((block) => block.type === "logo" && block.position), "tenant logo is a movable first-class element");

  const outOfBounds = normalizeTemplateDefinition({ ...visual, sections: { ...visual.sections, body: [{ ...visual.sections.body[0], position: { x: 205, y: 290, width: 20, height: 20, zIndex: 1 } }] } }, "Certificate");
  assert(!validateTemplateDefinition(outOfBounds).valid, "printable-boundary overflow blocks validation");

  const legacy = normalizeTemplateDefinition({ schemaVersion: 1, page: { format: "A4", orientation: "portrait" }, blocks: [{ id: "legacy", type: "text", section: "body", content: "Legacy {{subject.fullName}}", visible: true, order: 10 }] }, "Legacy");
  assert(validateTemplateDefinition(legacy).valid, "legacy flow templates remain readable");
  assert(!legacy.blocks.some((block) => block.position), "legacy definitions are not silently rewritten in memory");
  const custom = normalizeTemplateDefinition({ ...visual, sections: { ...visual.sections, body: [{ ...visual.sections.body[0], content: "{{tenant.customPermitCode}}" }] } }, "Custom");
  assert(validateTemplateDefinition(custom, { allowedPlaceholders: new Set([...allowedDocumentPlaceholders, "tenant.customPermitCode"]) }).valid, "tenant-defined placeholders validate through the allowlist");

  const model: DocumentRenderModel = {
    schemaVersion: 1,
    rendererVersion: "1.0.0",
    mode: DocumentGenerationMode.ISSUE,
    preview: false,
    metadata: { title: "Visual Certificate", documentNumber: "COR-2026-000001", issueDate: "July 19, 2026", validUntil: null, verificationUrl: null, locale: "en-PH" },
    page: visual.page,
    visualLayout: true,
    sections: { header: [], body: [{ ...visual.blocks.find((block) => block.type === "documentTitle")!, content: "Visual Certificate", visible: true }], footer: [] },
    unresolvedPlaceholders: [],
    unauthorizedPlaceholders: [],
    resolvedValues: {},
    warnings: [],
  };
  const rendered = await htmlDocumentRenderer.render(model);
  assert(rendered.outputFormat === DocumentOutputFormat.HTML, "visual renderer returns HTML output");
  assert(rendered.content.includes("visual-layout") && rendered.content.includes("position:absolute"), "issued HTML uses the visual schema layout");
  assert(rendered.content.includes("left:25mm"), "issued HTML preserves millimetre element positions");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
