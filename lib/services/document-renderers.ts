import "server-only";

import QRCode from "qrcode";
import { DocumentOutputFormat } from "@prisma/client";
import type { DocumentRenderBlock, DocumentRenderModel } from "@/lib/services/document-render-model";

export type DocumentRenderResult = {
  outputFormat: DocumentOutputFormat;
  contentType: string;
  content: string;
  outputSize: number;
  pageCount: number | null;
  rendererName: string;
  rendererVersion: string;
  warnings: string[];
};

export interface DocumentRenderer {
  readonly name: string;
  readonly version: string;
  readonly outputFormat: DocumentOutputFormat;
  validate(model: DocumentRenderModel): string[];
  render(model: DocumentRenderModel): Promise<DocumentRenderResult>;
}

export const htmlDocumentRenderer: DocumentRenderer = {
  name: "hoahub-safe-html",
  version: "1.0.0",
  outputFormat: DocumentOutputFormat.HTML,
  validate(model) {
    const errors: string[] = [];
    if (!model.metadata.title.trim()) errors.push("Document title is required.");
    if (!model.preview && !model.metadata.documentNumber.trim()) errors.push("Official document number is required.");
    if (!model.sections.body.some((block) => block.visible && block.content.trim())) errors.push("Document body is empty.");
    return errors;
  },
  async render(model) {
    const errors = this.validate(model);
    if (errors.length) throw new Error(errors.join(" "));
    const qrDataUrl = model.metadata.verificationUrl ? await QRCode.toDataURL(model.metadata.verificationUrl, { width: 240, margin: 1, errorCorrectionLevel: "M" }) : null;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(model.metadata.title)}</title><style>${documentCss(model)}</style></head><body><main class="document-page${model.preview ? " preview" : ""}${model.visualLayout ? " visual-layout" : ""}">${renderWatermark(model)}${renderSection(model.sections.header, "header", qrDataUrl, model.visualLayout)}${renderSection(model.sections.body, "body", qrDataUrl, model.visualLayout)}${renderSection(model.sections.footer, "footer", qrDataUrl, model.visualLayout)}</main></body></html>`;
    return { outputFormat: DocumentOutputFormat.HTML, contentType: "text/html; charset=utf-8", content: html, outputSize: Buffer.byteLength(html, "utf8"), pageCount: null, rendererName: this.name, rendererVersion: this.version, warnings: model.warnings };
  },
};

export function getDocumentRenderer(format: DocumentOutputFormat) {
  if (format === DocumentOutputFormat.HTML) return htmlDocumentRenderer;
  throw new Error(`Unsupported document output format: ${format}.`);
}

function renderSection(blocks: DocumentRenderBlock[], name: string, qrDataUrl: string | null, visualLayout: boolean) {
  return `<section class="section section-${name}${visualLayout ? " visual-section" : ""}">${blocks.filter((block) => block.visible).map((block) => renderBlock(block, qrDataUrl, visualLayout)).join("")}</section>`;
}

function renderBlock(block: DocumentRenderBlock, qrDataUrl: string | null, visualLayout: boolean) {
  const style = blockStyle(block, visualLayout);
  if (block.type === "pageBreak") return '<div class="page-break" aria-hidden="true"></div>';
  if (block.type === "divider" || block.type === "horizontalLine") return `<hr style="${style}">`;
  if (block.type === "verticalLine") return `<div class="vertical-line" style="${style}"></div>`;
  if (block.type === "spacer") return `<div aria-hidden="true" style="height:${Math.max(4, block.style?.height ?? 16)}px"></div>`;
  if (block.type === "qrVerification") return qrDataUrl ? `<figure class="qr-block" style="${style}"><img src="${qrDataUrl}" alt="Document verification QR code"><figcaption>${escapeHtml(block.content)}</figcaption></figure>` : "";
  const imageSource = block.image?.src || (block.type === "logo" ? block.content : "");
  if ((block.type === "logo" || block.type === "image") && imageSource) return `<figure style="${style}"><img src="${escapeAttribute(imageSource)}" alt="${escapeAttribute(block.image?.alt ?? block.label ?? "Document image")}" width="${Math.round(block.image?.width ?? block.style?.width ?? 96)}" height="${Math.round(block.image?.height ?? block.style?.height ?? 96)}"></figure>`;
  if (block.table?.rows?.length) return `<table style="${style}"><tbody>${block.table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const tag = ["documentTitle", "tenantName", "heading"].includes(block.type) ? "h1" : "div";
  return `<${tag} class="block block-${escapeAttribute(block.type)}" style="${style}">${escapeHtml(block.content).replaceAll("\n", "<br>")}</${tag}>`;
}

function blockStyle(block: DocumentRenderBlock, visualLayout: boolean) {
  const style = block.style || {};
  const position = block.position;
  const declarations = [
    visualLayout && position ? "position:absolute" : "",
    visualLayout && position ? `left:${clamp(position.x, 0, 500)}mm` : "",
    visualLayout && position ? `top:${clamp(position.y, 0, 500)}mm` : "",
    visualLayout && position ? `width:${clamp(position.width, 1, 500)}mm` : "",
    visualLayout && position ? `height:${clamp(position.height, 1, 500)}mm` : "",
    visualLayout && position ? `z-index:${clamp(position.zIndex, 0, 1000)}` : "",
    visualLayout ? "overflow:hidden" : "",
    style.align ? `text-align:${style.align}` : "",
    style.fontFamily ? `font-family:${safeFont(style.fontFamily)}` : "",
    style.fontSize ? `font-size:${clamp(style.fontSize, 6, 72)}pt` : "",
    style.fontWeight ? `font-weight:${style.fontWeight}` : "",
    style.italic ? "font-style:italic" : "",
    style.underline ? "text-decoration:underline" : "",
    style.textColor ? `color:${style.textColor}` : "",
    style.backgroundColor ? `background-color:${style.backgroundColor}` : "",
    style.padding != null ? `padding:${clamp(style.padding, 0, 60)}px` : "",
    style.margin != null ? `margin:${clamp(style.margin, 0, 60)}px` : "",
    !visualLayout && style.width ? `width:${clamp(style.width, 1, 100)}%` : "",
    style.lineHeight ? `line-height:${clamp(style.lineHeight, 1, 3)}` : "",
    style.borderColor && style.borderWidth ? `border:${clamp(style.borderWidth, 0, 8)}px solid ${style.borderColor}` : "",
    style.radius != null ? `border-radius:${clamp(style.radius, 0, 24)}px` : "",
  ].filter(Boolean);
  return declarations.join(";");
}

function documentCss(model: DocumentRenderModel) {
  const margins = model.page.margins;
  const size = model.page.format === "LETTER" ? "Letter" : model.page.format === "LEGAL" ? "Legal" : "A4";
  const dimensions = model.page.format === "A4" ? { width: 210, height: 297 } : model.page.format === "LETTER" ? { width: 216, height: 279 } : { width: 216, height: 356 };
  const width = model.page.orientation === "landscape" ? dimensions.height : dimensions.width;
  const height = model.page.orientation === "landscape" ? dimensions.width : dimensions.height;
  const page = model.visualLayout ? `width:${width}mm;height:${height}mm;min-height:${height}mm;padding:0` : `width:${width}mm;min-height:${height}mm;padding:${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`;
  const pageMargin = model.visualLayout ? "0" : `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`;
  return `@page{size:${size} ${model.page.orientation};margin:${pageMargin}}*{box-sizing:border-box}body{margin:0;background:#f3f4f6;color:#111827;font-family:Arial,sans-serif}.document-page{position:relative;${page};margin:0 auto;background:${model.page.backgroundColor};overflow:hidden}.section{position:relative;z-index:1}.visual-section{position:absolute;inset:0}.block{white-space:normal;overflow-wrap:anywhere;margin:0 0 12px}.visual-layout .block{margin:0}.block-documentTitle{font-size:20pt;text-align:center}.section-footer{margin-top:24px}table{border-collapse:collapse}td{border:1px solid #d1d5db;padding:6px;vertical-align:top}.qr-block{text-align:center}.qr-block img{width:96px;height:96px}.qr-block figcaption{font-size:8pt}.page-break{break-after:page}.watermark{position:absolute;inset:45% 0 auto;transform:rotate(-28deg);text-align:center;font-size:34pt;font-weight:700;color:rgba(100,116,139,.15);z-index:0}@media print{body{background:white}.document-page{margin:0;box-shadow:none}}`;
}

function renderWatermark(model: DocumentRenderModel) {
  return model.page.watermark.enabled && model.page.watermark.text ? `<div class="watermark">${escapeHtml(model.page.watermark.text)}</div>` : "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function safeFont(value: string) {
  return value.replace(/[^A-Za-z0-9 ,'-]/g, "") || "Arial";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
