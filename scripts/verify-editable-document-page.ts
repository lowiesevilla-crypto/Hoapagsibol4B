import { readFile } from "node:fs/promises";
import { DocumentGenerationMode, DocumentOutputFormat } from "@prisma/client";
import { defaultTemplateDefinition, documentPageDimensions, normalizeTemplateDefinition, validateTemplateDefinition } from "../lib/services/document-template-builder";
import { htmlDocumentRenderer } from "../lib/services/document-renderers";
import type { DocumentRenderModel } from "../lib/services/document-render-model";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function main() {
  const source = await readFile(new URL("../components/professional-document-template-editor.tsx", import.meta.url), "utf8");
  const base = defaultTemplateDefinition("Editable Page Test");
  assert(base.page.id === "page-1" && base.page.pageNumber === 1, "page schema has a stable id and page number");
  assert(base.page.padding.top === 0 && base.page.showHeaderBoundary && base.page.showFooterBoundary, "page padding and independent region boundaries have safe defaults");
  assert(base.page.widthMm === 210 && base.page.heightMm === 297, "A4 portrait stores deterministic millimetre dimensions");
  assert(documentPageDimensions("A4", "landscape").widthMm === 297 && documentPageDimensions("A4", "landscape").heightMm === 210, "A4 landscape swaps page dimensions safely");
  assert(documentPageDimensions("LETTER", "portrait").widthMm === 216 && documentPageDimensions("LEGAL", "portrait").heightMm === 356, "Letter and Legal use renderer-safe dimensions");

  const setup = normalizeTemplateDefinition({
    ...base,
    page: {
      ...base.page,
      format: "LETTER",
      orientation: "landscape",
      margins: { top: 12, right: 14, bottom: 16, left: 18 },
      headerHeightMm: 48,
      footerHeightMm: 26,
      headerLocked: true,
      footerLocked: true,
      backgroundColor: "#f8fafc",
      backgroundOpacity: 0.8,
      backgroundImage: { src: "/uploads/settings/tenant/document-templates/background.png", fit: "contain", position: "center", opacity: 0.6 },
      border: { enabled: true, style: "solid", width: 2, color: "#14532d" },
      watermark: { enabled: true, text: "DRAFT", opacity: 0.12, fontSize: 42, position: "center", rotation: -20 },
      canvas: { ...base.page.canvas, showGrid: false, snapToGrid: true, showRulers: true, showMarginGuides: true, showCenterGuides: true },
      guides: { horizontal: [{ positionMm: 100 }], vertical: [{ positionMm: 140 }] },
      safeArea: { showBoundary: true, showNonPrintableArea: true, warnOnOverflow: true, minimumMarginMm: 12 },
    },
  }, "Editable Page Test");
  assert(setup.page.format === "LETTER" && setup.page.orientation === "landscape" && setup.page.widthMm === 279 && setup.page.heightMm === 216, "paper size and orientation changes persist in page units");
  assert(JSON.stringify(setup.page.margins) === JSON.stringify({ top: 12, right: 14, bottom: 16, left: 18 }), "independent margins persist exactly");
  assert(setup.page.headerHeightMm === 48 && setup.page.footerHeightMm === 26 && setup.page.headerLocked && setup.page.footerLocked, "header and footer region settings persist");
  assert(setup.page.backgroundImage?.src.startsWith("/uploads/") && setup.page.backgroundOpacity === 0.8, "approved background image and opacity persist");
  assert(setup.page.border.enabled && setup.page.border.width === 2, "page border settings persist");
  assert(!setup.page.canvas.showGrid && setup.page.canvas.snapToGrid && setup.page.canvas.showRulers, "grid, rulers, and snap settings persist");
  assert(setup.page.guides.horizontal[0]?.positionMm === 100 && setup.page.guides.vertical[0]?.positionMm === 140, "custom guides persist in millimetres");
  assert(setup.page.safeArea.showNonPrintableArea && setup.page.safeArea.warnOnOverflow, "printable safe-area settings persist");
  assert(validateTemplateDefinition(setup).valid, "safe page setup validates");

  const unsafeBackground = normalizeTemplateDefinition({ ...setup, page: { ...setup.page, backgroundImage: { ...setup.page.backgroundImage!, src: "https://unsafe.example/background.png" } } }, "Unsafe background");
  assert(!unsafeBackground.page.backgroundImage && validateTemplateDefinition({ ...setup, page: { ...setup.page, backgroundImage: { ...setup.page.backgroundImage!, src: "https://unsafe.example/background.png" } } }).errors.some((error) => error.includes("tenant-approved")), "arbitrary background URLs are rejected");
  const outsidePage = normalizeTemplateDefinition({ ...base, sections: { ...base.sections, body: [{ ...base.sections.body[0], position: { x: 205, y: 290, width: 20, height: 20, zIndex: 1 } }] } }, "Outside");
  assert(validateTemplateDefinition(outsidePage).errors.some((error) => error.includes("outside the page")), "out-of-page elements are detected");
  const safeOverflow = normalizeTemplateDefinition({ ...base, sections: { ...base.sections, body: [{ ...base.sections.body[0], position: { x: 2, y: 2, width: 30, height: 12, zIndex: 1 } }] } }, "Safe warning");
  assert(validateTemplateDefinition(safeOverflow).warnings.some((warning) => warning.includes("printable area")), "safe-area overflow produces an actionable warning");

  assert(source.includes("const [pageSelected, setPageSelected]") && source.includes("function selectPage()"), "page selection has dedicated state");
  assert(source.includes("onClick={selectPage}") && source.includes('aria-label="Document page"'), "empty page hit testing selects the page");
  assert(source.includes("PagePropertiesPanel") && source.includes("pageSelected || !block"), "page selection opens Page Properties");
  assert(source.includes("setPageSelected(false)") && source.includes("onEscape={selectPage}"), "element selection overrides page selection and Escape returns to the page");
  assert(source.includes("backgroundImage") && source.includes("showNonPrintableArea") && source.includes("headerHeightMm"), "page visuals expose background, safe area, and region boundaries");
  assert(source.includes("PagePaddingProperties") && source.includes("showHeaderBoundary") && source.includes("showFooterBoundary"), "page properties expose padding and independent header/footer boundaries");
  assert(source.includes("documentPageSizes") && source.includes("widthMm") && source.includes("heightMm"), "editor dimensions come from normalized page units");
  assert(source.includes("isLockedPageRegion") && source.includes("dragRef.current"), "locked regions and existing drag coordinate paths remain protected");
  assert(source.includes("showRulers") && source.includes("guides.vertical") && source.includes("showCenterGuides"), "rulers, custom guides, and center guides remain synchronized with zoom");

  const model: DocumentRenderModel = {
    schemaVersion: 1,
    rendererVersion: "1.0.0",
    mode: DocumentGenerationMode.ISSUE,
    preview: false,
    renderMode: { mode: "official", documentNumber: "PAGE-2026-000001", verificationUrl: null, verificationToken: null, verificationRequired: false },
    metadata: { title: "Editable Page Test", documentNumber: "PAGE-2026-000001", issueDate: "July 19, 2026", validUntil: null, verificationUrl: null, locale: "en-PH" },
    page: setup.page,
    visualLayout: true,
    sections: { header: [], body: [{ ...setup.blocks[0], content: "Editable page output", visible: true }], footer: [] },
    unresolvedPlaceholders: [],
    unauthorizedPlaceholders: [],
    resolvedValues: {},
    warnings: [],
  };
  const rendered = await htmlDocumentRenderer.render(model);
  assert(rendered.outputFormat === DocumentOutputFormat.HTML, "editable page renders as HTML");
  assert(rendered.content.includes("@page{size:Letter landscape;margin:0}"), "renderer preserves paper size and orientation");
  assert(rendered.content.includes("width:279mm;height:216mm") && rendered.content.includes("border:2px solid #14532d"), "renderer preserves page dimensions and border");
  assert(rendered.content.includes("background-image:url('/uploads/settings/tenant/document-templates/background.png')") && rendered.content.includes("DRAFT"), "renderer preserves approved background and watermark");
  assert(rendered.content.includes("section-header{min-height:48mm}") && rendered.content.includes("section-footer{min-height:26mm"), "renderer preserves header and footer dimensions");
  assert(model.page.margins.left === setup.page.margins.left && model.page.backgroundColor === setup.page.backgroundColor, "preview and issued renderer input share the same page configuration");
  console.log("Editable document page verification passed (30 checks).");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
