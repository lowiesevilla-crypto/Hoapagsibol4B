import "server-only";

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DocumentIssuedStatus } from "@prisma/client";
import { getAccessibleGeneratedDocument } from "@/lib/document-access";
import { locateTenantUpload, storageRoot, uploadDirectory } from "@/lib/storage";
import { DEFAULT_TENANT_SLUG } from "@/lib/tenant";
import { documentTypeLabel } from "@/lib/services/documents";

type AccessibleDocument = Awaited<ReturnType<typeof getAccessibleGeneratedDocument>>;
type IssuedRequest = AccessibleDocument["request"];
type IssuedVersion = NonNullable<IssuedRequest["versions"][number]>;

export type IssuedDocumentRenderSource = {
  access: AccessibleDocument;
  request: IssuedRequest;
  version: IssuedVersion;
  html: string;
  selfContainedHtml: string;
  title: string;
  filenameBase: string;
  warnings: string[];
};

type AssetResult = { dataUri: string | null; warning?: string };

const transparentPngDataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export async function getIssuedDocumentRenderSource(id: string, options?: { requireDownload?: boolean }): Promise<IssuedDocumentRenderSource> {
  const access = await getAccessibleGeneratedDocument(id, { requireDownload: options?.requireDownload });
  const version = access.request.versions[0] ?? null;
  if (!version || version.issuedStatus === DocumentIssuedStatus.REVOKED || version.revokedAt || !version.generatedContent.trim()) {
    throw new IssuedDocumentExportError("ISSUED_DOCUMENT_RENDER_SOURCE_MISSING", "The released immutable document is unavailable or revoked.");
  }
  const title = access.request.definition?.displayName || access.request.configuration?.displayName || documentTypeLabel(access.request.type);
  const embedded = await buildSelfContainedDocumentAssets(version.generatedContent, access.user.tenant.slug);
  return {
    access,
    request: access.request,
    version,
    html: version.generatedContent,
    selfContainedHtml: embedded.html,
    title,
    filenameBase: safeFilename(version.documentNumber || access.request.documentNumber || title),
    warnings: embedded.warnings,
  };
}

export async function buildSelfContainedDocumentAssets(html: string, tenantSlug: string) {
  const warnings: string[] = [];
  const attributePattern = /\s(src)=("([^"]*)"|'([^']*)')/gi;
  let output = await replaceAsync(html, attributePattern, async (match, attribute: string, quoted: string, doubleValue: string, singleValue: string) => {
    const value = doubleValue || singleValue || "";
    const resolved = await resolveDocumentAsset(value, tenantSlug);
    if (resolved.warning) warnings.push(resolved.warning);
    if (!resolved.dataUri) return match;
    return ` ${attribute}=${quoted[0]}${resolved.dataUri}${quoted[0]}`;
  });
  const cssUrlPattern = /url\(("([^"]*)"|'([^']*)'|([^)"']+))\)/gi;
  output = await replaceAsync(output, cssUrlPattern, async (match, _raw: string, doubleValue: string, singleValue: string, bareValue: string) => {
    const value = (doubleValue || singleValue || bareValue || "").trim();
    const resolved = await resolveDocumentAsset(value, tenantSlug);
    if (resolved.warning) warnings.push(resolved.warning);
    if (!resolved.dataUri) return match;
    return `url('${resolved.dataUri}')`;
  });
  return { html: output, warnings };
}

export function renderIssuedDocumentPrintHtml(source: IssuedDocumentRenderSource) {
  const body = extractFirst(source.selfContainedHtml, /<body[^>]*>([\s\S]*?)<\/body>/i) || source.selfContainedHtml;
  return `<style>${issuedDocumentPrintCss(source)}</style>${body}`;
}

export function renderIssuedDocumentFinalHtml(source: IssuedDocumentRenderSource) {
  const body = extractFirst(source.selfContainedHtml, /<body[^>]*>([\s\S]*?)<\/body>/i) || source.selfContainedHtml;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(`${source.title} ${source.version.documentNumber}`)}</title><style>${issuedDocumentPrintCss(source)}</style></head><body>${body}</body></html>`;
}

function issuedDocumentPrintCss(source: IssuedDocumentRenderSource) {
  const style = extractFirst(source.selfContainedHtml, /<style[^>]*>([\s\S]*?)<\/style>/i) || "";
  return `${style}
@page{size:A4 portrait;margin:0}html,body{margin:0!important;padding:0!important;overflow:visible!important;background:#fff!important;width:210mm!important;min-height:297mm!important}.document-page{position:relative!important;width:210mm!important;min-height:297mm!important;margin:0!important;box-shadow:none!important;overflow:hidden!important;background:#fff!important}.no-print,.toolbar,.modal-header,.preview-controls{display:none!important}@media print{html,body{overflow:visible!important;background:#fff!important;width:210mm!important;min-height:297mm!important}.document-page{margin:0!important;box-shadow:none!important;overflow:hidden!important}}`;
}

export async function renderIssuedDocumentPdf(source: IssuedDocumentRenderSource) {
  const html = renderIssuedDocumentFinalHtml(source);
  validateIssuedHtmlCompleteness(source, html);
  const { executablePath, args, headless } = await resolveBrowserRuntime();
  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath,
    args,
    headless,
    defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 1 },
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(45_000);
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: ["domcontentloaded", "load"], timeout: 45_000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 10_000 }).catch(() => undefined);
    const readiness = await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      const images = Array.from(document.images);
      const failed: string[] = [];
      await Promise.all(images.map((image) => image.complete && image.naturalWidth > 0 ? Promise.resolve() : new Promise<void>((resolve, reject) => {
        const source = image.currentSrc || image.src || image.alt || "document image";
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => { failed.push(source.slice(0, 120)); reject(new Error(`Image failed: ${source}`)); }, { once: true });
      })));
      const pageElement = document.querySelector(".document-page");
      return {
        imageCount: images.length,
        failed,
        hasDocumentPage: Boolean(pageElement),
        positionedCount: document.querySelectorAll('[style*="position:absolute"], .visual-section, .visual-layout [style*="left:"]').length,
        text: document.body.innerText,
      };
    });
    if (!readiness.hasDocumentPage) throw new IssuedDocumentExportError("ISSUED_DOCUMENT_PDF_INVALID", "The issued document page was not present before PDF export.");
    if (readiness.failed.length) throw new IssuedDocumentExportError("ISSUED_DOCUMENT_ASSET_RESOLUTION_FAILED", "One or more issued document assets failed before PDF export.");
    if (!readiness.text.includes(source.version.documentNumber)) throw new IssuedDocumentExportError("ISSUED_DOCUMENT_PDF_INVALID", "The issued document number was missing before PDF export.");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      scale: 1,
    });
    const buffer = Buffer.from(pdf);
    if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new IssuedDocumentExportError("ISSUED_DOCUMENT_PDF_INVALID", "The generated document is not a valid PDF.");
    return buffer;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function resolveBrowserRuntime() {
  const configured = process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || process.env.CHROME_EXECUTABLE_PATH?.trim();
  if (configured) return { executablePath: configured, args: browserArgs(), headless: true as const };
  const local = localChromeExecutablePath();
  if (local) return { executablePath: local, args: browserArgs(), headless: true as const };
  const chromium = (await import("@sparticuz/chromium")).default;
  const executablePath = await chromium.executablePath();
  if (!executablePath) throw new IssuedDocumentExportError("ISSUED_DOCUMENT_PDF_GENERATION_FAILED", "No supported Chromium executable is available for issued document PDF export.");
  return { executablePath, args: [...chromium.args, "--font-render-hinting=none"], headless: true as const };
}

function browserArgs() {
  return ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"];
}

function localChromeExecutablePath() {
  if (process.platform !== "win32") return null;
  const candidates = [
    path.join(process.env.ProgramFiles || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.ProgramFiles || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? null;
}

function validateIssuedHtmlCompleteness(source: IssuedDocumentRenderSource, html: string) {
  const text = htmlToText(html);
  const missing: string[] = [];
  if (!html.includes("document-page")) missing.push("document page");
  if (!text.includes(source.version.documentNumber)) missing.push("document number");
  if (!/<img\b/i.test(html)) missing.push("issued images");
  if (/PREVIEW QR|NOT VALID FOR VERIFICATION/i.test(html)) missing.push("official QR wording");
  if (source.request.definition?.code === "CERTIFICATE_OF_RESIDENCY" || /CERTIFICATE OF RESIDENCY/i.test(text)) {
    for (const label of ["CERTIFICATE OF RESIDENCY", "HOA OFFICERS", "SCAN TO VERIFY"]) if (!text.toUpperCase().includes(label)) missing.push(label);
  }
  if (missing.length) throw new IssuedDocumentExportError("ISSUED_DOCUMENT_PDF_INVALID", `Issued document HTML is incomplete for PDF export: ${missing.join(", ")}.`);
}

export function issuedDocumentHtmlFingerprint(source: IssuedDocumentRenderSource) {
  const html = renderIssuedDocumentFinalHtml(source);
  return {
    documentNumber: source.version.documentNumber,
    templateVersionId: source.version.templateVersionId,
    rendererName: source.version.rendererName,
    htmlHashInput: html,
    imageCount: (html.match(/<img\b/gi) ?? []).length,
    positionedCount: (html.match(/position:absolute/gi) ?? []).length,
    hasQr: /SCAN TO VERIFY/i.test(html),
    hasPreviewWarning: /PREVIEW QR|NOT VALID FOR VERIFICATION/i.test(html),
  };
}

async function resolveDocumentAsset(value: string, tenantSlug: string): Promise<AssetResult> {
  const source = value.trim();
  if (!source || source.startsWith("data:")) return { dataUri: source || null };
  if (/^https?:\/\//i.test(source) || source.startsWith("file:") || source.startsWith("\\\\")) return { dataUri: null, warning: `Rejected unsupported document asset source: ${source.slice(0, 80)}` };
  if (!source.startsWith("/")) return { dataUri: null };
  try {
    const filePath = await resolveLocalAssetPath(source, tenantSlug);
    if (!filePath) return { dataUri: null, warning: `Unsupported document asset path: ${source.slice(0, 80)}` };
    const mime = mimeForPath(filePath);
    if (!mime) return { dataUri: null, warning: `Unsupported document asset type: ${source.slice(0, 80)}` };
    const bytes = await readFile(filePath);
    return { dataUri: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` };
  } catch {
    return { dataUri: transparentPngDataUri, warning: `Document asset could not be resolved: ${source.slice(0, 80)}` };
  }
}

async function resolveLocalAssetPath(source: string, tenantSlug: string) {
  const segments = source.split("?")[0].split("#")[0].replace(/^\/+/, "").split("/").filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === ".." || segment.includes("\\") || segment.includes("/"))) return null;
  if (segments[0] === "uploads") {
    if (segments[1] === "settings") {
      const scoped = segments[2] === tenantSlug;
      if (!scoped && tenantSlug !== DEFAULT_TENANT_SLUG) throw new Error("Cross-tenant settings asset rejected.");
      return scoped ? locateTenantUpload(tenantSlug, "settings", ...segments.slice(3)) : path.join(uploadDirectory("settings"), ...segments.slice(2));
    }
    if (segments[1] === "organization-file") {
      const scoped = segments[2] === tenantSlug;
      if (!scoped && tenantSlug !== DEFAULT_TENANT_SLUG) throw new Error("Cross-tenant organization asset rejected.");
      const relative = scoped ? segments.slice(3) : segments.slice(2);
      if (!new Set(["photos", "signatures"]).has(relative[0])) throw new Error("Unsupported organization asset category.");
      return scoped ? locateTenantUpload(tenantSlug, "organization", ...relative) : path.join(uploadDirectory("organization"), ...relative);
    }
    if (segments[1] === "tenants") {
      if (segments[2] !== tenantSlug) throw new Error("Cross-tenant upload asset rejected.");
      const root = path.join(storageRoot(), "uploads");
      const filePath = path.resolve(root, ...segments.slice(1));
      if (!filePath.startsWith(`${root}${path.sep}`)) throw new Error("Invalid upload path.");
      return filePath;
    }
    const root = path.join(storageRoot(), "uploads");
    const filePath = path.resolve(root, ...segments.slice(1));
    if (!filePath.startsWith(`${root}${path.sep}`)) throw new Error("Invalid upload path.");
    return filePath;
  }
  return path.resolve(process.cwd(), "public", ...segments);
}

function htmlToText(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|h1|h2|h3|li|tr|figcaption)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function extractFirst(value: string, pattern: RegExp) {
  return value.match(pattern)?.[1] ?? null;
}

function safeFilename(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80) || "issued-document";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function mimeForPath(filePath: string) {
  return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" } as Record<string, string>)[path.extname(filePath).toLowerCase()] || "";
}

async function replaceAsync(value: string, pattern: RegExp, replacer: (...args: string[]) => Promise<string>) {
  const matches = [...value.matchAll(pattern)];
  const replacements = await Promise.all(matches.map((match) => replacer(...match as unknown as string[])));
  let output = value;
  for (let index = matches.length - 1; index >= 0; index--) {
    const match = matches[index];
    output = `${output.slice(0, match.index)}${replacements[index]}${output.slice((match.index ?? 0) + match[0].length)}`;
  }
  return output;
}

export class IssuedDocumentExportError extends Error {
  constructor(public readonly code: "ISSUED_DOCUMENT_RENDER_SOURCE_MISSING" | "ISSUED_DOCUMENT_ASSET_RESOLUTION_FAILED" | "ISSUED_DOCUMENT_PDF_GENERATION_FAILED" | "ISSUED_DOCUMENT_PDF_INVALID", message: string) {
    super(message);
    this.name = "IssuedDocumentExportError";
  }
}
